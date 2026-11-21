import { prisma } from '../config/prisma.js';
import { ROLES } from '../config/roles.js';
import { AppError } from '../utils/AppError.js';
import { audit } from '../utils/audit.js';
import { getPagination } from '../utils/http.js';
import { resolveAcademicYear } from './academic.service.js';
import { isAdmin, linkedStudentIds, teacherScope } from './access.service.js';
import { assertUploadOwned } from './upload.service.js';

const include = {
  class: { select: { id: true, name: true } },
  section: { select: { id: true, name: true, class: { select: { name: true } } } },
  createdBy: { select: { id: true, fullName: true } },
};

/** Classes/sections that make a CLASS/SECTION notice relevant to this user. */
async function audienceScope(actor, schoolId) {
  const year = await resolveAcademicYear(schoolId).catch(() => null);
  if (!year) return { classIds: [], sectionIds: [] };
  if (actor.role.key === ROLES.TEACHER) {
    const s = await teacherScope(actor, schoolId, year.id);
    const extra = await prisma.section.findMany({ where: { id: { in: s.sectionIds } }, select: { classId: true } });
    return { classIds: [...new Set([...s.classIds, ...extra.map((x) => x.classId)])], sectionIds: s.sectionIds };
  }
  let studentIds = [];
  if (actor.role.key === ROLES.STUDENT) {
    const st = await prisma.student.findFirst({ where: { userId: actor.id, schoolId }, select: { id: true } });
    studentIds = st ? [st.id] : [];
  } else if (actor.role.key === ROLES.PARENT) {
    studentIds = await linkedStudentIds(actor, schoolId);
  }
  const enrollments = await prisma.enrollment.findMany({ where: { studentId: { in: studentIds }, academicYearId: year.id, status: 'ACTIVE' } });
  return { classIds: enrollments.map((e) => e.classId), sectionIds: enrollments.map((e) => e.sectionId) };
}

const ROLE_AUDIENCE = {
  [ROLES.STUDENT]: 'STUDENTS',
  [ROLES.TEACHER]: 'TEACHERS',
  [ROLES.PARENT]: 'PARENTS',
  [ROLES.SCHOOL_ADMIN]: 'ADMINS',
  [ROLES.SUPER_ADMIN]: 'ADMINS',
};

/** Notices this user should see: published, in date, and addressed to them. */
async function visibleWhere(actor, schoolId) {
  const now = new Date();
  const { classIds, sectionIds } = await audienceScope(actor, schoolId);
  return {
    schoolId,
    status: 'PUBLISHED',
    publishDate: { lte: now },
    OR: [{ expiryDate: null }, { expiryDate: { gte: now } }],
    AND: [
      {
        OR: [
          { audience: 'ALL' },
          { audience: ROLE_AUDIENCE[actor.role.key] },
          // Class/section notices reach the students, parents and teachers of that class.
          ...(isAdmin(actor) ? [{ audience: { in: ['CLASS', 'SECTION'] } }] : []),
          { audience: 'CLASS', classId: { in: classIds } },
          { audience: 'SECTION', sectionId: { in: sectionIds } },
        ],
      },
    ],
  };
}

/** Teachers may post only to their own classes/sections; admins anywhere. */
async function assertCanPost(actor, schoolId, data) {
  if (isAdmin(actor)) return;
  if (actor.role.key !== ROLES.TEACHER) throw AppError.forbidden();
  if (!['CLASS', 'SECTION'].includes(data.audience)) {
    throw AppError.forbidden('FORBIDDEN', 'Teachers can post notices to their own classes or sections only');
  }
  const { classIds, sectionIds } = await audienceScope(actor, schoolId);
  const ok = data.audience === 'CLASS' ? classIds.includes(data.classId) : sectionIds.includes(data.sectionId) || classIds.includes(data.classId);
  if (!ok) throw AppError.forbidden('FORBIDDEN', 'You do not teach that class');
}

async function normaliseTarget(schoolId, data) {
  if (data.audience === 'CLASS') {
    const klass = await prisma.class.findFirst({ where: { id: data.classId ?? '', schoolId } });
    if (!klass) throw AppError.notFound('CLASS_NOT_FOUND', 'Choose the class for this notice');
    return { classId: klass.id, sectionId: null };
  }
  if (data.audience === 'SECTION') {
    const section = await prisma.section.findFirst({ where: { id: data.sectionId ?? '', class: { schoolId } } });
    if (!section) throw AppError.notFound('SECTION_NOT_FOUND', 'Choose the section for this notice');
    if (data.classId && data.classId !== section.classId) {
      throw AppError.badRequest('NOTICE_TARGET_MISMATCH', 'The selected section does not belong to the selected class');
    }
    return { classId: section.classId, sectionId: section.id };
  }
  return { classId: null, sectionId: null };
}

export async function createNotice(schoolId, data, actor, ctx) {
  if (data.isPublic && !isAdmin(actor)) {
    throw AppError.forbidden('PUBLIC_NOTICE_ADMIN_ONLY', 'Only administrators can publish notices on the public website');
  }
  if (data.isPublic && data.audience !== 'ALL') {
    throw AppError.badRequest('PUBLIC_NOTICE_AUDIENCE_INVALID', 'Public website notices must target everyone');
  }
  const target = await normaliseTarget(schoolId, data);
  await assertCanPost(actor, schoolId, { ...data, ...target });
  await assertUploadOwned(schoolId, data.attachmentUrl, actor);
  const notice = await prisma.notice.create({
    data: {
      schoolId,
      title: data.title,
      description: data.description,
      attachmentUrl: data.attachmentUrl ?? null,
      isPublic: Boolean(data.isPublic),
      publishDate: data.publishDate ?? new Date(),
      expiryDate: data.expiryDate ?? null,
      audience: data.audience,
      ...target,
      status: data.status,
      createdById: actor.id,
    },
    include,
  });
  await audit({ action: 'NOTICE_CREATED', entity: 'Notice', entityId: notice.id, actor, schoolId, metadata: { audience: data.audience, status: data.status }, ...ctx });
  return notice;
}

async function loadOwned(schoolId, id, actor) {
  const notice = await prisma.notice.findFirst({ where: { id, schoolId } });
  if (!notice) throw AppError.notFound('NOTICE_NOT_FOUND', 'Notice not found');
  if (!isAdmin(actor) && notice.createdById !== actor.id) throw AppError.forbidden('FORBIDDEN', 'You can only change notices you posted');
  return notice;
}

export async function updateNotice(schoolId, id, data, actor, ctx) {
  const current = await loadOwned(schoolId, id, actor);
  const merged = { ...current, ...data };
  if (Object.hasOwn(data, 'isPublic') && !isAdmin(actor)) {
    throw AppError.forbidden('PUBLIC_NOTICE_ADMIN_ONLY', 'Only administrators can change public website visibility');
  }
  if (merged.isPublic && merged.audience !== 'ALL') {
    throw AppError.badRequest('PUBLIC_NOTICE_AUDIENCE_INVALID', 'Public website notices must target everyone');
  }
  const targetChanged = ['audience', 'classId', 'sectionId'].some((key) => Object.hasOwn(data, key));
  const target = targetChanged ? await normaliseTarget(schoolId, merged) : {};
  if (targetChanged) await assertCanPost(actor, schoolId, { ...merged, ...target });
  if (data.attachmentUrl !== undefined && data.attachmentUrl !== current.attachmentUrl) {
    await assertUploadOwned(schoolId, data.attachmentUrl, actor);
  }
  const notice = await prisma.notice.update({ where: { id }, data: { ...data, ...target }, include });
  await audit({ action: 'NOTICE_UPDATED', entity: 'Notice', entityId: id, actor, schoolId, metadata: { fields: Object.keys(data) }, ...ctx });
  return notice;
}

export async function deleteNotice(schoolId, id, actor, ctx) {
  await loadOwned(schoolId, id, actor);
  await prisma.notice.delete({ where: { id } });
  await audit({ action: 'NOTICE_DELETED', entity: 'Notice', entityId: id, actor, schoolId, ...ctx });
  return { deleted: true };
}

/**
 * ?manage=true → notices this user can manage (admins: all, teachers: their own), any status.
 * Otherwise → the notice board for this user, with read status.
 */
export async function listNotices(schoolId, query, actor) {
  const { skip, take, meta } = getPagination(query, { defaultLimit: 20 });
  let where;
  if (query.manage === 'true') {
    if (!isAdmin(actor) && actor.role.key !== ROLES.TEACHER) throw AppError.forbidden();
    where = {
      schoolId,
      ...(isAdmin(actor) ? {} : { createdById: actor.id }),
      ...(query.status ? { status: query.status } : {}),
      ...(query.audience ? { audience: query.audience } : {}),
    };
  } else {
    where = await visibleWhere(actor, schoolId);
    if (query.audience) where.AND.push({ audience: query.audience });
  }
  if (query.search) where.AND = [...(where.AND ?? []), { OR: [{ title: { contains: query.search, mode: 'insensitive' } }, { description: { contains: query.search, mode: 'insensitive' } }] }];

  const [items, total] = await Promise.all([
    prisma.notice.findMany({
      where,
      orderBy: { publishDate: 'desc' },
      skip,
      take,
      include: { ...include, reads: { where: { userId: actor.id }, select: { readAt: true } }, _count: { select: { reads: true } } },
    }),
    prisma.notice.count({ where }),
  ]);
  const unread = query.manage === 'true' ? undefined : await prisma.notice.count({ where: { ...(await visibleWhere(actor, schoolId)), reads: { none: { userId: actor.id } } } });
  return {
    items: items.map(({ reads, ...n }) => ({ ...n, read: reads.length > 0 })),
    meta: { ...meta(total), ...(unread !== undefined ? { unread } : {}) },
  };
}

export async function getNotice(schoolId, id, actor) {
  const where = { ...(await visibleWhere(actor, schoolId)), id };
  let notice = await prisma.notice.findFirst({ where, include });
  if (!notice && (isAdmin(actor) || actor.role.key === ROLES.TEACHER)) {
    notice = await prisma.notice.findFirst({ where: { id, schoolId, ...(isAdmin(actor) ? {} : { createdById: actor.id }) }, include });
  }
  if (!notice) throw AppError.notFound('NOTICE_NOT_FOUND', 'Notice not found');
  return notice;
}

export async function markRead(schoolId, id, actor) {
  await getNotice(schoolId, id, actor);
  await prisma.noticeRead.upsert({
    where: { noticeId_userId: { noticeId: id, userId: actor.id } },
    update: {},
    create: { noticeId: id, userId: actor.id },
  });
  return { read: true };
}
