import { prisma } from '../config/prisma.js';
import { ROLES } from '../config/roles.js';
import { AppError } from '../utils/AppError.js';
import { audit } from '../utils/audit.js';
import { DEFAULT_GRADE_SCALE, overallResult, rankResults, round2, subjectResult, validateGradeScale } from '../utils/calculations.js';
import { resolveAcademicYear } from './academic.service.js';
import { assertCanViewStudent, isAdmin, teacherForUser, teacherScope } from './access.service.js';

const num = (v) => (v == null ? null : Number(v));
const published = () => AppError.forbidden('RESULTS_PUBLISHED', 'Results are published. Only an administrator can change them now.');

// ───────────────────────── Grading scale ─────────────────────────

export async function loadScale(schoolId, db = prisma) {
  const rows = await db.gradeScale.findMany({ where: { schoolId }, orderBy: { minPercent: 'desc' } });
  return rows.length ? rows.map((r) => ({ ...r, minPercent: num(r.minPercent), maxPercent: num(r.maxPercent), gradePoint: num(r.gradePoint) })) : DEFAULT_GRADE_SCALE;
}

export function getGradeScale(schoolId) {
  return loadScale(schoolId);
}

export async function setGradeScale(schoolId, { bands }, actor, ctx) {
  const problems = validateGradeScale(bands);
  if (problems.length) throw AppError.badRequest('INVALID_GRADE_SCALE', problems[0], problems.map((message) => ({ field: 'bands', message })));
  await prisma.$transaction([
    prisma.gradeScale.deleteMany({ where: { schoolId } }),
    prisma.gradeScale.createMany({ data: bands.map((b) => ({ ...b, grade: b.grade.toUpperCase(), schoolId })) }),
  ]);
  // Unpublished marks are re-graded with the new scale; published results stay as issued.
  const marks = await prisma.mark.findMany({
    where: { examSubject: { exam: { schoolId, status: { not: 'PUBLISHED' } } } },
    include: { examSubject: true },
  });
  const scale = await loadScale(schoolId);
  for (const m of marks) {
    const r = subjectResult(m, m.examSubject, scale);
    await prisma.mark.update({ where: { id: m.id }, data: { grade: r.grade, gradePoint: r.gradePoint } });
  }
  await audit({ action: 'GRADE_SCALE_UPDATED', entity: 'GradeScale', actor, schoolId, metadata: { bands }, ...ctx });
  return scale;
}

// ───────────────────────── Access ─────────────────────────

async function loadExam(schoolId, id) {
  const exam = await prisma.exam.findFirst({
    where: { id, schoolId },
    include: {
      class: { include: { sections: { orderBy: { name: 'asc' } } } },
      academicYear: true,
      subjects: { include: { subject: true }, orderBy: { subject: { name: 'asc' } } },
    },
  });
  if (!exam) throw AppError.notFound('EXAM_NOT_FOUND', 'Exam not found');
  return exam;
}

/** Teachers may view exams of classes they teach; admins any. */
async function assertCanViewExam(actor, schoolId, exam) {
  if (isAdmin(actor)) return null;
  if (actor.role.key !== ROLES.TEACHER) throw AppError.forbidden();
  const scope = await teacherScope(actor, schoolId, exam.academicYearId);
  const sectionIds = exam.class.sections.map((s) => s.id);
  if (!scope.classIds.includes(exam.classId) && !scope.sectionIds.some((s) => sectionIds.includes(s))) {
    throw AppError.forbidden('FORBIDDEN', 'You do not teach this class');
  }
  return scope;
}

/** Marks for a subject are entered by its subject teacher in that class (or an admin). */
async function canEnterMarks(actor, schoolId, exam, subjectId) {
  if (isAdmin(actor)) return true;
  if (actor.role.key !== ROLES.TEACHER) return false;
  const teacher = await teacherForUser(actor, schoolId);
  if (!teacher) return false;
  const cs = await prisma.classSubject.findUnique({ where: { classId_subjectId: { classId: exam.classId, subjectId } } });
  return cs?.teacherId === teacher.id;
}

// Students who sit the exam: everyone enrolled in the class that year
// (still active, or since promoted — their results stay on record).
function examStudents(exam, sectionId) {
  return prisma.enrollment.findMany({
    where: {
      classId: exam.classId,
      status: { in: ['ACTIVE', 'PROMOTED', 'COMPLETED'] },
      ...(sectionId ? { sectionId } : {}),
      student: { deletedAt: null },
    },
    orderBy: [{ section: { name: 'asc' } }, { rollNumber: 'asc' }],
    include: {
      section: { select: { id: true, name: true } },
      student: { select: { id: true, fullName: true, studentCode: true, status: true } },
    },
  });
}

async function assertSubjectsInClass(classId, subjectIds) {
  const taught = await prisma.classSubject.findMany({ where: { classId, subjectId: { in: subjectIds } } });
  if (taught.length !== new Set(subjectIds).size) {
    throw AppError.badRequest('SUBJECT_NOT_IN_CLASS', 'Every exam subject must be taught in the class');
  }
}

const subjectData = (s) => ({
  subjectId: s.subjectId,
  examDate: s.examDate ?? null,
  fullMarks: s.fullMarks,
  passMarks: s.passMarks,
  writtenMarks: s.writtenMarks ?? null,
  mcqMarks: s.mcqMarks ?? null,
  practicalMarks: s.practicalMarks ?? null,
});

// ───────────────────────── Exams ─────────────────────────

export async function createExam(schoolId, data, actor, ctx) {
  const klass = await prisma.class.findFirst({ where: { id: data.classId, schoolId } });
  if (!klass) throw AppError.notFound('CLASS_NOT_FOUND', 'Class not found');
  await assertSubjectsInClass(klass.id, data.subjects.map((s) => s.subjectId));
  const dup = await prisma.exam.findFirst({ where: { classId: klass.id, name: data.name } });
  if (dup) throw AppError.conflict('DUPLICATE_EXAM', `${klass.name} already has an exam called "${data.name}"`);

  const exam = await prisma.exam.create({
    data: {
      schoolId,
      academicYearId: klass.academicYearId,
      classId: klass.id,
      name: data.name,
      startDate: data.startDate ?? null,
      endDate: data.endDate ?? null,
      status: 'SCHEDULED',
      subjects: { create: data.subjects.map(subjectData) },
    },
  });
  await audit({ action: 'EXAM_CREATED', entity: 'Exam', entityId: exam.id, actor, schoolId, metadata: { name: data.name, classId: klass.id }, ...ctx });
  return getExam(schoolId, exam.id, actor);
}

export async function listExams(schoolId, query, actor) {
  const year = query.classId ? null : await resolveAcademicYear(schoolId, query.academicYearId);
  const scope = isAdmin(actor) ? null : await teacherScope(actor, schoolId, year?.id ?? (await resolveAcademicYear(schoolId)).id);
  const exams = await prisma.exam.findMany({
    where: {
      schoolId,
      ...(year ? { academicYearId: year.id } : {}),
      ...(query.classId ? { classId: query.classId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(scope ? { OR: [{ classId: { in: scope.classIds } }, { class: { sections: { some: { id: { in: scope.sectionIds } } } } }] } : {}),
    },
    orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
    include: {
      class: { select: { id: true, name: true } },
      academicYear: { select: { id: true, name: true } },
      subjects: { include: { subject: { select: { id: true, name: true, code: true } }, _count: { select: { marks: true } } } },
    },
  });
  return exams;
}

export async function getExam(schoolId, id, actor) {
  const exam = await loadExam(schoolId, id);
  await assertCanViewExam(actor, schoolId, exam);
  const students = await examStudents(exam);
  const studentIds = students.map((s) => s.studentId);
  const counts = await prisma.mark.groupBy({
    by: ['examSubjectId'],
    where: { examSubjectId: { in: exam.subjects.map((s) => s.id) }, studentId: { in: studentIds } },
    _count: { _all: true },
  });
  const subjects = [];
  for (const s of exam.subjects) {
    subjects.push({
      ...s,
      marksEntered: counts.find((c) => c.examSubjectId === s.id)?._count._all ?? 0,
      canEnterMarks: await canEnterMarks(actor, schoolId, exam, s.subjectId),
    });
  }
  return { ...exam, subjects, studentCount: students.length };
}

export async function updateExam(schoolId, id, data, actor, ctx) {
  const exam = await loadExam(schoolId, id);
  if (exam.status === 'PUBLISHED') throw AppError.conflict('RESULTS_PUBLISHED', 'Unpublish the results before editing this exam');
  if (data.name && data.name !== exam.name) {
    const dup = await prisma.exam.findFirst({ where: { classId: exam.classId, name: data.name, id: { not: id } } });
    if (dup) throw AppError.conflict('DUPLICATE_EXAM', `${exam.class.name} already has an exam called "${data.name}"`);
  }
  const { subjects, ...fields } = data;
  const scale = await loadScale(schoolId);

  await prisma.$transaction(async (tx) => {
    await tx.exam.update({ where: { id }, data: fields });
    if (!subjects) return;
    await assertSubjectsInClass(exam.classId, subjects.map((s) => s.subjectId));

    const keep = new Set(subjects.map((s) => s.subjectId));
    for (const old of exam.subjects.filter((s) => !keep.has(s.subjectId))) {
      if (await tx.mark.count({ where: { examSubjectId: old.id } })) {
        throw AppError.conflict('SUBJECT_HAS_MARKS', `Marks have already been entered for ${old.subject.name}, so it can't be removed`);
      }
      await tx.examSubject.delete({ where: { id: old.id } });
    }
    for (const s of subjects) {
      const es = await tx.examSubject.upsert({
        where: { examId_subjectId: { examId: id, subjectId: s.subjectId } },
        update: subjectData(s),
        create: { examId: id, ...subjectData(s) },
      });
      // Re-grade marks already entered against the new full/pass marks.
      const marks = await tx.mark.findMany({ where: { examSubjectId: es.id } });
      for (const m of marks) {
        assertWithinLimits(m, es);
        const r = subjectResult(m, es, scale);
        await tx.mark.update({ where: { id: m.id }, data: { total: r.total, percentage: r.percentage, grade: r.grade, gradePoint: r.gradePoint, resultStatus: r.resultStatus } });
      }
    }
  });
  await audit({ action: 'EXAM_UPDATED', entity: 'Exam', entityId: id, actor, schoolId, metadata: { fields: Object.keys(data) }, ...ctx });
  return getExam(schoolId, id, actor);
}

// ───────────────────────── Marks ─────────────────────────

const hasComponents = (es) => [es.writtenMarks, es.mcqMarks, es.practicalMarks].some((v) => v != null);

/** Each component within its maximum; without components, the total within full marks. */
function assertWithinLimits(mark, es, studentName) {
  if (mark.isAbsent) return;
  const who = studentName ? `${studentName}: ` : '';
  const exceed = (msg) => {
    throw AppError.badRequest('MARKS_EXCEED_FULL_MARKS', `${who}${msg}`);
  };
  if (hasComponents(es)) {
    for (const [field, max, label] of [
      ['written', es.writtenMarks, 'Written'],
      ['mcq', es.mcqMarks, 'MCQ'],
      ['practical', es.practicalMarks, 'Practical'],
    ]) {
      const v = num(mark[field]);
      if (v == null) continue;
      if (max == null) throw AppError.badRequest('INVALID_MARKS', `${who}${label} marks aren't part of this exam`);
      if (v > Number(max)) exceed(`${label} marks (${v}) exceed the maximum of ${Number(max)}`);
    }
  }
  const total = (num(mark.written) ?? 0) + (num(mark.mcq) ?? 0) + (num(mark.practical) ?? 0);
  if (total > Number(es.fullMarks)) exceed(`total ${total} exceeds full marks of ${Number(es.fullMarks)}`);
}

export async function marksSheet(schoolId, examId, { subjectId, sectionId }, actor) {
  const exam = await loadExam(schoolId, examId);
  await assertCanViewExam(actor, schoolId, exam);
  const es = exam.subjects.find((s) => s.subjectId === subjectId);
  if (!es) throw AppError.notFound('SUBJECT_NOT_FOUND', 'This subject is not part of the exam');
  const [students, marks, canEdit] = await Promise.all([
    examStudents(exam, sectionId),
    prisma.mark.findMany({ where: { examSubjectId: es.id } }),
    canEnterMarks(actor, schoolId, exam, subjectId),
  ]);
  const byStudent = new Map(marks.map((m) => [m.studentId, m]));
  return {
    exam: { id: exam.id, name: exam.name, status: exam.status, class: { id: exam.class.id, name: exam.class.name } },
    sections: exam.class.sections.map((s) => ({ id: s.id, name: s.name })),
    examSubject: es,
    canEdit: canEdit && (exam.status !== 'PUBLISHED' || isAdmin(actor)),
    published: exam.status === 'PUBLISHED',
    scale: await loadScale(schoolId),
    students: students.map((e) => ({
      studentId: e.studentId,
      fullName: e.student.fullName,
      studentCode: e.student.studentCode,
      rollNumber: e.rollNumber,
      section: e.section,
      mark: byStudent.get(e.studentId) ?? null,
    })),
  };
}

/** Enter or correct marks for one subject. Grades and pass/fail are computed here. */
export async function enterMarks(schoolId, examId, { subjectId, marks }, actor, ctx) {
  const exam = await loadExam(schoolId, examId);
  const es = exam.subjects.find((s) => s.subjectId === subjectId);
  if (!es) throw AppError.notFound('SUBJECT_NOT_FOUND', 'This subject is not part of the exam');
  if (!(await canEnterMarks(actor, schoolId, exam, subjectId))) {
    throw AppError.forbidden('FORBIDDEN', 'Only the subject teacher or an administrator can enter these marks');
  }
  if (exam.status === 'PUBLISHED' && !isAdmin(actor)) throw published();

  const enrolled = new Map((await examStudents(exam)).map((e) => [e.studentId, e.student.fullName]));
  for (const m of marks) {
    if (!enrolled.has(m.studentId)) throw AppError.badRequest('STUDENT_NOT_IN_CLASS', 'Some students are not in this class');
    if (!m.isAbsent && m.written == null && m.mcq == null && m.practical == null) {
      throw AppError.badRequest('MARKS_REQUIRED', `${enrolled.get(m.studentId)}: enter marks or mark as absent`);
    }
    assertWithinLimits(m, es, enrolled.get(m.studentId));
  }

  const scale = await loadScale(schoolId);
  await prisma.$transaction(
    marks.map((m) => {
      const r = subjectResult(m, es, scale);
      const values = {
        written: m.isAbsent ? null : (m.written ?? null),
        mcq: m.isAbsent ? null : (m.mcq ?? null),
        practical: m.isAbsent ? null : (m.practical ?? null),
        isAbsent: m.isAbsent,
        total: r.total,
        percentage: r.percentage,
        grade: r.grade,
        gradePoint: r.gradePoint,
        resultStatus: r.resultStatus,
        enteredById: actor.id,
      };
      return prisma.mark.upsert({
        where: { examSubjectId_studentId: { examSubjectId: es.id, studentId: m.studentId } },
        update: values,
        create: { examSubjectId: es.id, studentId: m.studentId, ...values },
      });
    }),
  );
  await audit({
    action: exam.status === 'PUBLISHED' ? 'MARKS_AMENDED_AFTER_PUBLICATION' : 'MARKS_ENTERED',
    entity: 'Exam',
    entityId: exam.id,
    actor,
    schoolId,
    metadata: { subjectId, count: marks.length },
    ...ctx,
  });
  return { saved: marks.length };
}

// ───────────────────────── Results ─────────────────────────

/** Class results for an exam: per-student totals, GPA, grade, pass/fail and merit position. */
async function computeResults(schoolId, exam, sectionId) {
  const [students, marks, scale] = await Promise.all([
    examStudents(exam, sectionId),
    prisma.mark.findMany({ where: { examSubject: { examId: exam.id } } }),
    loadScale(schoolId),
  ]);
  const esById = new Map(exam.subjects.map((s) => [s.id, s]));
  const marksByStudent = new Map();
  for (const m of marks) marksByStudent.set(m.studentId, [...(marksByStudent.get(m.studentId) ?? []), m]);

  const rows = students.map((e) => {
    const own = marksByStudent.get(e.studentId) ?? [];
    const subjects = own.map((m) => ({
      subjectId: esById.get(m.examSubjectId).subjectId,
      written: num(m.written),
      mcq: num(m.mcq),
      practical: num(m.practical),
      total: num(m.total),
      fullMarks: num(esById.get(m.examSubjectId).fullMarks),
      grade: m.grade,
      gradePoint: num(m.gradePoint),
      resultStatus: m.resultStatus,
      isAbsent: m.isAbsent,
    }));
    const complete = subjects.length === exam.subjects.length;
    const overall = complete ? overallResult(subjects, scale) : { gpa: null, grade: null, result: 'INCOMPLETE', totalMarks: round2(subjects.reduce((a, s) => a + s.total, 0)), fullMarks: null };
    return {
      studentId: e.studentId,
      fullName: e.student.fullName,
      studentCode: e.student.studentCode,
      rollNumber: e.rollNumber,
      section: e.section,
      subjects,
      ...overall,
    };
  });

  const ranked = rankResults(rows.filter((r) => r.result !== 'INCOMPLETE'));
  const position = new Map(ranked.map((r) => [r.studentId, r.position]));
  const withPosition = rows
    .map((r) => ({ ...r, position: position.get(r.studentId) ?? null }))
    .sort((a, b) => (a.position ?? 1e9) - (b.position ?? 1e9) || a.rollNumber - b.rollNumber);

  const done = rows.filter((r) => r.result !== 'INCOMPLETE');
  const passed = done.filter((r) => r.result === 'PASS');
  return {
    exam: {
      id: exam.id,
      name: exam.name,
      status: exam.status,
      publishedAt: exam.publishedAt,
      class: { id: exam.class.id, name: exam.class.name },
      academicYear: { id: exam.academicYear.id, name: exam.academicYear.name },
    },
    subjects: exam.subjects.map((s) => ({ id: s.subjectId, name: s.subject.name, code: s.subject.code, fullMarks: num(s.fullMarks), passMarks: num(s.passMarks) })),
    rows: withPosition,
    summary: {
      students: rows.length,
      complete: done.length,
      passed: passed.length,
      failed: done.length - passed.length,
      passRate: done.length ? round2((passed.length / done.length) * 100) : null,
      averageGpa: passed.length ? round2(passed.reduce((a, r) => a + r.gpa, 0) / passed.length) : null,
      highestGpa: passed.length ? Math.max(...passed.map((r) => r.gpa)) : null,
    },
  };
}

export async function examResults(schoolId, examId, { sectionId }, actor) {
  const exam = await loadExam(schoolId, examId);
  await assertCanViewExam(actor, schoolId, exam);
  return computeResults(schoolId, exam, sectionId);
}

/** Results can't be published until every student has marks in every subject. */
export async function publishResults(schoolId, examId, actor, ctx) {
  const exam = await loadExam(schoolId, examId);
  if (exam.status === 'PUBLISHED') throw AppError.conflict('ALREADY_PUBLISHED', 'Results are already published');
  const students = (await examStudents(exam)).filter((e) => e.status === 'ACTIVE');
  if (students.length === 0) throw AppError.badRequest('RESULTS_INCOMPLETE', 'No students are enrolled in this class');

  const missing = [];
  for (const s of exam.subjects) {
    const entered = await prisma.mark.count({ where: { examSubjectId: s.id, studentId: { in: students.map((e) => e.studentId) } } });
    if (entered < students.length) missing.push({ subject: s.subject.name, missing: students.length - entered });
  }
  if (missing.length) {
    throw AppError.badRequest(
      'RESULTS_INCOMPLETE',
      `Marks are missing: ${missing.map((m) => `${m.subject} (${m.missing})`).join(', ')}`,
      missing,
    );
  }

  await prisma.exam.update({ where: { id: examId }, data: { status: 'PUBLISHED', publishedAt: new Date(), publishedById: actor.id } });
  await audit({ action: 'RESULTS_PUBLISHED', entity: 'Exam', entityId: examId, actor, schoolId, ...ctx });
  return getExam(schoolId, examId, actor);
}

export async function unpublishResults(schoolId, examId, actor, ctx) {
  const exam = await loadExam(schoolId, examId);
  if (exam.status !== 'PUBLISHED') throw AppError.conflict('NOT_PUBLISHED', 'Results are not published');
  await prisma.exam.update({ where: { id: examId }, data: { status: 'COMPLETED', publishedAt: null, publishedById: null } });
  await audit({ action: 'RESULTS_UNPUBLISHED', entity: 'Exam', entityId: examId, actor, schoolId, ...ctx });
  return getExam(schoolId, examId, actor);
}

// ───────────────────────── Per-student ─────────────────────────

/** A student's report card for one exam. Students/parents only see published results. */
export async function reportCard(schoolId, examId, studentId, actor) {
  await assertCanViewStudent(actor, schoolId, studentId);
  const exam = await loadExam(schoolId, examId);
  const staff = isAdmin(actor) || actor.role.key === ROLES.TEACHER;
  if (!staff && exam.status !== 'PUBLISHED') throw AppError.notFound('RESULT_NOT_PUBLISHED', 'This result has not been published yet');

  const results = await computeResults(schoolId, exam);
  const row = results.rows.find((r) => r.studentId === studentId);
  if (!row) throw AppError.notFound('RESULT_NOT_FOUND', 'This student did not sit this exam');
  const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { name: true, address: true, code: true } });
  const scale = await loadScale(schoolId);
  const subjectName = new Map(results.subjects.map((s) => [s.id, s]));
  return {
    school,
    exam: results.exam,
    student: { id: row.studentId, fullName: row.fullName, studentCode: row.studentCode, rollNumber: row.rollNumber, section: row.section },
    subjects: results.subjects.map((s) => {
      const m = row.subjects.find((x) => x.subjectId === s.id);
      return { ...subjectName.get(s.id), ...(m ?? { total: null, grade: null, gradePoint: null, resultStatus: 'PENDING' }) };
    }),
    overall: { gpa: row.gpa, grade: row.grade, result: row.result, totalMarks: row.totalMarks, fullMarks: row.fullMarks, position: row.position, outOf: results.summary.complete },
    scale,
  };
}

/** Published results for a student across exams (portal view). */
export async function studentResults(schoolId, studentId, actor) {
  const student = await assertCanViewStudent(actor, schoolId, studentId);
  const enrollments = await prisma.enrollment.findMany({ where: { studentId: student.id }, select: { classId: true } });
  const exams = await prisma.exam.findMany({
    where: { schoolId, status: 'PUBLISHED', classId: { in: enrollments.map((e) => e.classId) } },
    orderBy: { publishedAt: 'desc' },
    include: { class: { include: { sections: true } }, academicYear: true, subjects: { include: { subject: true } } },
  });
  const out = [];
  for (const exam of exams) {
    const results = await computeResults(schoolId, exam);
    const row = results.rows.find((r) => r.studentId === studentId);
    if (!row) continue;
    out.push({
      exam: results.exam,
      gpa: row.gpa,
      grade: row.grade,
      result: row.result,
      totalMarks: row.totalMarks,
      fullMarks: row.fullMarks,
      position: row.position,
      outOf: results.summary.complete,
      subjects: row.subjects.map((s) => ({ ...s, name: results.subjects.find((x) => x.id === s.subjectId)?.name })),
    });
  }
  return out;
}
