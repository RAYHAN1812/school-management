import { prisma } from '../config/prisma.js';
import { ROLES } from '../config/roles.js';
import { AppError } from '../utils/AppError.js';
import { audit } from '../utils/audit.js';
import { teacherScope } from './access.service.js';

const teacherBrief = { select: { id: true, fullName: true, employeeCode: true, status: true } };
const activeEnrollmentCount = { _count: { select: { enrollments: { where: { status: 'ACTIVE' } } } } };

// ───────────────────────── Shared checks ─────────────────────────

/** Active academic year (or the given one), scoped to the school. */
export async function resolveAcademicYear(schoolId, academicYearId, db = prisma) {
  const year = academicYearId
    ? await db.academicYear.findFirst({ where: { id: academicYearId, schoolId } })
    : await db.academicYear.findFirst({ where: { schoolId, status: 'ACTIVE' }, orderBy: { startDate: 'desc' } });
  if (!year) {
    throw AppError.notFound(
      'ACADEMIC_YEAR_NOT_FOUND',
      academicYearId ? 'Academic year not found' : 'No active academic year. Create or activate one first.',
    );
  }
  return year;
}

export async function findClassOrThrow(schoolId, classId, db = prisma) {
  const klass = await db.class.findFirst({ where: { id: classId, schoolId } });
  if (!klass) throw AppError.notFound('CLASS_NOT_FOUND', 'Class not found');
  return klass;
}

/** Section that belongs to the given class (and school). */
export async function findSectionOrThrow(schoolId, classId, sectionId, db = prisma) {
  const section = await db.section.findFirst({
    where: { id: sectionId, classId, class: { schoolId } },
    include: { class: true },
  });
  if (!section) throw AppError.notFound('SECTION_NOT_FOUND', 'Section not found in this class');
  return section;
}

/** Teachers must exist in the school and be ACTIVE to receive new assignments. */
export async function assertAssignableTeacher(schoolId, teacherId, db = prisma) {
  const teacher = await db.teacher.findFirst({ where: { id: teacherId, schoolId } });
  if (!teacher) throw AppError.notFound('TEACHER_NOT_FOUND', 'Teacher not found');
  if (teacher.status !== 'ACTIVE') {
    throw AppError.conflict('TEACHER_INACTIVE', `${teacher.fullName} is not active and cannot receive new assignments`);
  }
  return teacher;
}

export async function assertSubjectsExist(schoolId, subjectIds, db = prisma) {
  const unique = [...new Set(subjectIds)];
  if (unique.length === 0) return;
  const found = await db.subject.count({ where: { schoolId, id: { in: unique } } });
  if (found !== unique.length) throw AppError.notFound('SUBJECT_NOT_FOUND', 'One or more subjects do not exist');
}

/**
 * Ensure `adding` more students fit in the section and its class.
 * `excludeEnrollmentId` lets a move within the same class not count itself.
 */
export async function assertCapacity(section, adding, db = prisma, excludeEnrollmentId) {
  const notSelf = excludeEnrollmentId ? { id: { not: excludeEnrollmentId } } : {};
  const [inClass, inSection] = await Promise.all([
    db.enrollment.count({ where: { classId: section.classId, status: 'ACTIVE', ...notSelf } }),
    db.enrollment.count({ where: { sectionId: section.id, status: 'ACTIVE', ...notSelf } }),
  ]);
  if (inClass + adding > section.class.capacity) {
    throw AppError.conflict(
      'CLASS_CAPACITY_EXCEEDED',
      `${section.class.name} is full (${inClass}/${section.class.capacity} students)`,
    );
  }
  if (section.capacity && inSection + adding > section.capacity) {
    throw AppError.conflict(
      'SECTION_CAPACITY_EXCEEDED',
      `${section.class.name} section ${section.name} is full (${inSection}/${section.capacity} students)`,
    );
  }
}

export async function nextRollNumber(sectionId, db = prisma) {
  const max = await db.enrollment.aggregate({ where: { sectionId }, _max: { rollNumber: true } });
  return (max._max.rollNumber ?? 0) + 1;
}

// ───────────────────────── Academic years ─────────────────────────

export function listAcademicYears(schoolId) {
  return prisma.academicYear.findMany({
    where: { schoolId },
    orderBy: { startDate: 'desc' },
    include: { _count: { select: { classes: true, enrollments: true } } },
  });
}

async function saveYear(schoolId, id, data, actor, ctx) {
  const year = await prisma.$transaction(async (tx) => {
    if (data.name) {
      const dup = await tx.academicYear.findFirst({ where: { schoolId, name: data.name, ...(id ? { id: { not: id } } : {}) } });
      if (dup) throw AppError.conflict('DUPLICATE_ACADEMIC_YEAR', `Academic year "${data.name}" already exists`);
    }
    // Only one ACTIVE year per school: activating one completes the previous.
    if (data.status === 'ACTIVE') {
      await tx.academicYear.updateMany({
        where: { schoolId, status: 'ACTIVE', ...(id ? { id: { not: id } } : {}) },
        data: { status: 'COMPLETED' },
      });
    }
    return id
      ? tx.academicYear.update({ where: { id }, data })
      : tx.academicYear.create({ data: { ...data, schoolId } });
  });
  // Audit after commit: a failed statement inside a Postgres transaction would abort it.
  await audit({
    action: id ? 'ACADEMIC_YEAR_UPDATED' : 'ACADEMIC_YEAR_CREATED',
    entity: 'AcademicYear',
    entityId: year.id,
    actor,
    schoolId,
    metadata: data,
    ...ctx,
  });
  return year;
}

export function createAcademicYear(schoolId, data, actor, ctx) {
  return saveYear(schoolId, null, data, actor, ctx);
}

export async function updateAcademicYear(schoolId, id, data, actor, ctx) {
  const current = await resolveAcademicYear(schoolId, id);
  const start = data.startDate ?? current.startDate;
  const end = data.endDate ?? current.endDate;
  if (end <= start) {
    throw AppError.badRequest('VALIDATION_ERROR', 'End date must be after the start date', [
      { field: 'endDate', message: 'End date must be after the start date' },
    ]);
  }
  return saveYear(schoolId, id, data, actor, ctx);
}

// ───────────────────────── Classes & sections ─────────────────────────

async function teacherClassSectionScope(schoolId, klass, actor) {
  if (actor?.role.key !== ROLES.TEACHER) return null;
  const scope = await teacherScope(actor, schoolId, klass.academicYearId);
  if (!scope.teacherId) throw AppError.forbidden('FORBIDDEN', 'You do not teach this class');
  if (scope.classIds.includes(klass.id)) return null;

  const sections = await prisma.section.findMany({
    where: { id: { in: scope.sectionIds }, classId: klass.id },
    select: { id: true },
  });
  if (sections.length === 0) throw AppError.forbidden('FORBIDDEN', 'You do not teach this class');
  return sections.map((section) => section.id);
}

function restrictClassSections(klass, sectionIds) {
  if (!sectionIds) return klass;
  klass.sections = klass.sections.filter((section) => sectionIds.includes(section.id));
  klass.classSubjects = [];
  if (klass._count?.classSubjects !== undefined) klass._count.classSubjects = 0;
  if (klass._count?.enrollments !== undefined) {
    klass._count.enrollments = klass.sections.reduce((sum, section) => sum + (section._count?.enrollments ?? 0), 0);
  }
  return klass;
}

export async function listClasses(schoolId, { academicYearId }, actor) {
  const year = await resolveAcademicYear(schoolId, academicYearId);
  let classes = await prisma.class.findMany({
    where: { schoolId, academicYearId: year.id },
    orderBy: [{ numericLevel: 'asc' }, { name: 'asc' }],
    include: {
      sections: { orderBy: { name: 'asc' }, include: { classTeacher: teacherBrief, ...activeEnrollmentCount } },
      _count: { select: { classSubjects: true, enrollments: { where: { status: 'ACTIVE' } } } },
    },
  });
  if (actor?.role.key === ROLES.TEACHER) {
    const scope = await teacherScope(actor, schoolId, year.id);
    if (!scope.teacherId) return { academicYear: year, classes: [] };
    const sectionRows = await prisma.section.findMany({
      where: { id: { in: scope.sectionIds } },
      select: { id: true, classId: true },
    });
    const sectionIdsByClass = new Map();
    for (const section of sectionRows) {
      sectionIdsByClass.set(section.classId, [...(sectionIdsByClass.get(section.classId) ?? []), section.id]);
    }
    const accessibleClassIds = new Set([...scope.classIds, ...sectionIdsByClass.keys()]);
    classes = classes
      .filter((klass) => accessibleClassIds.has(klass.id))
      .map((klass) => restrictClassSections(klass, scope.classIds.includes(klass.id) ? null : sectionIdsByClass.get(klass.id)));
  }
  return { academicYear: year, classes };
}

export async function getClass(schoolId, id, actor) {
  const klass = await prisma.class.findFirst({
    where: { id, schoolId },
    include: {
      academicYear: true,
      sections: { orderBy: { name: 'asc' }, include: { classTeacher: teacherBrief, ...activeEnrollmentCount } },
      classSubjects: {
        orderBy: { subject: { name: 'asc' } },
        include: { subject: true, teacher: teacherBrief },
      },
      _count: { select: { enrollments: { where: { status: 'ACTIVE' } } } },
    },
  });
  if (!klass) throw AppError.notFound('CLASS_NOT_FOUND', 'Class not found');
  return restrictClassSections(klass, await teacherClassSectionScope(schoolId, klass, actor));
}

export async function createClass(schoolId, data, actor, ctx) {
  await resolveAcademicYear(schoolId, data.academicYearId);
  await assertSubjectsExist(schoolId, data.subjectIds);
  const dup = await prisma.class.findFirst({ where: { schoolId, academicYearId: data.academicYearId, name: data.name } });
  if (dup) throw AppError.conflict('DUPLICATE_CLASS', `${data.name} already exists in this academic year`);

  const klass = await prisma.class.create({
    data: {
      schoolId,
      academicYearId: data.academicYearId,
      name: data.name,
      numericLevel: data.numericLevel ?? null,
      capacity: data.capacity,
      sections: { create: data.sections.map((name) => ({ name })) },
      classSubjects: { create: data.subjectIds.map((subjectId) => ({ subjectId })) },
    },
  });
  await audit({ action: 'CLASS_CREATED', entity: 'Class', entityId: klass.id, actor, schoolId, metadata: { name: data.name }, ...ctx });
  return getClass(schoolId, klass.id);
}

export async function updateClass(schoolId, id, data, actor, ctx) {
  const klass = await findClassOrThrow(schoolId, id);
  if (data.name && data.name !== klass.name) {
    const dup = await prisma.class.findFirst({
      where: { schoolId, academicYearId: klass.academicYearId, name: data.name, id: { not: id } },
    });
    if (dup) throw AppError.conflict('DUPLICATE_CLASS', `${data.name} already exists in this academic year`);
  }
  if (data.capacity !== undefined) {
    const enrolled = await prisma.enrollment.count({ where: { classId: id, status: 'ACTIVE' } });
    if (data.capacity < enrolled) {
      throw AppError.conflict('CAPACITY_BELOW_ENROLLMENT', `${enrolled} students are already enrolled in this class`);
    }
  }
  await prisma.class.update({ where: { id }, data });
  await audit({ action: 'CLASS_UPDATED', entity: 'Class', entityId: id, actor, schoolId, metadata: data, ...ctx });
  return getClass(schoolId, id);
}

export async function addSection(schoolId, classId, data, actor, ctx) {
  await findClassOrThrow(schoolId, classId);
  const dup = await prisma.section.findFirst({ where: { classId, name: data.name } });
  if (dup) throw AppError.conflict('DUPLICATE_SECTION', `Section ${data.name} already exists in this class`);
  if (data.classTeacherId) await assertAssignableTeacher(schoolId, data.classTeacherId);

  const section = await prisma.section.create({
    data: {
      classId,
      name: data.name,
      capacity: data.capacity ?? null,
      roomNumber: data.roomNumber ?? null,
      classTeacherId: data.classTeacherId ?? null,
    },
  });
  await audit({ action: 'SECTION_CREATED', entity: 'Section', entityId: section.id, actor, schoolId, metadata: { classId, name: data.name }, ...ctx });
  return getClass(schoolId, classId);
}

export async function updateSection(schoolId, sectionId, data, actor, ctx) {
  const section = await prisma.section.findFirst({ where: { id: sectionId, class: { schoolId } }, include: { class: true } });
  if (!section) throw AppError.notFound('SECTION_NOT_FOUND', 'Section not found');

  if (data.name && data.name !== section.name) {
    const dup = await prisma.section.findFirst({ where: { classId: section.classId, name: data.name, id: { not: sectionId } } });
    if (dup) throw AppError.conflict('DUPLICATE_SECTION', `Section ${data.name} already exists in this class`);
  }
  if (data.capacity) {
    const enrolled = await prisma.enrollment.count({ where: { sectionId, status: 'ACTIVE' } });
    if (data.capacity < enrolled) {
      throw AppError.conflict('CAPACITY_BELOW_ENROLLMENT', `${enrolled} students are already in this section`);
    }
  }
  // Only a *new* class teacher must be active; keeping the current one is fine.
  if (data.classTeacherId && data.classTeacherId !== section.classTeacherId) {
    await assertAssignableTeacher(schoolId, data.classTeacherId);
  }

  await prisma.section.update({ where: { id: sectionId }, data });
  await audit({ action: 'SECTION_UPDATED', entity: 'Section', entityId: sectionId, actor, schoolId, metadata: data, ...ctx });
  return getClass(schoolId, section.classId);
}

/** Replace the subjects taught in a class (and who teaches each). */
export async function setClassSubjects(schoolId, classId, items, actor, ctx) {
  await findClassOrThrow(schoolId, classId);
  await assertSubjectsExist(schoolId, items.map((i) => i.subjectId));

  const existing = await prisma.classSubject.findMany({ where: { classId } });
  const currentTeacher = new Map(existing.map((cs) => [cs.subjectId, cs.teacherId]));
  for (const item of items) {
    // Only newly assigned teachers need to be active.
    if (item.teacherId && item.teacherId !== currentTeacher.get(item.subjectId)) {
      await assertAssignableTeacher(schoolId, item.teacherId);
    }
  }

  await prisma.$transaction([
    prisma.classSubject.deleteMany({ where: { classId, subjectId: { notIn: items.map((i) => i.subjectId) } } }),
    ...items.map((i) =>
      prisma.classSubject.upsert({
        where: { classId_subjectId: { classId, subjectId: i.subjectId } },
        update: { teacherId: i.teacherId ?? null },
        create: { classId, subjectId: i.subjectId, teacherId: i.teacherId ?? null },
      }),
    ),
  ]);
  await audit({ action: 'CLASS_SUBJECTS_UPDATED', entity: 'Class', entityId: classId, actor, schoolId, metadata: { count: items.length }, ...ctx });
  return getClass(schoolId, classId);
}

export async function listClassStudents(schoolId, classId, { sectionId }, actor) {
  const klass = await findClassOrThrow(schoolId, classId);
  const allowedSections = await teacherClassSectionScope(schoolId, klass, actor);
  if (sectionId && allowedSections && !allowedSections.includes(sectionId)) {
    throw AppError.forbidden('FORBIDDEN', 'You do not teach this section');
  }
  return prisma.enrollment.findMany({
    where: {
      classId,
      status: 'ACTIVE',
      ...(sectionId ? { sectionId } : allowedSections ? { sectionId: { in: allowedSections } } : {}),
      student: { deletedAt: null, status: 'ACTIVE' },
    },
    orderBy: [{ section: { name: 'asc' } }, { rollNumber: 'asc' }],
    include: {
      section: { select: { id: true, name: true } },
      student: { select: { id: true, studentCode: true, fullName: true, gender: true, phone: true, status: true } },
    },
  });
}

// ───────────────────────── Promotion ─────────────────────────

/**
 * Move selected students from a class into a class of a later academic year
 * (or graduate them). All-or-nothing: any problem rolls the whole batch back.
 */
export async function promoteStudents(schoolId, data, actor, ctx) {
  const from = await findClassOrThrow(schoolId, data.fromClassId);
  const enrollments = await prisma.enrollment.findMany({
    where: { classId: from.id, status: 'ACTIVE', studentId: { in: data.studentIds }, student: { deletedAt: null, status: 'ACTIVE' } },
    include: { section: true, student: { select: { id: true, fullName: true } } },
    orderBy: [{ section: { name: 'asc' } }, { rollNumber: 'asc' }],
  });
  if (enrollments.length !== new Set(data.studentIds).size) {
    throw AppError.badRequest('INVALID_STUDENTS', 'Some selected students are not active members of this class');
  }

  if (data.graduate) {
    await prisma.$transaction([
      prisma.enrollment.updateMany({ where: { id: { in: enrollments.map((e) => e.id) } }, data: { status: 'COMPLETED' } }),
      prisma.student.updateMany({ where: { id: { in: enrollments.map((e) => e.studentId) } }, data: { status: 'GRADUATED' } }),
    ]);
    await audit({ action: 'STUDENTS_GRADUATED', entity: 'Class', entityId: from.id, actor, schoolId, metadata: { count: enrollments.length }, ...ctx });
    return { graduated: enrollments.length, promoted: 0 };
  }

  const to = await prisma.class.findFirst({ where: { id: data.toClassId, schoolId }, include: { sections: true } });
  if (!to) throw AppError.notFound('CLASS_NOT_FOUND', 'Target class not found');
  if (to.academicYearId === from.academicYearId) {
    throw AppError.badRequest('SAME_ACADEMIC_YEAR', 'Promotion moves students into a later academic year. Use transfer to change class within a year.');
  }

  // Work out each student's target section.
  const targetFor = new Map();
  for (const e of enrollments) {
    const section = data.toSectionId
      ? to.sections.find((s) => s.id === data.toSectionId)
      : to.sections.find((s) => s.name === e.section.name);
    if (!section) {
      throw AppError.notFound(
        'SECTION_NOT_FOUND',
        data.toSectionId ? 'Target section not found in that class' : `${to.name} has no section ${e.section.name}. Choose a target section.`,
      );
    }
    targetFor.set(e.id, section);
  }

  const already = await prisma.enrollment.findMany({
    where: { academicYearId: to.academicYearId, studentId: { in: enrollments.map((e) => e.studentId) } },
    include: { student: { select: { fullName: true } } },
  });
  if (already.length) {
    throw new AppError(409, 'ALREADY_ENROLLED', 'Some students are already enrolled in the target academic year', {
      students: already.map((a) => a.student.fullName),
    });
  }

  await prisma.$transaction(async (tx) => {
    const bySection = new Map();
    for (const e of enrollments) {
      const s = targetFor.get(e.id);
      bySection.set(s.id, [...(bySection.get(s.id) ?? []), e]);
    }
    for (const [sectionId, group] of bySection) {
      const section = { ...to.sections.find((s) => s.id === sectionId), class: to };
      await assertCapacity(section, group.length, tx);
      let roll = await nextRollNumber(sectionId, tx);
      for (const e of group) {
        await tx.enrollment.create({
          data: {
            schoolId,
            studentId: e.studentId,
            academicYearId: to.academicYearId,
            classId: to.id,
            sectionId,
            rollNumber: roll,
          },
        });
        roll += 1;
      }
    }
    await tx.enrollment.updateMany({ where: { id: { in: enrollments.map((e) => e.id) } }, data: { status: 'PROMOTED' } });
  });

  await audit({
    action: 'STUDENTS_PROMOTED',
    entity: 'Class',
    entityId: from.id,
    actor,
    schoolId,
    metadata: { toClassId: to.id, count: enrollments.length },
    ...ctx,
  });
  return { promoted: enrollments.length, graduated: 0 };
}

// ───────────────────────── Subjects ─────────────────────────

export function listSubjects(schoolId, { search }) {
  return prisma.subject.findMany({
    where: {
      schoolId,
      ...(search
        ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { code: { contains: search, mode: 'insensitive' } }] }
        : {}),
    },
    orderBy: { name: 'asc' },
    include: { _count: { select: { teachers: true, classSubjects: true } } },
  });
}

export async function createSubject(schoolId, data, actor, ctx) {
  const dup = await prisma.subject.findUnique({ where: { schoolId_code: { schoolId, code: data.code } } });
  if (dup) throw AppError.conflict('DUPLICATE_SUBJECT_CODE', `Subject code ${data.code} is already used by ${dup.name}`);
  const subject = await prisma.subject.create({ data: { ...data, schoolId } });
  await audit({ action: 'SUBJECT_CREATED', entity: 'Subject', entityId: subject.id, actor, schoolId, metadata: { code: data.code }, ...ctx });
  return subject;
}

export async function updateSubject(schoolId, id, data, actor, ctx) {
  const subject = await prisma.subject.findFirst({ where: { id, schoolId } });
  if (!subject) throw AppError.notFound('SUBJECT_NOT_FOUND', 'Subject not found');
  if (data.code && data.code !== subject.code) {
    const dup = await prisma.subject.findUnique({ where: { schoolId_code: { schoolId, code: data.code } } });
    if (dup) throw AppError.conflict('DUPLICATE_SUBJECT_CODE', `Subject code ${data.code} is already used by ${dup.name}`);
  }
  const updated = await prisma.subject.update({ where: { id }, data });
  await audit({ action: 'SUBJECT_UPDATED', entity: 'Subject', entityId: id, actor, schoolId, metadata: data, ...ctx });
  return updated;
}
