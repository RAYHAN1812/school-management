import { prisma } from '../config/prisma.js';
import { ADMIN_ROLES, ROLES } from '../config/roles.js';
import { AppError } from '../utils/AppError.js';
import { audit } from '../utils/audit.js';
import { getPagination } from '../utils/http.js';

const userInclude = { role: true, school: { select: { id: true, name: true, code: true } } };

/** Restrict any user query to what the actor is allowed to see. */
function scopeFor(actor, schoolIdFilter) {
  if (actor.role.key === ROLES.SUPER_ADMIN) {
    return schoolIdFilter ? { schoolId: schoolIdFilter } : {};
  }
  // School admins see their own school only, and never super admins.
  return { schoolId: actor.schoolId, role: { key: { not: ROLES.SUPER_ADMIN } } };
}

export async function listUsers(actor, query) {
  const { skip, take, meta } = getPagination(query);
  const scope = scopeFor(actor, query.schoolId);

  const where = {
    ...scope,
    ...(query.status ? { status: query.status } : {}),
    ...(query.search
      ? {
          OR: [
            { fullName: { contains: query.search, mode: 'insensitive' } },
            { email: { contains: query.search, mode: 'insensitive' } },
            { username: { contains: query.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
  if (query.role) {
    // Combine with the scope's role restriction instead of overwriting it.
    where.AND = [{ role: { key: query.role } }];
  }

  const [items, total] = await Promise.all([
    prisma.user.findMany({ where, include: userInclude, orderBy: { createdAt: 'desc' }, skip, take }),
    prisma.user.count({ where }),
  ]);
  return { items, meta: meta(total) };
}

export async function getUser(actor, id) {
  const user = await prisma.user.findFirst({ where: { id, ...scopeFor(actor) }, include: userInclude });
  if (!user) throw AppError.notFound('USER_NOT_FOUND', 'User not found');
  return user;
}

export async function updateUserStatus(actor, id, status, ctx) {
  if (actor.id === id) {
    throw AppError.badRequest('CANNOT_CHANGE_OWN_STATUS', 'You cannot activate or deactivate your own account');
  }
  const target = await getUser(actor, id);

  // School admins manage teachers, students and parents — not other admins.
  if (actor.role.key !== ROLES.SUPER_ADMIN && ADMIN_ROLES.includes(target.role.key)) {
    throw AppError.forbidden('FORBIDDEN', 'Only a super admin can change the status of an admin account');
  }
  if (target.status === status) return target;

  const updated = await prisma.user.update({
    where: { id },
    data: {
      status,
      // Deactivation revokes all of the user's sessions immediately.
      ...(status === 'INACTIVE' ? { tokenVersion: { increment: 1 } } : {}),
    },
    include: userInclude,
  });
  await audit({
    action: status === 'ACTIVE' ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
    entity: 'User',
    entityId: id,
    actor,
    schoolId: target.schoolId,
    metadata: { from: target.status, to: status },
    ...ctx,
  });
  return updated;
}

export function listRoles() {
  return prisma.role.findMany({ orderBy: { name: 'asc' } });
}

export async function listAuditLogs(actor, query) {
  const { skip, take, meta } = getPagination(query, { defaultLimit: 25 });
  const where = {
    ...(actor.role.key === ROLES.SUPER_ADMIN ? {} : { schoolId: actor.schoolId }),
    ...(query.action ? { action: query.action } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: { user: { select: { id: true, fullName: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
    prisma.auditLog.count({ where }),
  ]);
  return { items, meta: meta(total) };
}
