import { prisma } from '../config/prisma.js';
import { ROLES } from '../config/roles.js';
import { AppError } from '../utils/AppError.js';
import { audit } from '../utils/audit.js';
import { resolveAcademicYear } from './academic.service.js';
import { assertCanViewStudent, isAdmin, studentForUser, teacherForUser } from './access.service.js';
import { assertUploadOwned } from './upload.service.js';

const include = {
  class: { select: { id: true, name: true } },
  section: { select: { id: true, name: true } },
  subject: { select: { id: true, name: true, code: true } },
  teacher: { select: { id: true, fullName: true } },
};

async function loadAssignment(schoolId, id) {
  const a = await prisma.assignment.findFirst({ where: { id, schoolId }, include });
  if (!a) throw AppError.notFound('ASSIGNMENT_NOT_FOUND', 'Assignment not found');
  return a;
}

/** Owning teacher or an admin may change/grade an assignment. */
async function assertCanManage(actor, schoolId, assignment) {
  if (isAdmin(actor)) return;
  const teacher = await teacherForUser(actor, schoolId);
  if (!teacher || teacher.id !== assignment.teacherId) throw AppError.forbidden('FORBIDDEN', 'Only the teacher who set this homework can change it');
}

/** The student's active enrollment this year (section + class). */
async function currentEnrollment(schoolId, studentId) {
  const year = await resolveAcademicYear(schoolId);
  return prisma.enrollment.findFirst({ where: { studentId, academicYearId: year.id, status: 'ACTIVE' } });
}

const isFor = (assignment, enrollment) =>
  Boolean(enrollment) && assignment.classId === enrollment.classId && (!assignment.sectionId || assignment.sectionId === enrollment.sectionId);

// ───────────────────────── Teachers & admins ─────────────────────────

export async function createAssignment(schoolId, data, actor, ctx) {
  const klass = await prisma.class.findFirst({ where: { id: data.classId, schoolId }, include: { sections: true } });
  if (!klass) throw AppError.notFound('CLASS_NOT_FOUND', 'Class not found');
  if (data.sectionId && !klass.sections.some((s) => s.id === data.sectionId)) {
    throw AppError.notFound('SECTION_NOT_FOUND', 'Section not found in this class');
  }
  const cs = await prisma.classSubject.findUnique({ where: { classId_subjectId: { classId: klass.id, subjectId: data.subjectId } } });
  if (!cs) throw AppError.badRequest('SUBJECT_NOT_IN_CLASS', 'This subject is not taught in this class');

  // Teachers set homework for subjects they teach; admins name the teacher (default: the subject teacher).
  let teacherId;
  if (isAdmin(actor)) {
    teacherId = data.teacherId ?? cs.teacherId;
    if (!teacherId) throw AppError.badRequest('TEACHER_REQUIRED', 'Choose the teacher for this homework');
  } else {
    const teacher = await teacherForUser(actor, schoolId);
    if (!teacher || cs.teacherId !== teacher.id) throw AppError.forbidden('FORBIDDEN', 'You can only set homework for subjects you teach in this class');
    teacherId = teacher.id;
  }

  await assertUploadOwned(schoolId, data.attachmentUrl, actor);
  const a = await prisma.assignment.create({
    data: {
      schoolId,
      classId: klass.id,
      sectionId: data.sectionId ?? null,
      subjectId: data.subjectId,
      teacherId,
      title: data.title,
      description: data.description,
      assignedDate: data.assignedDate ?? new Date(new Date().toISOString().slice(0, 10)),
      dueDate: data.dueDate,
      attachmentUrl: data.attachmentUrl ?? null,
      totalMarks: data.totalMarks ?? null,
      allowResubmission: data.allowResubmission,
    },
    include,
  });
  await audit({ action: 'ASSIGNMENT_CREATED', entity: 'Assignment', entityId: a.id, actor, schoolId, ...ctx });
  return a;
}

export async function updateAssignment(schoolId, id, data, actor, ctx) {
  const a = await loadAssignment(schoolId, id);
  await assertCanManage(actor, schoolId, a);
  if (data.attachmentUrl !== undefined && data.attachmentUrl !== a.attachmentUrl) {
    await assertUploadOwned(schoolId, data.attachmentUrl, actor);
  }
  const updated = await prisma.assignment.update({ where: { id }, data, include });
  await audit({ action: 'ASSIGNMENT_UPDATED', entity: 'Assignment', entityId: id, actor, schoolId, ...ctx });
  return updated;
}

export async function deleteAssignment(schoolId, id, actor, ctx) {
  const a = await loadAssignment(schoolId, id);
  await assertCanManage(actor, schoolId, a);
  if (await prisma.submission.count({ where: { assignmentId: id } })) {
    throw AppError.conflict('ASSIGNMENT_HAS_SUBMISSIONS', 'Students have already submitted work for this homework');
  }
  await prisma.assignment.delete({ where: { id } });
  await audit({ action: 'ASSIGNMENT_DELETED', entity: 'Assignment', entityId: id, actor, schoolId, ...ctx });
  return { deleted: true };
}

/**
 * Homework list for whoever is asking:
 * teachers → their own; admins → all; students → their class; parents → ?studentId.
 */
export async function listAssignments(schoolId, query, actor) {
  const filters = {
    schoolId,
    ...(query.classId ? { classId: query.classId } : {}),
    ...(query.subjectId ? { subjectId: query.subjectId } : {}),
  };
  const now = new Date();
  if (query.when === 'upcoming') filters.dueDate = { gte: now };
  if (query.when === 'past') filters.dueDate = { lt: now };

  let studentId = null;
  if (actor.role.key === ROLES.TEACHER) {
    const teacher = await teacherForUser(actor, schoolId);
    filters.teacherId = teacher?.id ?? '__none__';
  } else if (actor.role.key === ROLES.STUDENT || actor.role.key === ROLES.PARENT) {
    studentId = actor.role.key === ROLES.STUDENT ? (await studentForUser(actor, schoolId)).id : query.studentId;
    if (!studentId) throw AppError.badRequest('STUDENT_REQUIRED', 'Choose a student');
    await assertCanViewStudent(actor, schoolId, studentId);
    const e = await currentEnrollment(schoolId, studentId);
    if (!e) return [];
    Object.assign(filters, { classId: e.classId, OR: [{ sectionId: null }, { sectionId: e.sectionId }] });
  }

  const rows = await prisma.assignment.findMany({
    where: filters,
    orderBy: { dueDate: query.when === 'past' ? 'desc' : 'asc' },
    take: 200,
    include: {
      ...include,
      _count: { select: { submissions: true } },
      ...(studentId ? { submissions: { where: { studentId } } } : {}),
    },
  });
  return rows.map(({ submissions, ...a }) => (studentId ? { ...a, mySubmission: submissions[0] ?? null } : a));
}

export async function getAssignment(schoolId, id, actor) {
  const a = await loadAssignment(schoolId, id);
  if (isAdmin(actor) || actor.role.key === ROLES.TEACHER) {
    if (actor.role.key === ROLES.TEACHER) await assertCanManage(actor, schoolId, a);
    return a;
  }
  // Students/parents: only homework set for their class.
  const studentId = actor.role.key === ROLES.STUDENT ? (await studentForUser(actor, schoolId)).id : null;
  if (studentId && !isFor(a, await currentEnrollment(schoolId, studentId))) {
    throw AppError.forbidden('FORBIDDEN', 'This homework is not for your class');
  }
  if (actor.role.key === ROLES.PARENT) throw AppError.forbidden();
  const mySubmission = await prisma.submission.findUnique({ where: { assignmentId_studentId: { assignmentId: id, studentId } } });
  return { ...a, mySubmission };
}

/** Everyone the homework is for, with their submission (or not yet). */
export async function listSubmissions(schoolId, id, actor) {
  const a = await loadAssignment(schoolId, id);
  await assertCanManage(actor, schoolId, a);
  const [roster, subs] = await Promise.all([
    prisma.enrollment.findMany({
      where: { classId: a.classId, status: 'ACTIVE', ...(a.sectionId ? { sectionId: a.sectionId } : {}), student: { deletedAt: null, status: 'ACTIVE' } },
      orderBy: [{ section: { name: 'asc' } }, { rollNumber: 'asc' }],
      include: { student: { select: { id: true, fullName: true, studentCode: true } }, section: { select: { name: true } } },
    }),
    prisma.submission.findMany({ where: { assignmentId: id } }),
  ]);
  const byStudent = new Map(subs.map((s) => [s.studentId, s]));
  const rows = roster.map((e) => ({ student: e.student, section: e.section, rollNumber: e.rollNumber, submission: byStudent.get(e.studentId) ?? null }));
  return {
    assignment: a,
    summary: {
      students: rows.length,
      submitted: rows.filter((r) => r.submission).length,
      late: rows.filter((r) => r.submission?.isLate).length,
      graded: rows.filter((r) => r.submission?.status === 'GRADED').length,
    },
    rows,
  };
}

export async function gradeSubmission(schoolId, submissionId, { marks, feedback }, actor, ctx) {
  const sub = await prisma.submission.findFirst({ where: { id: submissionId, assignment: { schoolId } }, include: { assignment: true } });
  if (!sub) throw AppError.notFound('SUBMISSION_NOT_FOUND', 'Submission not found');
  await assertCanManage(actor, schoolId, sub.assignment);
  if (marks != null && sub.assignment.totalMarks != null && marks > Number(sub.assignment.totalMarks)) {
    throw AppError.badRequest('MARKS_EXCEED_FULL_MARKS', `Marks cannot exceed ${Number(sub.assignment.totalMarks)}`);
  }
  const updated = await prisma.submission.update({
    where: { id: submissionId },
    data: { marks: marks ?? null, feedback: feedback ?? null, status: 'GRADED', gradedById: actor.id, gradedAt: new Date() },
  });
  await audit({ action: 'SUBMISSION_GRADED', entity: 'Submission', entityId: submissionId, actor, schoolId, ...ctx });
  return updated;
}

// ───────────────────────── Students ─────────────────────────

/**
 * Hand in homework. Only for your own class; after the deadline it's marked late;
 * one final version unless the teacher allowed resubmission (and hasn't graded it).
 */
export async function submitAssignment(schoolId, id, data, actor, ctx) {
  if (actor.role.key !== ROLES.STUDENT) throw AppError.forbidden('FORBIDDEN', 'Only students can submit homework');
  const student = await studentForUser(actor, schoolId);
  const a = await loadAssignment(schoolId, id);
  if (!isFor(a, await currentEnrollment(schoolId, student.id))) {
    throw AppError.forbidden('NOT_YOUR_CLASS', 'You can only submit homework set for your class');
  }
  if (!data.content && !data.attachmentUrl) throw AppError.badRequest('SUBMISSION_EMPTY', 'Write an answer or attach a file');
  if (data.attachmentUrl) await assertUploadOwned(schoolId, data.attachmentUrl, actor);

  const now = new Date();
  const isLate = now > a.dueDate;
  const existing = await prisma.submission.findUnique({ where: { assignmentId_studentId: { assignmentId: id, studentId: student.id } } });

  let submission;
  if (existing) {
    if (!a.allowResubmission) throw AppError.conflict('ALREADY_SUBMITTED', 'You have already submitted this homework');
    if (existing.status === 'GRADED') throw AppError.conflict('ALREADY_GRADED', 'This homework has already been graded');
    submission = await prisma.submission.update({
      where: { id: existing.id },
      data: {
        content: data.content ?? null,
        attachmentUrl: data.attachmentUrl ?? null,
        submittedAt: now,
        isLate,
        status: isLate ? 'LATE' : 'SUBMITTED',
        version: existing.version + 1,
      },
    });
  } else {
    submission = await prisma.submission.create({
      data: {
        assignmentId: id,
        studentId: student.id,
        content: data.content ?? null,
        attachmentUrl: data.attachmentUrl ?? null,
        submittedAt: now,
        isLate,
        status: isLate ? 'LATE' : 'SUBMITTED',
      },
    });
  }
  await audit({ action: 'HOMEWORK_SUBMITTED', entity: 'Submission', entityId: submission.id, actor, schoolId, metadata: { isLate, version: submission.version }, ...ctx });
  return submission;
}
