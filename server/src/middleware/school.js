import { prisma } from '../config/prisma.js';
import { AppError } from '../utils/AppError.js';

/**
 * Resolve which school a request operates on and put it on req.schoolId.
 * School users are pinned to their own school. A super admin (no schoolId)
 * picks one per request with the `X-School-Id` header.
 */
export async function requireSchool(req, _res, next) {
  try {
    if (req.user.schoolId) {
      req.schoolId = req.user.schoolId;
      return next();
    }
    const requested = req.get('x-school-id');
    if (!requested) throw AppError.badRequest('SCHOOL_REQUIRED', 'Select a school first');
    const school = await prisma.school.findUnique({ where: { id: requested }, select: { id: true } });
    if (!school) throw AppError.notFound('SCHOOL_NOT_FOUND', 'School not found');
    req.schoolId = school.id;
    next();
  } catch (err) {
    next(err);
  }
}
