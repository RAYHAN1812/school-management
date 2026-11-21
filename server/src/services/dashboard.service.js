import { prisma } from '../config/prisma.js';
import { ROLES } from '../config/roles.js';
import { AppError } from '../utils/AppError.js';
import { attendancePercentage, fromPaisa, minutesToTime, outstanding, toPaisa } from '../utils/calculations.js';
import { teacherScope } from './access.service.js';

const enrollmentInclude = {
  class: { select: { id: true, name: true } },
  section: { select: { id: true, name: true } },
  academicYear: { select: { id: true, name: true, status: true } },
};

const JS_DAY = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
const dayKey = (d) => new Date(d).toISOString().slice(0, 10);

/** "Today" as the client sees it (YYYY-MM-DD), so timezones ahead of UTC get the right day. */
function todayFrom(query) {
  const raw = query?.date;
  const d = raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T00:00:00Z`) : new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`) : d;
}

// ───────────────────────── Admin ─────────────────────────

async function adminSummary(user, { query, headerSchoolId }) {
  const isSuper = user.role.key === ROLES.SUPER_ADMIN;
  // Super admins see one school when they have picked one, otherwise everything.
  const schoolId = isSuper ? headerSchoolId ?? null : user.schoolId;
  const schoolScope = schoolId ? { schoolId } : {};
  const today = todayFrom(query);
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));

  const [
    roleCounts, activeAccounts, inactiveAccounts, students, teachers, classes, recentUsers, recentActivity, schools,
    todayRecords, sectionsWithStudents, dues, monthCollected, upcomingExams, recentAdmissions, latestNotices, recentAttendance, payments6m,
  ] = await Promise.all([
    prisma.user.groupBy({ by: ['roleId'], where: schoolScope, _count: { _all: true } }),
    prisma.user.count({ where: { ...schoolScope, status: 'ACTIVE' } }),
    prisma.user.count({ where: { ...schoolScope, status: 'INACTIVE' } }),
    prisma.student.count({ where: { ...schoolScope, status: 'ACTIVE', deletedAt: null } }),
    prisma.teacher.count({ where: { ...schoolScope, status: 'ACTIVE' } }),
    prisma.class.count({ where: { ...schoolScope, academicYear: { status: 'ACTIVE' } } }),
    prisma.user.findMany({
      where: schoolScope,
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, fullName: true, email: true, createdAt: true, status: true, role: { select: { key: true, name: true } } },
    }),
    prisma.auditLog.findMany({
      where: schoolScope,
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: { id: true, action: true, entity: true, createdAt: true, user: { select: { fullName: true } } },
    }),
    isSuper ? prisma.school.count() : Promise.resolve(null),
    prisma.attendance.findMany({ where: { ...schoolScope, date: today }, select: { status: true, sectionId: true } }),
    prisma.section.count({ where: { class: { ...schoolScope, academicYear: { status: 'ACTIVE' } }, enrollments: { some: { status: 'ACTIVE' } } } }),
    prisma.invoice.aggregate({ where: { ...schoolScope, status: { in: ['UNPAID', 'PARTIALLY_PAID'] } }, _sum: { netAmount: true, paidAmount: true }, _count: { _all: true } }),
    prisma.payment.aggregate({ where: { ...schoolScope, status: 'SUCCESS', paidAt: { gte: monthStart } }, _sum: { amount: true } }),
    prisma.exam.findMany({
      where: { ...schoolScope, status: { in: ['SCHEDULED', 'ONGOING'] } },
      orderBy: [{ startDate: 'asc' }],
      take: 5,
      select: { id: true, name: true, startDate: true, endDate: true, status: true, class: { select: { name: true } } },
    }),
    prisma.student.findMany({
      where: { ...schoolScope, deletedAt: null },
      orderBy: [{ admissionDate: 'desc' }, { createdAt: 'desc' }],
      take: 5,
      select: {
        id: true, fullName: true, studentCode: true, admissionDate: true,
        enrollments: { where: { status: 'ACTIVE' }, select: { class: { select: { name: true } }, section: { select: { name: true } } }, take: 1 },
      },
    }),
    prisma.notice.findMany({
      where: { ...schoolScope, status: 'PUBLISHED', publishDate: { lte: new Date() }, OR: [{ expiryDate: null }, { expiryDate: { gte: new Date() } }] },
      orderBy: { publishDate: 'desc' },
      take: 4,
      select: { id: true, title: true, audience: true, publishDate: true },
    }),
    prisma.attendance.groupBy({
      by: ['date', 'status'],
      where: { ...schoolScope, date: { gte: new Date(today.getTime() - 30 * 86400000), lte: today } },
      _count: { _all: true },
    }),
    prisma.payment.findMany({
      where: { ...schoolScope, status: 'SUCCESS', paidAt: { gte: new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 5, 1)) } },
      select: { amount: true, paidAt: true },
    }),
  ]);

  const roles = await prisma.role.findMany({ select: { id: true, key: true, name: true } });
  const usersByRole = roles.map((r) => ({ role: r.key, name: r.name, count: roleCounts.find((c) => c.roleId === r.id)?._count._all ?? 0 }));
  const visibleRoles = isSuper ? usersByRole : usersByRole.filter((r) => r.role !== ROLES.SUPER_ADMIN);

  // Today's attendance across the school.
  const counts = { present: 0, late: 0, absent: 0, leave: 0 };
  for (const r of todayRecords) counts[r.status.toLowerCase()] += 1;

  // Attendance trend: % present on each of the last school days with records.
  const byDate = new Map();
  for (const g of recentAttendance) {
    const k = dayKey(g.date);
    const c = byDate.get(k) ?? { present: 0, late: 0, absent: 0, leave: 0 };
    c[g.status.toLowerCase()] += g._count._all;
    byDate.set(k, c);
  }
  const attendanceTrend = [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-14).map(([date, c]) => ({ date, percentage: attendancePercentage(c) }));

  // Collections per month for the last 6 months.
  const months = [];
  for (let i = 5; i >= 0; i -= 1) months.push(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - i, 1)).toISOString().slice(0, 7));
  const byMonth = new Map(months.map((m) => [m, 0]));
  for (const p of payments6m) {
    const m = dayKey(p.paidAt).slice(0, 7);
    if (byMonth.has(m)) byMonth.set(m, byMonth.get(m) + toPaisa(p.amount));
  }

  return {
    type: 'admin',
    scope: schoolId ? 'school' : 'all-schools',
    stats: {
      totalStudents: students,
      totalTeachers: teachers,
      activeClasses: classes,
      activeAccounts,
      inactiveAccounts,
      ...(isSuper ? { totalSchools: schools } : {}),
    },
    todayAttendance: {
      date: dayKey(today),
      marked: todayRecords.length,
      ...counts,
      percentage: attendancePercentage(counts),
      sectionsTaken: new Set(todayRecords.map((r) => r.sectionId)).size,
      sectionsTotal: sectionsWithStudents,
    },
    fees: {
      outstanding: outstanding(Number(dues._sum.netAmount ?? 0), Number(dues._sum.paidAmount ?? 0)),
      openInvoices: dues._count._all,
      collectedThisMonth: Number(monthCollected._sum.amount ?? 0),
    },
    attendanceTrend,
    collectionTrend: [...byMonth.entries()].map(([month, paisa]) => ({ month, amount: fromPaisa(paisa) })),
    upcomingExams,
    recentAdmissions,
    latestNotices,
    usersByRole: visibleRoles,
    recentUsers,
    recentActivity,
  };
}

// ───────────────────────── Teacher ─────────────────────────

async function teacherSummary(user, { query }) {
  const teacher = await prisma.teacher.findUnique({
    where: { userId: user.id },
    include: {
      subjects: { include: { subject: { select: { id: true, name: true, code: true } } } },
      classSubjects: { include: { class: { select: { id: true, name: true, academicYearId: true } }, subject: { select: { id: true, name: true } } } },
      sectionsAsClassTchr: { include: { class: { select: { id: true, name: true } } } },
    },
  });
  if (!teacher) return { type: 'teacher', profile: null, subjects: [], classes: [], classTeacherOf: [], today: { periods: [] }, attendanceTasks: [], upcomingExams: [], pendingEvaluations: { total: 0, assignments: [] } };

  const today = todayFrom(query);
  const year = await prisma.academicYear.findFirst({ where: { schoolId: teacher.schoolId, status: 'ACTIVE' } });
  const scope = year ? await teacherScope(user, teacher.schoolId, year.id) : { classIds: [], sectionIds: [] };

  const [periods, sections, takenToday, exams, assignments] = await Promise.all([
    year
      ? prisma.timetable.findMany({
          where: { teacherId: teacher.id, academicYearId: year.id, dayOfWeek: JS_DAY[today.getUTCDay()] },
          orderBy: { startMinute: 'asc' },
          include: { subject: { select: { name: true } }, class: { select: { name: true } }, section: { select: { name: true } } },
        })
      : [],
    prisma.section.findMany({
      where: { OR: [{ classId: { in: scope.classIds } }, { id: { in: scope.sectionIds } }], enrollments: { some: { status: 'ACTIVE' } } },
      include: { class: { select: { id: true, name: true } } },
      orderBy: [{ class: { name: 'asc' } }, { name: 'asc' }],
    }),
    prisma.attendance.findMany({ where: { date: today, sectionId: { in: [...scope.sectionIds, ...(await sectionIdsOf(scope.classIds))] } }, distinct: ['sectionId'], select: { sectionId: true } }),
    prisma.exam.findMany({
      where: { classId: { in: scope.classIds }, status: { in: ['SCHEDULED', 'ONGOING', 'COMPLETED'] } },
      orderBy: { startDate: 'asc' },
      take: 5,
      select: { id: true, name: true, startDate: true, status: true, class: { select: { name: true } } },
    }),
    prisma.assignment.findMany({
      where: { teacherId: teacher.id, submissions: { some: { status: { not: 'GRADED' } } } },
      orderBy: { dueDate: 'desc' },
      take: 5,
      select: { id: true, title: true, dueDate: true, class: { select: { name: true } }, _count: { select: { submissions: { where: { status: { not: 'GRADED' } } } } } },
    }),
  ]);
  const pendingTotal = await prisma.submission.count({ where: { status: { not: 'GRADED' }, assignment: { teacherId: teacher.id } } });
  const taken = new Set(takenToday.map((t) => t.sectionId));

  return {
    type: 'teacher',
    profile: { employeeCode: teacher.employeeCode, designation: teacher.designation, department: teacher.department, joiningDate: teacher.joiningDate },
    subjects: teacher.subjects.map((s) => s.subject),
    classes: teacher.classSubjects.filter((cs) => !year || cs.class.academicYearId === year.id).map((cs) => ({ class: cs.class, subject: cs.subject })),
    classTeacherOf: teacher.sectionsAsClassTchr.map((s) => ({ class: s.class, section: { id: s.id, name: s.name } })),
    today: {
      date: dayKey(today),
      dayOfWeek: JS_DAY[today.getUTCDay()],
      periods: periods.map((p) => ({ id: p.id, startTime: minutesToTime(p.startMinute), endTime: minutesToTime(p.endMinute), subject: p.subject.name, className: `${p.class.name} ${p.section.name}`, roomNumber: p.roomNumber })),
    },
    attendanceTasks: sections.map((s) => ({ classId: s.class.id, sectionId: s.id, label: `${s.class.name} · Section ${s.name}`, taken: taken.has(s.id) })),
    upcomingExams: exams,
    pendingEvaluations: { total: pendingTotal, assignments: assignments.map((a) => ({ id: a.id, title: a.title, className: a.class.name, dueDate: a.dueDate, pending: a._count.submissions })) },
  };
}

async function sectionIdsOf(classIds) {
  if (!classIds.length) return [];
  return (await prisma.section.findMany({ where: { classId: { in: classIds } }, select: { id: true } })).map((s) => s.id);
}

// ───────────────────────── Student & parent (kept for compatibility; portals use /overview) ─────────────────────────

async function studentSummary(user) {
  const student = await prisma.student.findUnique({
    where: { userId: user.id },
    include: { enrollments: { where: { status: 'ACTIVE' }, include: enrollmentInclude, take: 1 } },
  });
  if (!student) return { type: 'student', profile: null, enrollment: null };
  return {
    type: 'student',
    profile: {
      id: student.id,
      studentCode: student.studentCode,
      fullName: student.fullName,
      dateOfBirth: student.dateOfBirth,
      gender: student.gender,
      bloodGroup: student.bloodGroup,
      admissionDate: student.admissionDate,
      status: student.status,
    },
    enrollment: student.enrollments[0] ?? null,
  };
}

async function parentSummary(user) {
  const guardian = await prisma.guardian.findUnique({
    where: { userId: user.id },
    include: {
      students: { include: { student: { include: { enrollments: { where: { status: 'ACTIVE' }, include: enrollmentInclude, take: 1 } } } } },
    },
  });
  if (!guardian) return { type: 'parent', children: [] };
  return {
    type: 'parent',
    children: guardian.students
      .filter((link) => link.student.deletedAt === null)
      .map((link) => ({
        id: link.student.id,
        studentCode: link.student.studentCode,
        fullName: link.student.fullName,
        relationship: link.relationship,
        status: link.student.status,
        enrollment: link.student.enrollments[0] ?? null,
      })),
  };
}

export function getSummary(user, ctx = {}) {
  switch (user.role.key) {
    case ROLES.SUPER_ADMIN:
    case ROLES.SCHOOL_ADMIN:
      return adminSummary(user, ctx);
    case ROLES.TEACHER:
      return teacherSummary(user, ctx);
    case ROLES.STUDENT:
      return studentSummary(user);
    case ROLES.PARENT:
      return parentSummary(user);
    default:
      throw AppError.forbidden();
  }
}
