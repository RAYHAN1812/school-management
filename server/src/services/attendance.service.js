import { prisma } from '../config/prisma.js';
import { AppError } from '../utils/AppError.js';
import { rethrowUnique } from '../utils/accounts.js';
import { audit } from '../utils/audit.js';
import { attendancePercentage, countStatuses, round2 } from '../utils/calculations.js';
import { findSectionOrThrow, resolveAcademicYear } from './academic.service.js';
import { assertCanManageSection, assertCanViewStudent, isAdmin, teacherScope } from './access.service.js';

const alreadyTaken = (names) =>
  new AppError(409, 'ATTENDANCE_ALREADY_EXISTS', 'Attendance has already been recorded for this date', { students: names });

const day = (d) => new Date(d).toISOString().slice(0, 10);

function assertWithinYear(date, year) {
  if (date < year.startDate || date > year.endDate) {
    throw AppError.badRequest('DATE_OUTSIDE_ACADEMIC_YEAR', `The date must fall within academic year ${year.name}`);
  }
}

async function loadSection(schoolId, classId, sectionId, actor) {
  const section = await findSectionOrThrow(schoolId, classId, sectionId).catch(async (err) => {
    const klass = await prisma.class.findFirst({ where: { id: classId, schoolId } });
    if (!klass) throw AppError.notFound('CLASS_NOT_FOUND', 'Class not found');
    throw err;
  });
  await assertCanManageSection(actor, schoolId, section);
  const year = await prisma.academicYear.findUnique({ where: { id: section.class.academicYearId } });
  return { section, year };
}

/** Active students in the section, by roll. */
function roster(sectionId) {
  return prisma.enrollment.findMany({
    where: { sectionId, status: 'ACTIVE', student: { deletedAt: null, status: 'ACTIVE' } },
    orderBy: { rollNumber: 'asc' },
    include: { student: { select: { id: true, fullName: true, studentCode: true } } },
  });
}

// ───────────────────────── Marking ─────────────────────────

/** Everything the "take attendance" screen needs for one section and date. */
export async function getSheet(schoolId, { classId, sectionId, date }, actor) {
  const { section, year } = await loadSection(schoolId, classId, sectionId, actor);
  assertWithinYear(date, year);
  const [students, records] = await Promise.all([
    roster(section.id),
    prisma.attendance.findMany({ where: { sectionId: section.id, date } }),
  ]);
  const byStudent = new Map(records.map((r) => [r.studentId, r]));
  return {
    date: day(date),
    class: { id: section.class.id, name: section.class.name },
    section: { id: section.id, name: section.name },
    taken: records.length > 0,
    students: students.map((e) => {
      const r = byStudent.get(e.studentId);
      return {
        studentId: e.studentId,
        fullName: e.student.fullName,
        studentCode: e.student.studentCode,
        rollNumber: e.rollNumber,
        attendanceId: r?.id ?? null,
        status: r?.status ?? null,
        remarks: r?.remarks ?? null,
      };
    }),
  };
}

async function validateRecords(section, records) {
  const enrolled = new Set((await roster(section.id)).map((e) => e.studentId));
  const outsiders = records.filter((r) => !enrolled.has(r.studentId));
  if (outsiders.length) {
    throw AppError.badRequest('STUDENT_NOT_IN_SECTION', 'Some students are not active members of this section', {
      studentIds: outsiders.map((r) => r.studentId),
    });
  }
}

/** First submission for a day. Re-submitting the same day → 409 ATTENDANCE_ALREADY_EXISTS. */
export async function recordAttendance(schoolId, data, actor, ctx) {
  const { section, year } = await loadSection(schoolId, data.classId, data.sectionId, actor);
  assertWithinYear(data.date, year);
  await validateRecords(section, data.records);

  const existing = await prisma.attendance.findMany({
    where: { classId: section.classId, date: data.date, studentId: { in: data.records.map((r) => r.studentId) } },
    include: { student: { select: { fullName: true } } },
  });
  if (existing.length) throw alreadyTaken(existing.map((e) => e.student.fullName));

  try {
    await prisma.attendance.createMany({
      data: data.records.map((r) => ({
        schoolId,
        studentId: r.studentId,
        classId: section.classId,
        sectionId: section.id,
        date: data.date,
        status: r.status,
        remarks: r.remarks ?? null,
        markedById: actor.id,
      })),
    });
  } catch (err) {
    rethrowUnique(err, { studentId: alreadyTaken([]) });
  }
  await audit({
    action: 'ATTENDANCE_RECORDED',
    entity: 'Section',
    entityId: section.id,
    actor,
    schoolId,
    metadata: { date: day(data.date), count: data.records.length },
    ...ctx,
  });
  return { saved: data.records.length, date: day(data.date) };
}

/** Correct a day that was already taken (also adds students who were missing). */
export async function updateAttendanceDay(schoolId, data, actor, ctx) {
  const { section, year } = await loadSection(schoolId, data.classId, data.sectionId, actor);
  assertWithinYear(data.date, year);
  await validateRecords(section, data.records);

  const result = await prisma.$transaction(async (tx) => {
    let updated = 0;
    let created = 0;
    for (const r of data.records) {
      const key = { studentId_classId_date: { studentId: r.studentId, classId: section.classId, date: data.date } };
      const before = await tx.attendance.findUnique({ where: key });
      if (before) {
        if (before.status !== r.status || (before.remarks ?? null) !== (r.remarks ?? null)) {
          await tx.attendance.update({ where: key, data: { status: r.status, remarks: r.remarks ?? null, markedById: actor.id } });
          updated += 1;
        }
      } else {
        await tx.attendance.create({
          data: {
            schoolId,
            studentId: r.studentId,
            classId: section.classId,
            sectionId: section.id,
            date: data.date,
            status: r.status,
            remarks: r.remarks ?? null,
            markedById: actor.id,
          },
        });
        created += 1;
      }
    }
    return { updated, created };
  });
  await audit({
    action: 'ATTENDANCE_UPDATED',
    entity: 'Section',
    entityId: section.id,
    actor,
    schoolId,
    metadata: { date: day(data.date), ...result },
    ...ctx,
  });
  return { ...result, date: day(data.date) };
}

export async function updateAttendanceRecord(schoolId, id, data, actor, ctx) {
  const record = await prisma.attendance.findFirst({ where: { id, schoolId }, include: { section: { include: { class: true } } } });
  if (!record) throw AppError.notFound('ATTENDANCE_NOT_FOUND', 'Attendance record not found');
  await assertCanManageSection(actor, schoolId, record.section);
  const updated = await prisma.attendance.update({
    where: { id },
    data: { status: data.status, remarks: data.remarks ?? null, markedById: actor.id },
  });
  await audit({
    action: 'ATTENDANCE_UPDATED',
    entity: 'Attendance',
    entityId: id,
    actor,
    schoolId,
    metadata: { from: record.status, to: data.status },
    ...ctx,
  });
  return updated;
}

// ───────────────────────── Reading ─────────────────────────

export async function listAttendance(schoolId, query, actor) {
  const range = query.from || query.to ? { date: { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lte: query.to } : {}) } } : {};
  let where;
  if (query.studentId) {
    await assertCanViewStudent(actor, schoolId, query.studentId);
    where = { schoolId, studentId: query.studentId, ...range };
  } else {
    const section = await prisma.section.findFirst({ where: { id: query.sectionId, class: { schoolId } }, include: { class: true } });
    if (!section) throw AppError.notFound('SECTION_NOT_FOUND', 'Section not found');
    await assertCanManageSection(actor, schoolId, section);
    where = { schoolId, sectionId: section.id, ...range };
  }
  return prisma.attendance.findMany({
    where,
    orderBy: [{ date: 'desc' }],
    take: 1000,
    include: { student: { select: { id: true, fullName: true, studentCode: true } } },
  });
}

/** One day for a class (optionally one section): counts and who was absent. */
async function dailyReport(schoolId, { classId, sectionId, date }, actor) {
  const klass = await prisma.class.findFirst({ where: { id: classId, schoolId }, include: { sections: true } });
  if (!klass) throw AppError.notFound('CLASS_NOT_FOUND', 'Class not found');
  const sections = sectionId ? klass.sections.filter((s) => s.id === sectionId) : klass.sections;
  if (sectionId && sections.length === 0) throw AppError.notFound('SECTION_NOT_FOUND', 'Section not found in this class');
  if (!isAdmin(actor)) {
    for (const s of sections) await assertCanManageSection(actor, schoolId, { ...s, class: klass });
  }

  const rows = [];
  for (const s of sections) {
    const [students, records] = await Promise.all([roster(s.id), prisma.attendance.findMany({ where: { sectionId: s.id, date } })]);
    const byStudent = new Map(records.map((r) => [r.studentId, r]));
    const counts = countStatuses(records);
    rows.push({
      section: { id: s.id, name: s.name },
      enrolled: students.length,
      marked: records.length,
      ...counts,
      notPresent: students
        .filter((e) => ['ABSENT', 'LEAVE'].includes(byStudent.get(e.studentId)?.status))
        .map((e) => ({ studentId: e.studentId, fullName: e.student.fullName, rollNumber: e.rollNumber, status: byStudent.get(e.studentId).status })),
    });
  }
  const sum = (k) => rows.reduce((a, r) => a + r[k], 0);
  const totals = { enrolled: sum('enrolled'), marked: sum('marked'), present: sum('present'), late: sum('late'), absent: sum('absent'), leave: sum('leave') };
  return {
    type: 'daily',
    date: day(date),
    class: { id: klass.id, name: klass.name },
    sections: rows.sort((a, b) => a.section.name.localeCompare(b.section.name)),
    totals: { ...totals, percentage: attendancePercentage(totals) },
  };
}

/** One month for a section: per-student counts and attendance %. */
async function monthlyReport(schoolId, { classId, sectionId, month }, actor) {
  const { section } = await loadSection(schoolId, classId, sectionId, actor);
  const [y, m] = month.split('-').map(Number);
  const from = new Date(Date.UTC(y, m - 1, 1));
  const to = new Date(Date.UTC(y, m, 0));
  const [students, records] = await Promise.all([
    roster(section.id),
    prisma.attendance.findMany({ where: { sectionId: section.id, date: { gte: from, lte: to } } }),
  ]);
  const schoolDays = [...new Set(records.map((r) => day(r.date)))].sort();
  const byStudent = new Map();
  for (const r of records) byStudent.set(r.studentId, [...(byStudent.get(r.studentId) ?? []), r]);

  const rows = students.map((e) => ({
    studentId: e.studentId,
    fullName: e.student.fullName,
    studentCode: e.student.studentCode,
    rollNumber: e.rollNumber,
    ...countStatuses(byStudent.get(e.studentId) ?? []),
  }));
  const withData = rows.filter((r) => r.percentage !== null);
  return {
    type: 'monthly',
    month,
    class: { id: section.class.id, name: section.class.name },
    section: { id: section.id, name: section.name },
    schoolDays: schoolDays.length,
    dates: schoolDays,
    students: rows,
    averagePercentage: withData.length ? round2(withData.reduce((a, r) => a + r.percentage, 0) / withData.length) : null,
  };
}

export function attendanceReport(schoolId, query, actor) {
  return query.type === 'monthly' ? monthlyReport(schoolId, query, actor) : dailyReport(schoolId, query, actor);
}

function csvCell(value) {
  let s = value == null ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export function reportToCsv(report) {
  let rows;
  if (report.type === 'monthly') {
    rows = [
      [`${report.class.name} ${report.section.name} — ${report.month} — ${report.schoolDays} school days`],
      ['Roll', 'Student ID', 'Name', 'Present', 'Late', 'Absent', 'Leave', 'Days marked', 'Attendance %'],
      ...report.students.map((s) => [s.rollNumber, s.studentCode, s.fullName, s.present, s.late, s.absent, s.leave, s.total, s.percentage ?? '']),
    ];
  } else {
    rows = [
      [`${report.class.name} — ${report.date}`],
      ['Section', 'Enrolled', 'Marked', 'Present', 'Late', 'Absent', 'Leave', 'Attendance %'],
      ...report.sections.map((s) => [s.section.name, s.enrolled, s.marked, s.present, s.late, s.absent, s.leave, s.percentage ?? '']),
    ];
  }
  return `﻿${rows.map((r) => r.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

/** A student's own attendance (student/parent/teacher/admin per access rules). */
export async function studentAttendanceSummary(schoolId, studentId, query, actor) {
  await assertCanViewStudent(actor, schoolId, studentId);
  const year = await resolveAcademicYear(schoolId);
  const from = query.from ?? year.startDate;
  const to = query.to ?? year.endDate;
  const records = await prisma.attendance.findMany({
    where: { schoolId, studentId, date: { gte: from, lte: to } },
    orderBy: { date: 'desc' },
    select: { id: true, date: true, status: true, remarks: true },
  });

  const months = new Map();
  for (const r of records) {
    const key = day(r.date).slice(0, 7);
    months.set(key, [...(months.get(key) ?? []), r]);
  }
  return {
    from: day(from),
    to: day(to),
    summary: countStatuses(records),
    byMonth: [...months.entries()].sort().map(([month, rs]) => ({ month, ...countStatuses(rs) })),
    records: records.map((r) => ({ ...r, date: day(r.date) })),
  };
}

/** Sections the signed-in teacher can take attendance for (admins: all). */
export async function mySections(schoolId, actor) {
  const year = await resolveAcademicYear(schoolId);
  const scope = await teacherScope(actor, schoolId, year.id);
  return prisma.section.findMany({
    where: {
      class: { schoolId, academicYearId: year.id },
      ...(scope ? { OR: [{ classId: { in: scope.classIds } }, { id: { in: scope.sectionIds } }] } : {}),
    },
    orderBy: [{ class: { numericLevel: 'asc' } }, { class: { name: 'asc' } }, { name: 'asc' }],
    include: { class: { select: { id: true, name: true } } },
  });
}
