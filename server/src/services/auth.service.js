import { Prisma } from '@prisma/client';
import { env } from '../config/env.js';
import { prisma } from '../config/prisma.js';
import { CREATABLE_ROLES, ROLES } from '../config/roles.js';
import { AppError } from '../utils/AppError.js';
import { audit } from '../utils/audit.js';
import { sendMail } from '../utils/mailer.js';
import { fakeVerify, hashPassword, verifyPassword } from '../utils/password.js';
import { createResetToken, hashToken, signAccessToken } from '../utils/tokens.js';

const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;
const userInclude = { role: true, school: { select: { id: true, name: true, code: true, isActive: true } } };

export async function login({ identifier, password }, ctx) {
  const user = await prisma.user.findFirst({
    where: { OR: [{ email: identifier }, { username: identifier }] },
    include: userInclude,
  });

  if (!user) {
    await fakeVerify(password); // keep timing similar to a real check
    throw AppError.unauthorized('INVALID_CREDENTIALS', 'Invalid email/username or password');
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    await audit({ action: 'AUTH_LOGIN_FAILED', entity: 'User', entityId: user.id, schoolId: user.schoolId, ...ctx });
    throw AppError.unauthorized('INVALID_CREDENTIALS', 'Invalid email/username or password');
  }

  // Only reveal account state once the password is proven correct.
  if (user.status !== 'ACTIVE') {
    throw AppError.forbidden('ACCOUNT_INACTIVE', 'This account has been deactivated. Contact your school administrator.');
  }
  if (user.school && !user.school.isActive) {
    throw AppError.forbidden('SCHOOL_INACTIVE', 'This school account is inactive.');
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
    include: userInclude,
  });
  await audit({ action: 'AUTH_LOGIN', entity: 'User', entityId: user.id, actor: user, ...ctx });

  return { user: updated, token: signAccessToken(updated) };
}

export async function register(data, actor, ctx) {
  const allowed = CREATABLE_ROLES[actor.role.key] ?? [];
  if (!allowed.includes(data.role)) {
    throw AppError.forbidden('ROLE_NOT_ALLOWED', `You cannot create ${data.role} accounts`);
  }

  // Resolve which school the new account belongs to.
  let schoolId;
  if (actor.role.key === ROLES.SUPER_ADMIN) {
    if (data.role === ROLES.SUPER_ADMIN) {
      schoolId = null;
    } else {
      if (!data.schoolId) throw AppError.badRequest('SCHOOL_REQUIRED', 'Select the school this account belongs to');
      const school = await prisma.school.findUnique({ where: { id: data.schoolId } });
      if (!school) throw AppError.notFound('SCHOOL_NOT_FOUND', 'School not found');
      schoolId = school.id;
    }
  } else {
    if (data.schoolId && data.schoolId !== actor.schoolId) throw AppError.forbidden();
    schoolId = actor.schoolId;
  }

  const [emailTaken, usernameTaken] = await Promise.all([
    prisma.user.findUnique({ where: { email: data.email }, select: { id: true } }),
    data.username ? prisma.user.findUnique({ where: { username: data.username }, select: { id: true } }) : null,
  ]);
  if (emailTaken) throw AppError.conflict('EMAIL_ALREADY_EXISTS', 'An account with this email already exists');
  if (usernameTaken) throw AppError.conflict('USERNAME_ALREADY_EXISTS', 'This username is already taken');

  try {
    const user = await prisma.user.create({
      data: {
        fullName: data.fullName,
        email: data.email,
        username: data.username ?? null,
        phone: data.phone ?? null,
        passwordHash: await hashPassword(data.password),
        role: { connect: { key: data.role } },
        ...(schoolId ? { school: { connect: { id: schoolId } } } : {}),
      },
      include: userInclude,
    });
    await audit({
      action: 'USER_CREATED',
      entity: 'User',
      entityId: user.id,
      actor,
      schoolId: user.schoolId,
      metadata: { role: data.role, email: user.email },
      ...ctx,
    });
    return user;
  } catch (err) {
    // Lost a race with a concurrent request for the same email/username.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const field = String(err.meta?.target ?? '');
      if (field.includes('username')) throw AppError.conflict('USERNAME_ALREADY_EXISTS', 'This username is already taken');
      throw AppError.conflict('EMAIL_ALREADY_EXISTS', 'An account with this email already exists');
    }
    throw err;
  }
}

/**
 * Always resolves the same way whether or not the email exists, so the
 * endpoint can't be used to discover accounts. Returns the reset URL only
 * outside production (there is no mail provider yet).
 */
export async function forgotPassword({ email }, ctx) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.status !== 'ACTIVE') return { resetUrl: null };

  const { raw, hash } = createResetToken();
  await prisma.$transaction([
    // Only the newest link should work.
    prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    }),
    prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash: hash, expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS) },
    }),
  ]);

  const resetUrl = `${env.clientOrigins[0]}/reset-password?token=${raw}`;
  await sendMail({
    to: user.email,
    subject: 'Reset your Ratonpur Central School password',
    text: `Use this link within 30 minutes to reset your password:\n${resetUrl}\n\nIf you didn't ask for this, ignore this email.`,
  });
  await audit({ action: 'AUTH_PASSWORD_RESET_REQUESTED', entity: 'User', entityId: user.id, schoolId: user.schoolId, ...ctx });

  return { resetUrl: env.isProduction ? null : resetUrl };
}

export async function resetPassword({ token, password }, ctx) {
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!record || record.usedAt || record.expiresAt < new Date() || record.user.status !== 'ACTIVE') {
    throw AppError.badRequest('INVALID_RESET_TOKEN', 'This reset link is invalid or has expired');
  }

  const passwordHash = await hashPassword(password);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      // Bumping tokenVersion signs the user out everywhere.
      data: { passwordHash, passwordChangedAt: new Date(), tokenVersion: { increment: 1 } },
    }),
    prisma.passwordResetToken.updateMany({
      where: { userId: record.userId, usedAt: null },
      data: { usedAt: new Date() },
    }),
  ]);
  await audit({ action: 'AUTH_PASSWORD_RESET', entity: 'User', entityId: record.userId, schoolId: record.user.schoolId, ...ctx });
}

export async function changePassword(actor, { currentPassword, newPassword }, ctx) {
  const user = await prisma.user.findUnique({ where: { id: actor.id } });
  const valid = await verifyPassword(currentPassword, user.passwordHash);
  // 400 rather than 401: the session itself is fine, only the input is wrong.
  if (!valid) throw AppError.badRequest('INVALID_CURRENT_PASSWORD', 'Current password is incorrect');

  const updated = await prisma.user.update({
    where: { id: actor.id },
    data: {
      passwordHash: await hashPassword(newPassword),
      passwordChangedAt: new Date(),
      tokenVersion: { increment: 1 },
    },
    include: userInclude,
  });
  await audit({ action: 'AUTH_PASSWORD_CHANGED', entity: 'User', entityId: actor.id, actor, ...ctx });

  // Other sessions are revoked; this one gets a fresh token.
  return { user: updated, token: signAccessToken(updated) };
}
