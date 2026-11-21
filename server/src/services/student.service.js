import { prisma } from '../config/prisma.js';
import { ROLES } from '../config/roles.js';
import { AppError } from '../utils/AppError.js';
import { attachLogin, createLinkedUser, rethrowUnique, syncUserStatus } from '../utils/accounts.js';
import { audit } from '../utils/audit.js';
import { getPagination } from '../utils/http.js';
import { generateStudentCode } from '../utils/sequences.js';
import { assertCapacity, findSectionOrThrow, nextRollNumber, resolveAcademicYear } from './academic.service.js';
import { scopeToEnrollmentWhere, teacherScope } from './access.service.js';

const duplicateStudentId = (code) => AppError.conflict('DUPLICATE_STUDENT_ID', `Student ID ${code} is already in use`);
const duplicateRoll = (roll) => AppError.conflict('DUPLICATE_ROLL_NUMBER', `Roll ${roll} is already taken in this section`);

const enrollmentInclude = {
  class: { select: { id: true, name: true } },
  section: { select: { id: true, name: true } },
  academicYear: { select: { id: true, name: true, status: true } },
};

// ───────────────────────── Queries ─────────────────────────

async function buildListWhere(schoolId, query, actor) {
  // A new school may have no active year yet: still list its students (unenrolled).
  const year = query.academicYearId
    ? await resolveAcademicYear(schoolId, query.academicYearId)
    : await resolveAcademicYear(schoolId).catch(() => null);
  const scope = year ? await teacherScope(actor, schoolId, year.id) : null;
  if (!year && actor.role.key === ROLES.TEACHER) {
    return { where: { id: '__none__' }, year: null }; // no classes without a year
  }

  const enrollmentFilters = [];
  if (query.classId) enrollmentFilters.push({ classId: query.classId });
  if (query.sectionId) enrollmentFilters.push({ sectionId: query.sectionId });
  if (scope) enrollmentFilters.push(scopeToEnrollmentWhere(scope));

  const where = {
    schoolId,
    deletedAt: null,
    ...(query.status && query.status !== 'ALL' ? { status: query.status } : {}),
    ...(query.gender ? { gender: query.gender } : {}),
    ...(query.search
      ? {
          OR: [
            { fullName: { contains: query.search, mode: 'insensitive' } },
            { studentCode: { contains: query.search, mode: 'insensitive' } },
            { phone: { contains: query.search } },
          ],
        }
      : {}),
    ...(enrollmentFilters.length
      ? { enrollments: { some: { ...(year ? { academicYearId: year.id } : {}), AND: enrollmentFilters } } }
      : {}),
  };
  return { where, year };
}

export async function listStudents(schoolId, query, actor) {
  const { skip, take, meta } = getPagination(query);
  const { where, year } = await buildListWhere(schoolId, query, actor);

  const [items, total] = await Promise.all([
    prisma.student.findMany({
      where,
      orderBy: [{ fullName: 'asc' }],
      skip,
      take,
      include: {
        enrollments: { where: year ? { academicYearId: year.id } : { status: 'ACTIVE' }, include: enrollmentInclude, take: 1 },
        guardians: { where: { isPrimary: true }, include: { guardian: { select: { fullName: true, phone: true } } }, take: 1 },
      },
    }),
    prisma.student.count({ where }),
  ]);

  return {
    items: items.map(({ enrollments, guardians, ...s }) => ({
      ...s,
      enrollment: enrollments[0] ?? null,
      primaryGuardian: guardians[0] ? { ...guardians[0].guardian, relationship: guardians[0].relationship } : null,
    })),
    meta: { ...meta(total), academicYear: year ? { id: year.id, name: year.name } : null },
  };
}

// CSV cells: quote everything and neutralise spreadsheet formulas (=, +, -, @).
function csvCell(value) {
  let s = value == null ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

const day = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');

export async function exportStudentsCsv(schoolId, query, actor) {
  const { items } = await listStudents(schoolId, { ...query, page: 1, limit: 100 }, actor).then(async (first) => {
    // Fetch every page (bounded) so exports aren't capped at the page size.
    const all = [...first.items];
    for (let page = 2; page <= Math.min(first.meta.totalPages, 50); page += 1) {
      const next = await listStudents(schoolId, { ...query, page, limit: 100 }, actor);
      all.push(...next.items);
    }
    return { items: all };
  });

  const header = [
    'Student ID', 'Full name', 'Class', 'Section', 'Roll', 'Gender', 'Date of birth', 'Blood group',
    'Phone', 'Email', 'Primary guardian', 'Guardian phone', 'Admission date', 'Status',
  ];
  const rows = items.map((s) => [
    s.studentCode, s.fullName, s.enrollment?.class.name, s.enrollment?.section.name, s.enrollment?.rollNumber,
    s.gender, day(s.dateOfBirth), s.bloodGroup, s.phone, s.email, s.primaryGuardian?.fullName,
    s.primaryGuardian?.phone, day(s.admissionDate), s.status,
  ]);
  // BOM so Excel opens UTF-8 (e.g. Bangla names) correctly.
  return `﻿${[header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

export async function getStudent(schoolId, id, actor) {
  const student = await prisma.student.findFirst({
    where: { id, schoolId, deletedAt: null },
    include: {
      enrollments: { include: enrollmentInclude, orderBy: { enrolledAt: 'desc' } },
      guardians: {
        orderBy: { isPrimary: 'desc' },
        include: { guardian: { include: { user: { select: { id: true, email: true, status: true } } } } },
      },
      user: { select: { id: true, email: true, username: true, status: true, lastLoginAt: true } },
    },
  });
  if (!student) throw AppError.notFound('STUDENT_NOT_FOUND', 'Student not found');

  if (actor.role.key === ROLES.TEACHER) {
    const year = await resolveAcademicYear(schoolId);
    const scope = await teacherScope(actor, schoolId, year.id);
    const visible = student.enrollments.some(
      (e) => e.academicYear.id === year.id && (scope.classIds.includes(e.class.id) || scope.sectionIds.includes(e.section.id)),
    );
    if (!visible) throw AppError.forbidden('FORBIDDEN', 'This student is not in any of your classes');
  }
  return student;
}

// ───────────────────────── Commands ─────────────────────────

async function linkGuardian(tx, schoolId, studentId, g) {
  let guardianId = g.guardianId;
  if (guardianId) {
    const existing = await tx.guardian.findFirst({ where: { id: guardianId, schoolId } });
    if (!existing) throw AppError.notFound('GUARDIAN_NOT_FOUND', 'Guardian not found');
    if (g.account && !existing.userId) {
      const user = await createLinkedUser(tx, {
        schoolId, role: ROLES.PARENT, email: existing.email, fullName: existing.fullName, phone: existing.phone, ...g.account,
      });
      await tx.guardian.update({ where: { id: guardianId }, data: { userId: user.id } });
    }
  } else {
    const user = g.account
      ? await createLinkedUser(tx, {
          schoolId, role: ROLES.PARENT, email: g.guardian.email, fullName: g.guardian.fullName, phone: g.guardian.phone, ...g.account,
        })
      : null;
    const created = await tx.guardian.create({ data: { ...g.guardian, schoolId, userId: user?.id ?? null } });
    guardianId = created.id;
  }

  const already = await tx.studentGuardian.findUnique({ where: { studentId_guardianId: { studentId, guardianId } } });
  if (already) throw AppError.conflict('GUARDIAN_ALREADY_LINKED', 'This guardian is already linked to the student');
  if (g.isPrimary) await tx.studentGuardian.updateMany({ where: { studentId }, data: { isPrimary: false } });
  await tx.studentGuardian.create({ data: { studentId, guardianId, relationship: g.relationship, isPrimary: g.isPrimary } });
}

export async function createStudent(schoolId, data, actor, ctx) {
  const { enrollment, guardians, account, studentCode, ...profile } = data;
  // Exactly one primary guardian: the first flagged one, else the first.
  const primaryIndex = Math.max(0, guardians.findIndex((g) => g.isPrimary));
  const normalizedGuardians = guardians.map((g, i) => ({ ...g, isPrimary: i === primaryIndex }));

  try {
    const student = await prisma.$transaction(
      async (tx) => {
        const section = await findSectionOrThrow(schoolId, enrollment.classId, enrollment.sectionId, tx).catch(async (err) => {
          // Distinguish "no such class" (spec: 404 CLASS_NOT_FOUND) from a wrong section.
          const klass = await tx.class.findFirst({ where: { id: enrollment.classId, schoolId } });
          if (!klass) throw AppError.notFound('CLASS_NOT_FOUND', 'Class not found');
          throw err;
        });

        let code = studentCode;
        if (code) {
          const taken = await tx.student.findUnique({ where: { schoolId_studentCode: { schoolId, studentCode: code } } });
          if (taken) throw duplicateStudentId(code);
        } else {
          code = await generateStudentCode(tx, schoolId, profile.admissionDate);
        }

        let roll = enrollment.rollNumber;
        if (roll) {
          const taken = await tx.enrollment.findUnique({ where: { sectionId_rollNumber: { sectionId: section.id, rollNumber: roll } } });
          if (taken) throw duplicateRoll(roll);
        } else {
          roll = await nextRollNumber(section.id, tx);
        }
        await assertCapacity(section, 1, tx);

        const user = account
          ? await createLinkedUser(tx, { schoolId, role: ROLES.STUDENT, email: profile.email, fullName: profile.fullName, phone: profile.phone, ...account })
          : null;

        const created = await tx.student.create({
          data: {
            ...profile,
            schoolId,
            studentCode: code,
            userId: user?.id ?? null,
            enrollments: {
              create: {
                schoolId,
                academicYearId: section.class.academicYearId,
                classId: section.classId,
                sectionId: section.id,
                rollNumber: roll,
              },
            },
          },
        });
        for (const g of normalizedGuardians) await linkGuardian(tx, schoolId, created.id, g);
        return created;
      },
      { timeout: 15_000 },
    );

    await audit({ action: 'STUDENT_CREATED', entity: 'Student', entityId: student.id, actor, schoolId, metadata: { studentCode: student.studentCode }, ...ctx });
    return getStudent(schoolId, student.id, actor);
  } catch (err) {
    return rethrowUnique(err, {
      studentCode: duplicateStudentId(studentCode ?? ''),
      rollNumber: duplicateRoll(enrollment.rollNumber ?? ''),
      email: AppError.conflict('EMAIL_ALREADY_EXISTS', 'A login account already exists for that email'),
    });
  }
}

export async function updateStudent(schoolId, id, data, actor, ctx) {
  const student = await prisma.student.findFirst({ where: { id, schoolId, deletedAt: null } });
  if (!student) throw AppError.notFound('STUDENT_NOT_FOUND', 'Student not found');

  if (data.studentCode && data.studentCode !== student.studentCode) {
    const taken = await prisma.student.findUnique({ where: { schoolId_studentCode: { schoolId, studentCode: data.studentCode } } });
    if (taken) throw duplicateStudentId(data.studentCode);
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.student.update({ where: { id }, data });
      if (data.status && data.status !== student.status) await syncUserStatus(tx, student.userId, data.status === 'ACTIVE');
    });
  } catch (err) {
    rethrowUnique(err, { studentCode: duplicateStudentId(data.studentCode ?? '') });
  }
  await audit({
    action: data.status && data.status !== student.status ? 'STUDENT_STATUS_CHANGED' : 'STUDENT_UPDATED',
    entity: 'Student',
    entityId: id,
    actor,
    schoolId,
    metadata: { fields: Object.keys(data), ...(data.status ? { from: student.status, to: data.status } : {}) },
    ...ctx,
  });
  return getStudent(schoolId, id, actor);
}

/** DELETE /students/:id — soft: the record stays for history, but leaves active lists. */
export function deactivateStudent(schoolId, id, actor, ctx) {
  return updateStudent(schoolId, id, { status: 'INACTIVE' }, actor, ctx);
}

/**
 * Put the student in a class/section. Within the target class's academic year
 * this moves the existing enrollment (a transfer); otherwise it enrolls them.
 */
export async function setEnrollment(schoolId, studentId, data, actor, ctx) {
  const student = await prisma.student.findFirst({ where: { id: studentId, schoolId, deletedAt: null } });
  if (!student) throw AppError.notFound('STUDENT_NOT_FOUND', 'Student not found');
  if (student.status !== 'ACTIVE') {
    throw AppError.conflict('STUDENT_INACTIVE', 'Only active students can be assigned to a class');
  }

  const klass = await prisma.class.findFirst({ where: { id: data.classId, schoolId } });
  if (!klass) throw AppError.notFound('CLASS_NOT_FOUND', 'Class not found');
  const section = await findSectionOrThrow(schoolId, data.classId, data.sectionId);

  const current = await prisma.enrollment.findUnique({
    where: { studentId_academicYearId: { studentId, academicYearId: klass.academicYearId } },
  });
  if (current && current.status !== 'ACTIVE') {
    throw AppError.conflict('ALREADY_ENROLLED', 'This student has already completed or left that academic year');
  }

  const sameSection = current?.sectionId === section.id;
  let roll = data.rollNumber ?? (sameSection ? current.rollNumber : undefined);
  if (roll) {
    const taken = await prisma.enrollment.findUnique({ where: { sectionId_rollNumber: { sectionId: section.id, rollNumber: roll } } });
    if (taken && taken.id !== current?.id) throw duplicateRoll(roll);
  } else {
    roll = await nextRollNumber(section.id);
  }
  if (!sameSection) await assertCapacity(section, 1, prisma, current?.id);

  try {
    const enrollment = current
      ? await prisma.enrollment.update({ where: { id: current.id }, data: { classId: klass.id, sectionId: section.id, rollNumber: roll } })
      : await prisma.enrollment.create({
          data: { schoolId, studentId, academicYearId: klass.academicYearId, classId: klass.id, sectionId: section.id, rollNumber: roll },
        });
    await audit({
      action: current ? 'STUDENT_TRANSFERRED' : 'STUDENT_ENROLLED',
      entity: 'Student',
      entityId: studentId,
      actor,
      schoolId,
      metadata: { from: current ? { classId: current.classId, sectionId: current.sectionId } : null, to: { classId: klass.id, sectionId: section.id, roll } },
      ...ctx,
    });
    return enrollment;
  } catch (err) {
    return rethrowUnique(err, { rollNumber: duplicateRoll(roll) });
  }
}

export async function addGuardian(schoolId, studentId, data, actor, ctx) {
  const student = await prisma.student.findFirst({ where: { id: studentId, schoolId, deletedAt: null } });
  if (!student) throw AppError.notFound('STUDENT_NOT_FOUND', 'Student not found');
  await prisma.$transaction((tx) => linkGuardian(tx, schoolId, studentId, data));
  await audit({ action: 'GUARDIAN_LINKED', entity: 'Student', entityId: studentId, actor, schoolId, ...ctx });
  return getStudent(schoolId, studentId, actor);
}

export async function removeGuardian(schoolId, studentId, guardianId, actor, ctx) {
  const links = await prisma.studentGuardian.findMany({ where: { studentId, student: { schoolId } } });
  const link = links.find((l) => l.guardianId === guardianId);
  if (!link) throw AppError.notFound('GUARDIAN_NOT_FOUND', 'Guardian is not linked to this student');
  if (links.length === 1) throw AppError.badRequest('GUARDIAN_REQUIRED', 'A student must have at least one guardian');

  await prisma.$transaction(async (tx) => {
    await tx.studentGuardian.delete({ where: { studentId_guardianId: { studentId, guardianId } } });
    if (link.isPrimary) {
      const next = links.find((l) => l.guardianId !== guardianId);
      await tx.studentGuardian.update({
        where: { studentId_guardianId: { studentId, guardianId: next.guardianId } },
        data: { isPrimary: true },
      });
    }
  });
  await audit({ action: 'GUARDIAN_UNLINKED', entity: 'Student', entityId: studentId, actor, schoolId, metadata: { guardianId }, ...ctx });
  return getStudent(schoolId, studentId, actor);
}

export async function createStudentLogin(schoolId, studentId, account, actor, ctx) {
  const user = await attachLogin(prisma, {
    model: 'student',
    schoolId,
    id: studentId,
    role: ROLES.STUDENT,
    account,
    notFound: AppError.notFound('STUDENT_NOT_FOUND', 'Student not found'),
  });
  await audit({ action: 'USER_CREATED', entity: 'User', entityId: user.id, actor, schoolId, metadata: { role: ROLES.STUDENT, studentId }, ...ctx });
  return getStudent(schoolId, studentId, actor);
}

/** Search guardians to link siblings to an existing parent. */
export function listGuardians(schoolId, { search }) {
  return prisma.guardian.findMany({
    where: {
      schoolId,
      ...(search
        ? {
            OR: [
              { fullName: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search } },
              { email: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    orderBy: { fullName: 'asc' },
    take: 20,
    include: {
      students: { include: { student: { select: { id: true, fullName: true, studentCode: true } } } },
      user: { select: { id: true } },
    },
  });
}
