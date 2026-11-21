import { prisma } from '../config/prisma.js';
import { ROLES } from '../config/roles.js';
import { AppError } from '../utils/AppError.js';
import { isAdmin, linkedStudentIds, teacherForUser } from './access.service.js';
import { getNotice } from './notice.service.js';

async function canViewAssignment(actor, schoolId, assignment) {
  if (isAdmin(actor)) return true;
  if (actor.role.key === ROLES.TEACHER) {
    const teacher = await teacherForUser(actor, schoolId);
    return teacher?.id === assignment.teacherId;
  }

  let studentIds = [];
  if (actor.role.key === ROLES.STUDENT) {
    const student = await prisma.student.findFirst({
      where: { userId: actor.id, schoolId, deletedAt: null },
      select: { id: true },
    });
    if (student) studentIds = [student.id];
  } else if (actor.role.key === ROLES.PARENT) {
    studentIds = await linkedStudentIds(actor, schoolId);
  }
  if (!studentIds.length) return false;

  return Boolean(await prisma.enrollment.findFirst({
    where: {
      studentId: { in: studentIds },
      classId: assignment.classId,
      ...(assignment.sectionId ? { sectionId: assignment.sectionId } : {}),
      status: 'ACTIVE',
      academicYear: { status: 'ACTIVE' },
    },
    select: { id: true },
  }));
}

async function canViewSubmission(actor, schoolId, submission) {
  if (isAdmin(actor)) return true;
  if (actor.role.key === ROLES.STUDENT) {
    return Boolean(await prisma.student.findFirst({
      where: { id: submission.studentId, userId: actor.id, schoolId, deletedAt: null },
      select: { id: true },
    }));
  }
  if (actor.role.key === ROLES.PARENT) {
    return (await linkedStudentIds(actor, schoolId)).includes(submission.studentId);
  }
  if (actor.role.key === ROLES.TEACHER) {
    const teacher = await teacherForUser(actor, schoolId);
    return teacher?.id === submission.assignment.teacherId;
  }
  return false;
}

export async function assertCanAccessFile(schoolId, filename, actor) {
  const attachmentUrl = `/api/files/${filename}`;
  const [registered] = await prisma.$queryRaw`
    SELECT "uploaderId" FROM "uploaded_files" WHERE "filename" = ${filename} AND "schoolId" = ${schoolId} LIMIT 1
  `;
  if (registered?.uploaderId === actor.id || (registered && isAdmin(actor))) return;

  const assignments = await prisma.assignment.findMany({
    where: { schoolId, attachmentUrl },
    select: { classId: true, sectionId: true, teacherId: true },
  });
  for (const assignment of assignments) {
    if (await canViewAssignment(actor, schoolId, assignment)) return;
  }

  const submissions = await prisma.submission.findMany({
    where: { attachmentUrl, assignment: { schoolId } },
    select: { studentId: true, assignment: { select: { teacherId: true } } },
  });
  for (const submission of submissions) {
    if (await canViewSubmission(actor, schoolId, submission)) return;
  }

  const notices = await prisma.notice.findMany({
    where: { schoolId, attachmentUrl },
    select: { id: true },
  });
  for (const notice of notices) {
    try {
      await getNotice(schoolId, notice.id, actor);
      return;
    } catch (error) {
      if (error.code !== 'NOTICE_NOT_FOUND') throw error;
    }
  }

  if (registered) throw AppError.forbidden('FILE_ACCESS_FORBIDDEN', 'You do not have access to this file');
  throw AppError.notFound('FILE_NOT_FOUND', 'File not found');
}
