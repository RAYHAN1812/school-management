import { prisma } from '../config/prisma.js';
import { ADMIN_ROLES, ROLES } from '../config/roles.js';
import { AppError } from '../utils/AppError.js';
import { attachLogin, createLinkedUser, rethrowUnique, syncUserStatus } from '../utils/accounts.js';
import { audit } from '../utils/audit.js';
import { getPagination } from '../utils/http.js';
import { generateEmployeeCode, isEmployeeCodeTaken } from '../utils/sequences.js';
import { assertSubjectsExist } from './academic.service.js';

const duplicateEmployeeId = (code) => AppError.conflict('DUPLICATE_EMPLOYEE_ID', `Employee ID ${code} is already in use`);

// Salary is admin-only: strip it for everyone else.
const canSeeSalary = (actor) => ADMIN_ROLES.includes(actor.role.key);
function present(actor, record) {
  if (!record || canSeeSalary(actor)) return record;
  const { salary: _salary, ...rest } = record;
  return rest;
}

// Employment status drives the login: inactive/resigned staff can't sign in.
const loginShouldBeActive = (status) => (status === 'ACTIVE' ? true : status === 'ON_LEAVE' ? null : false);

function employeeWhere(schoolId, query) {
  return {
    schoolId,
    ...(query.status ? { status: query.status } : {}),
    ...(query.department ? { department: { equals: query.department, mode: 'insensitive' } } : {}),
    ...(query.search
      ? {
          OR: [
            { fullName: { contains: query.search, mode: 'insensitive' } },
            { employeeCode: { contains: query.search, mode: 'insensitive' } },
            { email: { contains: query.search, mode: 'insensitive' } },
            { phone: { contains: query.search } },
          ],
        }
      : {}),
  };
}

// ───────────────────────── Teachers ─────────────────────────

export async function listTeachers(schoolId, query, actor) {
  const { skip, take, meta } = getPagination(query);
  const where = {
    ...employeeWhere(schoolId, query),
    ...(query.subjectId ? { subjects: { some: { subjectId: query.subjectId } } } : {}),
  };
  const activeYear = await prisma.academicYear.findFirst({ where: { schoolId, status: 'ACTIVE' }, select: { id: true } });
  const inYear = activeYear ? { class: { academicYearId: activeYear.id } } : {};

  const [items, total] = await Promise.all([
    prisma.teacher.findMany({
      where,
      orderBy: { fullName: 'asc' },
      skip,
      take,
      include: {
        subjects: { include: { subject: { select: { id: true, name: true, code: true } } } },
        // Workload in the current academic year.
        _count: { select: { classSubjects: { where: inYear }, sectionsAsClassTchr: { where: inYear } } },
        user: { select: { id: true, status: true } },
      },
    }),
    prisma.teacher.count({ where }),
  ]);
  return { items: items.map((t) => present(actor, t)), meta: meta(total) };
}

export async function getTeacher(schoolId, id, actor) {
  const teacher = await prisma.teacher.findFirst({
    where: { id, schoolId },
    include: {
      subjects: { include: { subject: true } },
      classSubjects: {
        include: {
          subject: { select: { id: true, name: true, code: true } },
          class: { select: { id: true, name: true, academicYear: { select: { id: true, name: true, status: true } } } },
        },
      },
      sectionsAsClassTchr: {
        include: { class: { select: { id: true, name: true, academicYear: { select: { id: true, name: true, status: true } } } } },
      },
      user: { select: { id: true, email: true, username: true, status: true, lastLoginAt: true } },
      _count: { select: { timetables: true, assignments: true } },
    },
  });
  if (!teacher) throw AppError.notFound('TEACHER_NOT_FOUND', 'Teacher not found');
  return present(actor, teacher);
}

export async function createTeacher(schoolId, data, actor, ctx) {
  const { subjectIds, account, employeeCode, ...profile } = data;
  await assertSubjectsExist(schoolId, subjectIds);

  try {
    const teacher = await prisma.$transaction(
      async (tx) => {
        let code = employeeCode;
        if (code) {
          if (await isEmployeeCodeTaken(tx, schoolId, code)) throw duplicateEmployeeId(code);
        } else {
          code = await generateEmployeeCode(tx, schoolId);
        }
        const user = account
          ? await createLinkedUser(tx, { schoolId, role: ROLES.TEACHER, email: profile.email, fullName: profile.fullName, phone: profile.phone, ...account })
          : null;
        return tx.teacher.create({
          data: {
            ...profile,
            schoolId,
            employeeCode: code,
            userId: user?.id ?? null,
            subjects: { create: subjectIds.map((subjectId) => ({ subjectId })) },
          },
        });
      },
      { timeout: 15_000 },
    );
    await audit({ action: 'TEACHER_CREATED', entity: 'Teacher', entityId: teacher.id, actor, schoolId, metadata: { employeeCode: teacher.employeeCode }, ...ctx });
    return getTeacher(schoolId, teacher.id, actor);
  } catch (err) {
    return rethrowUnique(err, {
      employeeCode: duplicateEmployeeId(employeeCode ?? ''),
      email: AppError.conflict('EMAIL_ALREADY_EXISTS', 'A login account already exists for that email'),
    });
  }
}

export async function updateTeacher(schoolId, id, data, actor, ctx) {
  const teacher = await prisma.teacher.findFirst({ where: { id, schoolId } });
  if (!teacher) throw AppError.notFound('TEACHER_NOT_FOUND', 'Teacher not found');
  const { subjectIds, ...fields } = data;

  if (fields.employeeCode && fields.employeeCode !== teacher.employeeCode) {
    if (await isEmployeeCodeTaken(prisma, schoolId, fields.employeeCode, { exceptTeacherId: id })) {
      throw duplicateEmployeeId(fields.employeeCode);
    }
  }
  if (subjectIds) await assertSubjectsExist(schoolId, subjectIds);

  try {
    await prisma.$transaction(async (tx) => {
      await tx.teacher.update({ where: { id }, data: fields });
      if (subjectIds) {
        await tx.teacherSubject.deleteMany({ where: { teacherId: id } });
        await tx.teacherSubject.createMany({ data: subjectIds.map((subjectId) => ({ teacherId: id, subjectId })) });
      }
      if (fields.status && fields.status !== teacher.status) {
        const active = loginShouldBeActive(fields.status);
        if (active !== null) await syncUserStatus(tx, teacher.userId, active);
      }
      // Keep the login's display details in step with the profile.
      if (teacher.userId && (fields.fullName || fields.phone)) {
        await tx.user.update({
          where: { id: teacher.userId },
          data: { ...(fields.fullName ? { fullName: fields.fullName } : {}), ...(fields.phone ? { phone: fields.phone } : {}) },
        });
      }
    });
  } catch (err) {
    rethrowUnique(err, { employeeCode: duplicateEmployeeId(fields.employeeCode ?? '') });
  }

  await audit({
    action: fields.status && fields.status !== teacher.status ? 'TEACHER_STATUS_CHANGED' : 'TEACHER_UPDATED',
    entity: 'Teacher',
    entityId: id,
    actor,
    schoolId,
    // Never write salary amounts into the audit log.
    metadata: { fields: Object.keys(data), ...(fields.status ? { from: teacher.status, to: fields.status } : {}) },
    ...ctx,
  });
  return getTeacher(schoolId, id, actor);
}

export async function createTeacherLogin(schoolId, teacherId, account, actor, ctx) {
  const user = await attachLogin(prisma, {
    model: 'teacher',
    schoolId,
    id: teacherId,
    role: ROLES.TEACHER,
    account,
    notFound: AppError.notFound('TEACHER_NOT_FOUND', 'Teacher not found'),
  });
  await audit({ action: 'USER_CREATED', entity: 'User', entityId: user.id, actor, schoolId, metadata: { role: ROLES.TEACHER, teacherId }, ...ctx });
  return getTeacher(schoolId, teacherId, actor);
}

// ───────────────────────── Non-teaching staff ─────────────────────────

export async function listStaff(schoolId, query) {
  const { skip, take, meta } = getPagination(query);
  const where = employeeWhere(schoolId, query);
  const [items, total] = await Promise.all([
    prisma.staff.findMany({ where, orderBy: { fullName: 'asc' }, skip, take }),
    prisma.staff.count({ where }),
  ]);
  return { items, meta: meta(total) };
}

export async function getStaff(schoolId, id) {
  const staff = await prisma.staff.findFirst({ where: { id, schoolId } });
  if (!staff) throw AppError.notFound('STAFF_NOT_FOUND', 'Staff member not found');
  return staff;
}

export async function createStaff(schoolId, data, actor, ctx) {
  const { employeeCode, ...profile } = data;
  try {
    const staff = await prisma.$transaction(async (tx) => {
      let code = employeeCode;
      if (code) {
        if (await isEmployeeCodeTaken(tx, schoolId, code)) throw duplicateEmployeeId(code);
      } else {
        code = await generateEmployeeCode(tx, schoolId);
      }
      return tx.staff.create({ data: { ...profile, schoolId, employeeCode: code } });
    });
    await audit({ action: 'STAFF_CREATED', entity: 'Staff', entityId: staff.id, actor, schoolId, metadata: { employeeCode: staff.employeeCode }, ...ctx });
    return staff;
  } catch (err) {
    return rethrowUnique(err, { employeeCode: duplicateEmployeeId(employeeCode ?? '') });
  }
}

export async function updateStaff(schoolId, id, data, actor, ctx) {
  const staff = await getStaff(schoolId, id);
  if (data.employeeCode && data.employeeCode !== staff.employeeCode) {
    if (await isEmployeeCodeTaken(prisma, schoolId, data.employeeCode, { exceptStaffId: id })) {
      throw duplicateEmployeeId(data.employeeCode);
    }
  }
  const updated = await prisma.staff.update({ where: { id }, data }).catch((err) =>
    rethrowUnique(err, { employeeCode: duplicateEmployeeId(data.employeeCode ?? '') }),
  );
  await audit({ action: 'STAFF_UPDATED', entity: 'Staff', entityId: id, actor, schoolId, metadata: { fields: Object.keys(data) }, ...ctx });
  return updated;
}
