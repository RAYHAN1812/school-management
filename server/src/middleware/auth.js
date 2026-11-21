import { prisma } from '../config/prisma.js';
import { AppError } from '../utils/AppError.js';
import { AUTH_COOKIE, verifyAccessToken } from '../utils/tokens.js';

function extractToken(req) {
  const header = req.get('authorization');
  if (header?.startsWith('Bearer ')) return { token: header.slice(7).trim(), fromCookie: false };
  return { token: req.cookies?.[AUTH_COOKIE], fromCookie: true };
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF defence for cookie sessions: state-changing requests must carry
 * X-Requested-With, which a cross-site form or image can't set (and CORS
 * blocks scripts from other origins). Bearer-token clients aren't affected.
 */
function assertNotCrossSite(req, fromCookie) {
  if (fromCookie && !SAFE_METHODS.has(req.method) && req.get('x-requested-with') !== 'XMLHttpRequest') {
    throw AppError.forbidden('CSRF_CHECK_FAILED', 'Request blocked: missing X-Requested-With header');
  }
}

/**
 * Requires a valid, unrevoked token belonging to an active user.
 * Sets req.user = { id, email, fullName, schoolId, status, role: { key, name } }.
 * Any failure → 401 UNAUTHORIZED.
 */
export async function authenticate(req, _res, next) {
  try {
    const { token, fromCookie } = extractToken(req);
    if (!token) throw AppError.unauthorized('UNAUTHORIZED', 'Authentication required');
    assertNotCrossSite(req, fromCookie);

    let payload;
    try {
      payload = verifyAccessToken(token);
    } catch {
      throw AppError.unauthorized('UNAUTHORIZED', 'Session is invalid or has expired');
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      include: { role: true, school: { select: { id: true, name: true, code: true, isActive: true } } },
    });

    // Token was revoked (password changed/reset) or user removed.
    if (!user || user.tokenVersion !== payload.tv) {
      throw AppError.unauthorized('UNAUTHORIZED', 'Session is invalid or has expired');
    }
    if (user.status !== 'ACTIVE') {
      throw AppError.unauthorized('ACCOUNT_INACTIVE', 'This account has been deactivated');
    }
    if (user.school && !user.school.isActive) {
      throw AppError.unauthorized('SCHOOL_INACTIVE', 'This school account is inactive');
    }

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Restrict a route to the given role keys. Must run after authenticate.
 * Authenticated user with the wrong role → 403 FORBIDDEN.
 */
export function authorize(...allowedRoles) {
  return (req, _res, next) => {
    if (!req.user) return next(AppError.unauthorized());
    if (!allowedRoles.includes(req.user.role.key)) return next(AppError.forbidden());
    next();
  };
}
