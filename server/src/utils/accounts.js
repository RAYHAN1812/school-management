import { Prisma } from '@prisma/client';
import { AppError } from './AppError.js';
import { hashPassword } from './password.js';

/**
 * Create a login account for a profile (student, parent, teacher) inside a
 * transaction. Email/username clashes → 409 with the usual auth error codes.
 */
export async function createLinkedUser(tx, { schoolId, role, email, fullName, phone, username, password }) {
  if (!email) throw AppError.badRequest('EMAIL_REQUIRED', 'An email address is required to create a login account');
  const [emailTaken, usernameTaken] = await Promise.all([
    tx.user.findUnique({ where: { email }, select: { id: true } }),
    username ? tx.user.findUnique({ where: { username }, select: { id: true } }) : null,
  ]);
  if (emailTaken) throw AppError.conflict('EMAIL_ALREADY_EXISTS', `A login account already exists for ${email}`);
  if (usernameTaken) throw AppError.conflict('USERNAME_ALREADY_EXISTS', `Username "${username}" is already taken`);

  return tx.user.create({
    data: {
      email,
      username: username ?? null,
      fullName,
      phone: phone ?? null,
      passwordHash: await hashPassword(password),
      role: { connect: { key: role } },
      school: { connect: { id: schoolId } },
    },
  });
}

/**
 * Give an existing profile (student/teacher) a login. `model` is the Prisma
 * delegate name; the profile's own email becomes the sign-in email.
 */
export async function attachLogin(prisma, { model, schoolId, id, role, account, notFound }) {
  return prisma.$transaction(async (tx) => {
    const profile = await tx[model].findFirst({ where: { id, schoolId } });
    if (!profile) throw notFound;
    if (profile.userId) throw AppError.conflict('ACCOUNT_EXISTS', 'This person already has a login account');
    const user = await createLinkedUser(tx, {
      schoolId,
      role,
      email: profile.email,
      fullName: profile.fullName,
      phone: profile.phone,
      ...account,
    });
    await tx[model].update({ where: { id }, data: { userId: user.id } });
    return user;
  });
}

/** Deactivate (and sign out) or reactivate the login linked to a profile. */
export async function syncUserStatus(tx, userId, active) {
  if (!userId) return;
  await tx.user.update({
    where: { id: userId },
    data: active ? { status: 'ACTIVE' } : { status: 'INACTIVE', tokenVersion: { increment: 1 } },
  });
}

/** Map a unique-constraint race to a friendly 409 using the violated fields. */
export function rethrowUnique(err, map) {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    const target = String(err.meta?.target ?? '');
    for (const [field, appError] of Object.entries(map)) {
      if (target.includes(field)) throw appError;
    }
  }
  throw err;
}
