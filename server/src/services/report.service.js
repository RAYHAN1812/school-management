// Phase 8: the spec's eight reports, each returned as a uniform table that
// can be shown on screen or exported to Excel, PDF or CSV.
import { prisma } from '../config/prisma.js';
import { AppError } from '../utils/AppError.js';
import { daysOverdue, fromPaisa, libraryFine, outstanding, round2, toPaisa } from '../utils/calculations.js';
import { resolveAcademicYear } from './academic.service.js';
import { attendanceReport } from './attendance.service.js';
import { examResults } from './exam.service.js';
import { LIBRARY_RULES } from './library.service.js';

const day = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');
const money = (p) => fromPaisa(p).toLocaleString('en-IN', { minimumFractionDigits: 2 });
const enrollmentOf = (s) => s.enrollments?.[0];

export const REPORT_TYPES = {
  admissions: 'Student admission report',
  'class-students': 'Class-wise student report',
  attendance: 'Attendance report',
  exam: 'Examination report',
  'fee-collection': 'Fee collection report',
  outstanding: 'Outstanding payment report',
  'teacher-workload': 'Teacher workload report',
  library: 'Library report',
};

function range(query, year) {
  const from = query.from ?? year?.startDate ?? new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1));
  const to = query.to ?? year?.endDate ?? new Date();
  return { from, to, toExclusive: new Date(new Date(to).getTime() + 86400000) };
}

async function admissions(schoolId, query) {
  const year = await resolveAcademicYear(schoolId).catch(() => null);
  const { from, to, toExclusive } = range(query, year);
  const students = await prisma.student.findMany({
    where: { schoolId, deletedAt: null, admissionDate: { gte: from, lt: toExclusive } },
    orderBy: [{ admissionDate: 'desc' }, { fullName: 'asc' }],
    include: {
      enrollments: { orderBy: { enrolledAt: 'asc' }, include: { class: true, section: true }, take: 1 },
      guardians: { where: { isPrimary: true }, include: { guardian: true }, take: 1 },
    },
  });
  const byGender = students.reduce((a, s) => ({ ...a, [s.gender]: (a[s.gender] ?? 0) + 1 }), {});
  return {
    title: REPORT_TYPES.admissions,
    subtitle: `Admitted ${day(from)} to ${day(to)}`,
    columns: [
      { key: 'admissionDate', label: 'Admitted', format: 'date' },
      { key: 'studentCode', label: 'Student ID' },
      { key: 'fullName', label: 'Name', width: 2 },
      { key: 'gender', label: 'Gender' },
      { key: 'className', label: 'Class' },
      { key: 'guardian', label: 'Guardian', width: 2 },
      { key: 'phone', label: 'Guardian phone' },
      { key: 'previousSchool', label: 'Previous school', width: 2 },
    ],
    rows: students.map((s) => ({
      admissionDate: s.admissionDate,
      studentCode: s.studentCode,
      fullName: s.fullName,
      gender: s.gender,
      className: enrollmentOf(s) ? `${enrollmentOf(s).class.name} ${enrollmentOf(s).section.name}` : '',
      guardian: s.guardians[0]?.guardian.fullName ?? '',
      phone: s.guardians[0]?.guardian.phone ?? '',
      previousSchool: s.previousSchool ?? '',
    })),
    summary: [
      { label: 'Total admissions', value: students.length },
      ...Object.entries(byGender).map(([g, n]) => ({ label: g.charAt(0) + g.slice(1).toLowerCase(), value: n })),
    ],
  };
}

async function classStudents(schoolId, query) {
  if (!query.classId) throw AppError.badRequest('CLASS_REQUIRED', 'Choose a class');
  const klass = await prisma.class.findFirst({ where: { id: query.classId, schoolId }, include: { academicYear: true } });
  if (!klass) throw AppError.notFound('CLASS_NOT_FOUND', 'Class not found');
  const rows = await prisma.enrollment.findMany({
    where: { classId: klass.id, status: 'ACTIVE', ...(query.sectionId ? { sectionId: query.sectionId } : {}), student: { deletedAt: null, status: 'ACTIVE' } },
    orderBy: [{ section: { name: 'asc' } }, { rollNumber: 'asc' }],
    include: { section: true, student: { include: { guardians: { where: { isPrimary: true }, include: { guardian: true }, take: 1 } } } },
  });
  return {
    title: REPORT_TYPES['class-students'],
    subtitle: `${klass.name} · Academic year ${klass.academicYear.name}`,
    columns: [
      { key: 'section', label: 'Section' },
      { key: 'roll', label: 'Roll', format: 'number' },
      { key: 'studentCode', label: 'Student ID' },
      { key: 'fullName', label: 'Name', width: 2 },
      { key: 'gender', label: 'Gender' },
      { key: 'dateOfBirth', label: 'Date of birth', format: 'date' },
      { key: 'guardian', label: 'Guardian', width: 2 },
      { key: 'phone', label: 'Phone' },
    ],
    rows: rows.map((e) => ({
      section: e.section.name,
      roll: e.rollNumber,
      studentCode: e.student.studentCode,
      fullName: e.student.fullName,
      gender: e.student.gender,
      dateOfBirth: e.student.dateOfBirth,
      guardian: e.student.guardians[0]?.guardian.fullName ?? '',
      phone: e.student.guardians[0]?.guardian.phone ?? e.student.phone,
    })),
    summary: [
      { label: 'Students', value: rows.length },
      { label: 'Capacity', value: klass.capacity },
    ],
  };
}

async function attendance(schoolId, query, actor) {
  if (!query.classId || !query.sectionId) throw AppError.badRequest('SECTION_REQUIRED', 'Choose a class and section');
  const month = query.month ?? new Date().toISOString().slice(0, 7);
  const r = await attendanceReport(schoolId, { type: 'monthly', classId: query.classId, sectionId: query.sectionId, month }, actor);
  return {
    title: REPORT_TYPES.attendance,
    subtitle: `${r.class.name} ${r.section.name} · ${month} · ${r.schoolDays} school days`,
    columns: [
      { key: 'rollNumber', label: 'Roll', format: 'number' },
      { key: 'studentCode', label: 'Student ID' },
      { key: 'fullName', label: 'Name', width: 2 },
      { key: 'present', label: 'Present', format: 'number' },
      { key: 'late', label: 'Late', format: 'number' },
      { key: 'absent', label: 'Absent', format: 'number' },
      { key: 'leave', label: 'Leave', format: 'number' },
      { key: 'percentage', label: 'Attendance', format: 'percent' },
    ],
    rows: r.students,
    summary: [
      { label: 'School days', value: r.schoolDays },
      { label: 'Class average', value: r.averagePercentage == null ? '—' : `${r.averagePercentage}%` },
      { label: 'Below 75%', value: r.students.filter((s) => s.percentage != null && s.percentage < 75).length },
    ],
  };
}

async function exam(schoolId, query, actor) {
  if (!query.examId) throw AppError.badRequest('EXAM_REQUIRED', 'Choose an exam');
  const r = await examResults(schoolId, query.examId, { sectionId: query.sectionId }, actor);
  const subjectCols = r.subjects.map((s) => ({ key: `s_${s.id}`, label: s.code, format: 'number', width: 0.7 }));
  return {
    title: REPORT_TYPES.exam,
    subtitle: `${r.exam.name} · ${r.exam.class.name} · ${r.exam.academicYear.name} · ${r.exam.status.toLowerCase()}`,
    columns: [
      { key: 'position', label: 'Pos.', format: 'number', width: 0.6 },
      { key: 'roll', label: 'Roll' },
      { key: 'fullName', label: 'Name', width: 2 },
      ...subjectCols,
      { key: 'total', label: 'Total', format: 'number' },
      { key: 'gpa', label: 'GPA', format: 'number' },
      { key: 'grade', label: 'Grade' },
      { key: 'result', label: 'Result' },
    ],
    rows: r.rows.map((row) => ({
      position: row.position,
      roll: `${row.section.name}-${row.rollNumber}`,
      fullName: row.fullName,
      ...Object.fromEntries(r.subjects.map((s) => {
        const m = row.subjects.find((x) => x.subjectId === s.id);
        return [`s_${s.id}`, m ? (m.isAbsent ? 'Abs' : m.total) : ''];
      })),
      total: row.totalMarks,
      gpa: row.gpa == null ? '' : row.gpa.toFixed(2),
      grade: row.grade ?? '',
      result: row.result,
    })),
    summary: [
      { label: 'Students', value: r.summary.students },
      { label: 'Passed', value: r.summary.passed },
      { label: 'Failed', value: r.summary.failed },
      { label: 'Pass rate', value: r.summary.passRate == null ? '—' : `${r.summary.passRate}%` },
      { label: 'Average GPA (passed)', value: r.summary.averageGpa ?? '—' },
    ],
  };
}

async function feeCollection(schoolId, query) {
  const today = new Date();
  const from = query.from ?? new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const to = query.to ?? today;
  const payments = await prisma.payment.findMany({
    where: { schoolId, status: 'SUCCESS', paidAt: { gte: from, lt: new Date(new Date(to).getTime() + 86400000) } },
    orderBy: { paidAt: 'asc' },
    include: { student: true, invoice: { include: { feeType: true } }, receivedBy: { select: { fullName: true } } },
  });
  const totals = new Map();
  for (const p of payments) totals.set(p.method, (totals.get(p.method) ?? 0) + toPaisa(p.amount));
  const grand = payments.reduce((a, p) => a + toPaisa(p.amount), 0);
  return {
    title: REPORT_TYPES['fee-collection'],
    subtitle: `Payments received ${day(from)} to ${day(to)}`,
    columns: [
      { key: 'paidAt', label: 'Date', format: 'date' },
      { key: 'receipt', label: 'Receipt' },
      { key: 'student', label: 'Student', width: 2 },
      { key: 'studentCode', label: 'Student ID' },
      { key: 'fee', label: 'For', width: 1.6 },
      { key: 'method', label: 'Method' },
      { key: 'reference', label: 'Reference' },
      { key: 'amount', label: 'Amount (BDT)', format: 'money' },
    ],
    rows: payments.map((p) => ({
      paidAt: p.paidAt,
      receipt: p.receiptNumber,
      student: p.student.fullName,
      studentCode: p.student.studentCode,
      fee: `${p.invoice.feeType.name}${p.invoice.billingPeriod ? ` ${p.invoice.billingPeriod}` : ''}`,
      method: p.method,
      reference: p.transactionRef ?? '',
      amount: Number(p.amount),
    })),
    summary: [
      { label: 'Payments', value: payments.length },
      ...[...totals.entries()].map(([m, p]) => ({ label: m, value: `BDT ${money(p)}` })),
      { label: 'Total collected', value: `BDT ${money(grand)}` },
    ],
  };
}

async function outstandingReport(schoolId, query) {
  const today = new Date();
  const invoices = await prisma.invoice.findMany({
    where: {
      schoolId,
      status: { in: ['UNPAID', 'PARTIALLY_PAID'] },
      ...(query.classId ? { student: { enrollments: { some: { classId: query.classId, status: 'ACTIVE' } } } } : {}),
    },
    orderBy: [{ dueDate: 'asc' }],
    include: {
      feeType: true,
      student: { include: { enrollments: { where: { status: 'ACTIVE' }, include: { class: true, section: true }, take: 1 }, guardians: { where: { isPrimary: true }, include: { guardian: true }, take: 1 } } },
    },
  });
  const due = invoices.reduce((a, i) => a + toPaisa(i.netAmount) - toPaisa(i.paidAmount), 0);
  return {
    title: REPORT_TYPES.outstanding,
    subtitle: `Unpaid and partially paid invoices as of ${day(today)}`,
    columns: [
      { key: 'invoice', label: 'Invoice' },
      { key: 'student', label: 'Student', width: 2 },
      { key: 'className', label: 'Class' },
      { key: 'fee', label: 'For', width: 1.6 },
      { key: 'dueDate', label: 'Due', format: 'date' },
      { key: 'daysOverdue', label: 'Days late', format: 'number' },
      { key: 'net', label: 'Billed', format: 'money' },
      { key: 'paid', label: 'Paid', format: 'money' },
      { key: 'outstanding', label: 'Outstanding', format: 'money' },
      { key: 'phone', label: 'Guardian phone' },
    ],
    rows: invoices.map((i) => ({
      invoice: i.invoiceNumber,
      student: i.student.fullName,
      className: enrollmentOf(i.student) ? `${enrollmentOf(i.student).class.name} ${enrollmentOf(i.student).section.name}` : '',
      fee: `${i.feeType.name}${i.billingPeriod ? ` ${i.billingPeriod}` : ''}`,
      dueDate: i.dueDate,
      daysOverdue: daysOverdue(i.dueDate, today),
      net: Number(i.netAmount),
      paid: Number(i.paidAmount),
      outstanding: outstanding(i.netAmount, i.paidAmount),
      phone: i.student.guardians[0]?.guardian.phone ?? '',
    })),
    summary: [
      { label: 'Open invoices', value: invoices.length },
      { label: 'Overdue', value: invoices.filter((i) => daysOverdue(i.dueDate, today) > 0).length },
      { label: 'Total outstanding', value: `BDT ${money(due)}` },
    ],
  };
}

async function teacherWorkload(schoolId) {
  const year = await resolveAcademicYear(schoolId);
  const teachers = await prisma.teacher.findMany({
    where: { schoolId, status: { in: ['ACTIVE', 'ON_LEAVE'] } },
    orderBy: { fullName: 'asc' },
    include: {
      subjects: { include: { subject: true } },
      classSubjects: { where: { class: { academicYearId: year.id } } },
      sectionsAsClassTchr: { where: { class: { academicYearId: year.id } } },
      timetables: { where: { academicYearId: year.id }, select: { startMinute: true, endMinute: true } },
      _count: { select: { assignments: true } },
    },
  });
  const rows = teachers.map((t) => ({
    employeeCode: t.employeeCode,
    fullName: t.fullName,
    designation: t.designation,
    subjects: t.subjects.map((s) => s.subject.code).join(', '),
    classes: t.classSubjects.length,
    classTeacher: t.sectionsAsClassTchr.length,
    periods: t.timetables.length,
    hours: round2(t.timetables.reduce((a, p) => a + (p.endMinute - p.startMinute), 0) / 60),
    homework: t._count.assignments,
    status: t.status,
  }));
  return {
    title: REPORT_TYPES['teacher-workload'],
    subtitle: `Academic year ${year.name} · weekly periods from the class routine`,
    columns: [
      { key: 'employeeCode', label: 'Employee ID' },
      { key: 'fullName', label: 'Teacher', width: 2 },
      { key: 'designation', label: 'Designation', width: 1.5 },
      { key: 'subjects', label: 'Subjects' },
      { key: 'classes', label: 'Class-subjects', format: 'number' },
      { key: 'classTeacher', label: 'Class teacher', format: 'number' },
      { key: 'periods', label: 'Periods / week', format: 'number' },
      { key: 'hours', label: 'Hours / week', format: 'number' },
      { key: 'homework', label: 'Homework set', format: 'number' },
    ],
    rows,
    summary: [
      { label: 'Teachers', value: rows.length },
      { label: 'Average periods / week', value: rows.length ? round2(rows.reduce((a, r) => a + r.periods, 0) / rows.length) : 0 },
    ],
  };
}

async function libraryReport(schoolId) {
  const issues = await prisma.bookIssue.findMany({
    where: { schoolId, status: 'ISSUED' },
    orderBy: { dueDate: 'asc' },
    include: { book: true, student: { include: { enrollments: { where: { status: 'ACTIVE' }, include: { class: true, section: true }, take: 1 } } } },
  });
  const books = await prisma.book.aggregate({ where: { schoolId }, _sum: { totalCopies: true, availableCopies: true }, _count: { _all: true } });
  const today = new Date();
  const fines = issues.reduce((a, i) => a + toPaisa(libraryFine(i.dueDate, today, LIBRARY_RULES.finePerDay)), 0);
  return {
    title: REPORT_TYPES.library,
    subtitle: `Books currently on loan as of ${day(today)}`,
    columns: [
      { key: 'bookCode', label: 'Book ID' },
      { key: 'title', label: 'Title', width: 2.2 },
      { key: 'student', label: 'Borrower', width: 1.8 },
      { key: 'className', label: 'Class' },
      { key: 'issueDate', label: 'Issued', format: 'date' },
      { key: 'dueDate', label: 'Due', format: 'date' },
      { key: 'daysOverdue', label: 'Days late', format: 'number' },
      { key: 'fine', label: 'Fine so far', format: 'money' },
    ],
    rows: issues.map((i) => ({
      bookCode: i.book.bookCode,
      title: i.book.title,
      student: i.student.fullName,
      className: enrollmentOf(i.student) ? `${enrollmentOf(i.student).class.name} ${enrollmentOf(i.student).section.name}` : '',
      issueDate: i.issueDate,
      dueDate: i.dueDate,
      daysOverdue: daysOverdue(i.dueDate, today),
      fine: libraryFine(i.dueDate, today, LIBRARY_RULES.finePerDay),
    })),
    summary: [
      { label: 'Titles', value: books._count._all },
      { label: 'Copies', value: books._sum.totalCopies ?? 0 },
      { label: 'On loan', value: issues.length },
      { label: 'Overdue', value: issues.filter((i) => daysOverdue(i.dueDate, today) > 0).length },
      { label: 'Fines accrued', value: `BDT ${money(fines)}` },
    ],
  };
}

const BUILDERS = {
  admissions,
  'class-students': classStudents,
  attendance,
  exam,
  'fee-collection': feeCollection,
  outstanding: outstandingReport,
  'teacher-workload': teacherWorkload,
  library: libraryReport,
};

export async function buildReport(schoolId, type, query, actor) {
  const builder = BUILDERS[type];
  if (!builder) throw AppError.notFound('REPORT_NOT_FOUND', 'Unknown report');
  return { type, generatedAt: new Date(), ...(await builder(schoolId, query, actor)) };
}
