import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { env } from '../config/env.js';

export const PASSWORD_RULES =
  'Password must be 8–72 characters and include an uppercase letter, a lowercase letter, a number and a symbol.';

// bcrypt only uses the first 72 bytes, so cap the length there.
export const passwordSchema = z
  .string({ required_error: 'Password is required' })
  .min(8, PASSWORD_RULES)
  .max(72, PASSWORD_RULES)
  .refine((v) => /[a-z]/.test(v), PASSWORD_RULES)
  .refine((v) => /[A-Z]/.test(v), PASSWORD_RULES)
  .refine((v) => /\d/.test(v), PASSWORD_RULES)
  .refine((v) => /[^A-Za-z0-9]/.test(v), PASSWORD_RULES);

export function isStrongPassword(value) {
  return passwordSchema.safeParse(value).success;
}

export function hashPassword(plain) {
  return bcrypt.hash(plain, env.BCRYPT_ROUNDS);
}

export function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

// Used when a login email doesn't exist, so response time doesn't reveal it.
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser-not-a-real-password', 10);
export function fakeVerify(plain) {
  return bcrypt.compare(plain, DUMMY_HASH);
}
