import { z } from 'zod';
import { ROLES } from '../config/roles.js';
import { passwordSchema } from '../utils/password.js';

const email = z.string().trim().toLowerCase().email('Enter a valid email address').max(254);

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._-]{3,30}$/, 'Username must be 3–30 characters: letters, numbers, dot, dash or underscore');

export const loginSchema = z.object({
  // Email or username
  identifier: z.string().trim().toLowerCase().min(1, 'Email or username is required').max(254),
  password: z.string().min(1, 'Password is required').max(72),
});

export const registerSchema = z.object({
  fullName: z.string().trim().min(2, 'Full name is required').max(120),
  email,
  username: usernameSchema.optional().or(z.literal('').transform(() => undefined)),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9\s-]{7,20}$/, 'Enter a valid phone number')
    .optional()
    .or(z.literal('').transform(() => undefined)),
  password: passwordSchema,
  role: z.nativeEnum(ROLES, { errorMap: () => ({ message: 'Choose a valid role' }) }),
  // Required for every role except SUPER_ADMIN when the creator is a super admin.
  schoolId: z.string().trim().min(1).optional(),
});

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z.object({
  token: z.string().trim().regex(/^[a-f0-9]{64}$/, 'Reset link is invalid'),
  password: passwordSchema,
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required').max(72),
    newPassword: passwordSchema,
  })
  .refine((d) => d.currentPassword !== d.newPassword, {
    path: ['newPassword'],
    message: 'New password must be different from the current password',
  });
