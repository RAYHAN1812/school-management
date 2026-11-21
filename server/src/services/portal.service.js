// Phase 6: the parent and student portals — one student's world in a single view.
import { prisma } from '../config/prisma.js';
import { ROLES } from '../config/roles.js';
import { countStatuses, fromPaisa, toPaisa } from '../utils/calculations.js';
import { resolveAcademicYear } from './academic.service.js';
import { assertCanViewStudent, linkedStudentIds, studentForUser } from './access.service.js';
import { studentResults } from './exam.service.js';

const teacherContact = { select: { id: true, fullName: true, designation: true, phone: true, email: true } };

/** The class teacher and subject teachers of the student's current section. */
async function teachersFor(enrollment) {
  if (!enrollment) return [];
  const [section, subjects] = await Promise.all([
    prisma.section.findUnique({ where: { id: enrollment.sectionId }, include: { classTeacher: teacherContact } }),
    prisma.classSubject.findMany({
      where: { classId: enrollment.classId, teacherId: { not: null } },
      include: { teacher: teacherContact, subject: { select: { name: true } } },
    }),
  ]);
  const byTeacher = new Map();
  if (section.classTeacher) byTeacher.set(section.classTeacher.id, { ...section.classTeacher, roles: ['Class teacher'] });
  for (const cs of subjects) {
    const t = byTeacher.get(cs.teacher.id) ?? { ...cs.teacher, roles: [] };
    t.roles.push(cs.subject.name);
    byTeacher.set(cs.teacher.id, t);
  }
  return [...byTeacher.values()];
}

/**
 * Everything a parent or student needs on one screen. Access: the student,
 * their linked parents, their teachers and admins (assertCanViewStudent).
 */
export async function studentOverview(schoolId, studentId, actor) {
  await assertCanViewStudent(actor, schoolId, studentId);
  const year = await resolveAcademicYear(schoolId).catch(() => null);

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: {
      id: true,
      studentCode: true,
      fullName: true,
      dateOfBirth: true,
      gender: true,
      bloodGroup: true,
      phone: true,
      admissionDate: true,
      status: true,
      enrollments: {
        where: year ? { academicYearId: year.id } : { status: 'ACTIVE' },
        include: { class: { select: { id: true, name: true } }, section: { select: { id: true, name: true, roomNumber: true } } },
        take: 1,
      },
    },
  });
  const enrollment = student.enrollments[0] ?? null;

  const [attendance, recentAttendance, invoices, results, teachers, upcomingExams] = await Promise.all([
    year
      ? prisma.attendance.findMany({ where: { studentId, date: { gte: year.startDate, lte: year.endDate } }, select: { status: true } })
      : [],
    prisma.attendance.findMany({ where: { studentId }, orderBy: { date: 'desc' }, take: 10, select: { date: true, status: true, remarks: true } }),
    actor.role.key === ROLES.TEACHER ? [] : prisma.invoice.findMany({
      where: { studentId, status: { in: ['UNPAID', 'PARTIALLY_PAID'] } },
      orderBy: { dueDate: 'asc' },
      select: { id: true, invoiceNumber: true, description: true, netAmount: true, paidAmount: true, dueDate: true, status: true },
    }),
    studentResults(schoolId, studentId, actor),
    teachersFor(enrollment),
    enrollment
      ? prisma.exam.findMany({
          where: { classId: enrollment.classId, status: { in: ['SCHEDULED', 'ONGOING'] } },
          orderBy: { startDate: 'asc' },
          select: { id: true, name: true, startDate: true, endDate: true, status: true },
        })
      : [],
  ]);

  const due = invoices.reduce((a, i) => a + toPaisa(i.netAmount) - toPaisa(i.paidAmount), 0);
  const today = new Date().toISOString().slice(0, 10);
  return {
    student: { ...student, enrollments: undefined },
    enrollment,
    academicYear: year ? { id: year.id, name: year.name } : null,
    attendance: { ...countStatuses(attendance), recent: recentAttendance },
    latestResult: results[0] ?? null,
    resultsCount: results.length,
    ...(actor.role.key === ROLES.TEACHER ? {} : {
      fees: {
        outstanding: fromPaisa(due),
        openInvoices: invoices.length,
        overdue: invoices.filter((i) => i.dueDate.toISOString().slice(0, 10) < today).length,
        nextDue: invoices[0] ?? null,
      },
    }),
    upcomingExams,
    teachers,
  };
}

/** The children a portal user can switch between (a student sees only themself). */
export async function myStudents(schoolId, actor) {
  let ids = [];
  if (actor.role.key === ROLES.PARENT) ids = await linkedStudentIds(actor, schoolId);
  else if (actor.role.key === ROLES.STUDENT) ids = [(await studentForUser(actor, schoolId)).id];
  if (ids.length === 0) return [];
  return prisma.student.findMany({
    where: { id: { in: ids }, deletedAt: null },
    orderBy: { fullName: 'asc' },
    select: {
      id: true,
      fullName: true,
      studentCode: true,
      status: true,
      enrollments: { where: { status: 'ACTIVE' }, include: { class: { select: { name: true } }, section: { select: { name: true } } }, take: 1 },
    },
  });
}
