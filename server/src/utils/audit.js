import { prisma } from '../config/prisma.js';

/**
 * Record an administrative/security event. Never throws: a failed audit write
 * is logged but must not break the request that triggered it.
 * Pass `tx` to write inside an existing transaction.
 */
export async function audit({ action, entity, entityId, actor, schoolId, metadata, ipAddress, userAgent }, tx = prisma) {
  try {
    await tx.auditLog.create({
      data: {
        action,
        entity,
        entityId: entityId ?? null,
        userId: actor?.id ?? null,
        schoolId: schoolId ?? actor?.schoolId ?? null,
        metadata: metadata ?? undefined,
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null,
      },
    });
  } catch (err) {
    console.error('[audit] failed to write audit log', action, err.message);
  }
}
