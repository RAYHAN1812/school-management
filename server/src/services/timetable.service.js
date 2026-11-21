import { prisma } from '../config/prisma.js';
import { ROLES } from '../config/roles.js';
import { AppError } from '../utils/AppError.js';
import { audit } from '../utils/audit.js';
import { minutesToTime, timeToMinutes } from '../utils/calculations.js';
import { DAYS } from '../validators/operations.validators.js';
import { assertAssignableTeacher, findSectionOrThrow, resolveAcademicYear } from './academic.service.js';
import { assertCanViewStudent, studentForUser, teacherForUser } from './access.service.js';

const include = {
  subject: { select: { id: true, name: true, code: true } },
  teacher: { select: { id: true, fullName: true, employeeCode: true } },
  class: { select: { id: true, name: true } },
  section: { select: { id: true, name: true } },
};

const present = (e) => ({ ...e, startTime: minutesToTime(e.startMinute), endTime: minutesToTime(e.endMinute) });
const byDayThenTime = (a, b) => DAYS.indexOf(a.dayOfWeek) - DAYS.indexOf(b.dayOfWeek) || a.startMinute - b.startMinute;
const titleDay = (d) => d.charAt(0) + d.slice(1).toLowerCase();

/**
 * The spec's three clash rules, checked against the same academic year:
 * one section can't have two periods at once, a teacher can't be in two
 * places at once, and a room can't host two classes at once.
 */
async function assertNoConflict({ schoolId, academicYearId, sectionId, teacherId, roomNumber, dayOfWeek, startMinute, endMinute, exceptId }) {
  const clashes = await prisma.timetable.findMany({
    where: {
      schoolId,
      academicYearId,
      dayOfWeek,
      startMinute: { lt: endMinute },
      endMinute: { gt: startMinute },
      ...(exceptId ? { id: { not: exceptId } } : {}),
      OR: [
        { sectionId },
        { teacherId },
        ...(roomNumber ? [{ roomNumber: { equals: roomNumber, mode: 'insensitive' } }] : []),
      ],
    },
    include,
  });
  if (clashes.length === 0) return;

  const conflicts = clashes.map((c) => {
    const kind = c.sectionId === sectionId ? 'SECTION' : c.teacherId === teacherId ? 'TEACHER' : 'ROOM';
    const when = `${titleDay(c.dayOfWeek)} ${minutesToTime(c.startMinute)}–${minutesToTime(c.endMinute)}`;
    const message = {
      SECTION: `${c.class.name} ${c.section.name} already has ${c.subject.name} on ${when}`,
      TEACHER: `${c.teacher.fullName} already teaches ${c.class.name} ${c.section.name} on ${when}`,
      ROOM: `Room ${c.roomNumber} is already used by ${c.class.name} ${c.section.name} on ${when}`,
    }[kind];
    return { type: kind, entryId: c.id, message };
  });
  throw new AppError(409, 'TIMETABLE_CONFLICT', conflicts[0].message, { conflicts });
}

async function resolveEntry(schoolId, data, exceptId) {
  const section = await findSectionOrThrow(schoolId, data.classId, data.sectionId).catch(async (err) => {
    const klass = await prisma.class.findFirst({ where: { id: data.classId, schoolId } });
    if (!klass) throw AppError.notFound('CLASS_NOT_FOUND', 'Class not found');
    throw err;
  });
  const taught = await prisma.classSubject.findUnique({
    where: { classId_subjectId: { classId: section.classId, subjectId: data.subjectId } },
  });
  if (!taught) throw AppError.badRequest('SUBJECT_NOT_IN_CLASS', 'This subject is not taught in this class. Add it to the class first.');

  const startMinute = timeToMinutes(data.startTime);
  const endMinute = timeToMinutes(data.endTime);
  const roomNumber = data.roomNumber ?? section.roomNumber ?? null; // default to the section's home room
  const entry = {
    schoolId,
    academicYearId: section.class.academicYearId,
    classId: section.classId,
    sectionId: section.id,
    subjectId: data.subjectId,
    teacherId: data.teacherId,
    dayOfWeek: data.dayOfWeek,
    startMinute,
    endMinute,
    roomNumber,
  };
  await assertNoConflict({ ...entry, exceptId });
  return entry;
}

export async function createEntry(schoolId, data, actor, ctx) {
  await assertAssignableTeacher(schoolId, data.teacherId);
  const entry = await resolveEntry(schoolId, data);
  const created = await prisma.timetable.create({ data: entry, include });
  await audit({ action: 'TIMETABLE_CREATED', entity: 'Timetable', entityId: created.id, actor, schoolId, ...ctx });
  return present(created);
}

export async function updateEntry(schoolId, id, patch, actor, ctx) {
  const current = await prisma.timetable.findFirst({ where: { id, schoolId } });
  if (!current) throw AppError.notFound('TIMETABLE_NOT_FOUND', 'Timetable entry not found');
  const merged = {
    classId: patch.classId ?? current.classId,
    sectionId: patch.sectionId ?? current.sectionId,
    subjectId: patch.subjectId ?? current.subjectId,
    teacherId: patch.teacherId ?? current.teacherId,
    dayOfWeek: patch.dayOfWeek ?? current.dayOfWeek,
    startTime: patch.startTime ?? minutesToTime(current.startMinute),
    endTime: patch.endTime ?? minutesToTime(current.endMinute),
    roomNumber: patch.roomNumber === undefined ? current.roomNumber : patch.roomNumber,
  };
  if (timeToMinutes(merged.endTime) <= timeToMinutes(merged.startTime)) {
    throw AppError.badRequest('VALIDATION_ERROR', 'End time must be after the start time', [
      { field: 'endTime', message: 'End time must be after the start time' },
    ]);
  }
  if (merged.teacherId !== current.teacherId) await assertAssignableTeacher(schoolId, merged.teacherId);
  const entry = await resolveEntry(schoolId, merged, id);
  const updated = await prisma.timetable.update({ where: { id }, data: entry, include });
  await audit({ action: 'TIMETABLE_UPDATED', entity: 'Timetable', entityId: id, actor, schoolId, ...ctx });
  return present(updated);
}

export async function deleteEntry(schoolId, id, actor, ctx) {
  const current = await prisma.timetable.findFirst({ where: { id, schoolId } });
  if (!current) throw AppError.notFound('TIMETABLE_NOT_FOUND', 'Timetable entry not found');
  await prisma.timetable.delete({ where: { id } });
  await audit({ action: 'TIMETABLE_DELETED', entity: 'Timetable', entityId: id, actor, schoolId, ...ctx });
  return { deleted: true };
}

export async function listEntries(schoolId, query, actor) {
  const year = await resolveAcademicYear(schoolId, query.academicYearId);
  let teacherFilter = {};
  if (actor.role.key === ROLES.TEACHER) {
    const teacher = await teacherForUser(actor, schoolId);
    if (!teacher) return [];
    teacherFilter = { teacherId: teacher.id };
  }
  const entries = await prisma.timetable.findMany({
    where: {
      schoolId,
      academicYearId: year.id,
      ...teacherFilter,
      ...(query.classId ? { classId: query.classId } : {}),
      ...(query.sectionId ? { sectionId: query.sectionId } : {}),
      ...(query.teacherId && actor.role.key !== ROLES.TEACHER ? { teacherId: query.teacherId } : {}),
      ...(query.dayOfWeek ? { dayOfWeek: query.dayOfWeek } : {}),
    },
    include,
  });
  return entries.sort(byDayThenTime).map(present);
}

/**
 * The signed-in user's own routine: a teacher's teaching schedule, a student's
 * section routine, or (with ?studentId) a parent's child's routine.
 */
export async function myTimetable(schoolId, actor, { studentId }) {
  const year = await resolveAcademicYear(schoolId);
  let where;
  let owner;

  if (actor.role.key === ROLES.TEACHER) {
    const teacher = await teacherForUser(actor, schoolId);
    if (!teacher) return { owner: null, entries: [] };
    where = { teacherId: teacher.id };
    owner = { type: 'teacher', name: teacher.fullName };
  } else {
    let sid = studentId;
    if (actor.role.key === ROLES.STUDENT) sid = (await studentForUser(actor, schoolId)).id;
    if (!sid) throw AppError.badRequest('STUDENT_REQUIRED', 'Choose a student');
    const student = await assertCanViewStudent(actor, schoolId, sid);
    const enrollment = student.enrollments.find((e) => e.academicYearId === year.id);
    if (!enrollment) return { owner: { type: 'student', name: student.fullName }, entries: [] };
    where = { sectionId: enrollment.sectionId };
    owner = { type: 'student', name: student.fullName };
  }

  const entries = await prisma.timetable.findMany({ where: { schoolId, academicYearId: year.id, ...where }, include });
  return { owner, entries: entries.sort(byDayThenTime).map(present) };
}
