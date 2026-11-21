// Row-level access rules shared by every module that touches student data.
import { prisma } from '../config/prisma.js';
import { ADMIN_ROLES, ROLES } from '../config/roles.js';
import { AppError } from '../utils/AppError.js';

export const isAdmin = (user) => ADMIN_ROLES.includes(user.role.key);

/**
 * Sections/classes a teacher works with in a given academic year:
 * classes where they teach a subject, and sections where they're class teacher.
 * Returns null for admins (no restriction).
 */
export async function teacherScope(user, schoolId, academicYearId) {
  if (user.role.key !== ROLES.TEACHER) return null;
  const teacher = await prisma.teacher.findFirst({
    where: { userId: user.id, schoolId },
    include: {
      classSubjects: { where: { class: { academicYearId } }, select: { classId: true, subjectId: true } },
      sectionsAsClassTchr: { where: { class: { academicYearId } }, select: { id: true } },
    },
  });
  return {
    teacherId: teacher?.id ?? null,
    classIds: [...new Set(teacher?.classSubjects.map((c) => c.classId) ?? [])],
    classSubjects: teacher?.classSubjects ?? [],
    sectionIds: teacher?.sectionsAsClassTchr.map((s) => s.id) ?? [],
  };
}

export function scopeToEnrollmentWhere(scope) {
  return { OR: [{ classId: { in: scope.classIds } }, { sectionId: { in: scope.sectionIds } }] };
}

/** The teacher profile linked to this login (or null). */
export function teacherForUser(user, schoolId) {
  return prisma.teacher.findFirst({ where: { userId: user.id, schoolId } });
}

/** Admins: any section. Teachers: sections in their scope. Others: never. */
export async function assertCanManageSection(user, schoolId, section) {
  if (isAdmin(user)) return;
  if (user.role.key !== ROLES.TEACHER) throw AppError.forbidden();
  const scope = await teacherScope(user, schoolId, section.class.academicYearId);
  if (!scope.classIds.includes(section.classId) && !scope.sectionIds.includes(section.id)) {
    throw AppError.forbidden('FORBIDDEN', 'You do not teach this class');
  }
}

/** Student IDs a parent account is linked to. */
export async function linkedStudentIds(user, schoolId) {
  const guardian = await prisma.guardian.findFirst({
    where: { userId: user.id, schoolId },
    include: { students: { select: { studentId: true } } },
  });
  return guardian?.students.map((s) => s.studentId) ?? [];
}

/**
 * May this user see this student's private records?
 * Admin: any in school · Teacher: their classes this year · Student: self · Parent: linked children.
 * Anyone else → 403 FORBIDDEN (per spec, also for parents probing other children).
 */
export async function assertCanViewStudent(user, schoolId, studentId) {
  const student = await prisma.student.findFirst({
    where: { id: studentId, schoolId, deletedAt: null },
    include: {
      enrollments: { where: { status: 'ACTIVE' }, include: { academicYear: true } },
    },
  });
  if (!student) throw AppError.notFound('STUDENT_NOT_FOUND', 'Student not found');
  if (isAdmin(user)) return student;

  switch (user.role.key) {
    case ROLES.STUDENT:
      if (student.userId === user.id) return student;
      break;
    case ROLES.PARENT:
      if ((await linkedStudentIds(user, schoolId)).includes(studentId)) return student;
      break;
    case ROLES.TEACHER: {
      for (const e of student.enrollments) {
        const scope = await teacherScope(user, schoolId, e.academicYearId);
        if (scope.classIds.includes(e.classId) || scope.sectionIds.includes(e.sectionId)) return student;
      }
      break;
    }
    default:
      break;
  }
  throw AppError.forbidden('FORBIDDEN', 'You do not have access to this student');
}

/** Financial records are private to admins, the student, or a linked parent. */
export async function assertCanViewStudentFinance(user, schoolId, studentId) {
  if (user.role.key === ROLES.TEACHER) {
    throw AppError.forbidden('FORBIDDEN', 'Teachers cannot view student financial records');
  }
  return assertCanViewStudent(user, schoolId, studentId);
}

/** The student profile linked to a STUDENT login. */
export async function studentForUser(user, schoolId) {
  const student = await prisma.student.findFirst({ where: { userId: user.id, schoolId, deletedAt: null } });
  if (!student) throw AppError.notFound('STUDENT_NOT_FOUND', 'No student profile is linked to this account');
  return student;
}
