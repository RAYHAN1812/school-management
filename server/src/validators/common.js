import { z } from 'zod';
import { passwordSchema } from '../utils/password.js';
import { usernameSchema } from './auth.validators.js';

export const idParam = z.object({ id: z.string().trim().min(1) });

/** "YYYY-MM-DD" → Date at UTC midnight (stored in DATE columns). */
export const isoDate = z
  .string({ required_error: 'Date is required' })
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD')
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s); // rejects 2026-02-30
  }, 'Enter a real calendar date')
  .transform((s) => new Date(`${s}T00:00:00Z`));

/**
 * Optional text. '' and null both mean "clear the value" (→ null);
 * undefined means "not provided" (left unchanged on PATCH).
 */
export const optionalText = (max = 255) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v === '' ? null : v));

export const requiredText = (label, max = 255) =>
  z.string({ required_error: `${label} is required` }).trim().min(1, `${label} is required`).max(max);

export const phone = z
  .string({ required_error: 'Phone number is required' })
  .trim()
  .regex(/^\+?[0-9\s-]{7,20}$/, 'Enter a valid phone number');

export const optionalPhone = z
  .string()
  .trim()
  .nullish()
  .transform((v) => (v === '' ? null : v))
  .refine((v) => v == null || /^\+?[0-9\s-]{7,20}$/.test(v), 'Enter a valid phone number');

export const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .nullish()
  .transform((v) => (v === '' ? null : v))
  .refine((v) => v == null || z.string().email().safeParse(v).success, 'Enter a valid email address');

export const email = z.string().trim().toLowerCase().email('Enter a valid email address').max(254);

export const money = z.coerce
  .number({ invalid_type_error: 'Enter an amount' })
  .min(0, 'Amount cannot be negative')
  .max(99_999_999, 'Amount is too large');

export const paginationQuery = {
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
};

/** Optional login account to create alongside a profile. */
export const accountInput = z.object({
  username: usernameSchema.optional().or(z.literal('').transform(() => undefined)),
  password: passwordSchema,
});
