import { z } from 'zod';
import { ROLES } from '../config/roles.js';

export const idParamSchema = z.object({ id: z.string().trim().min(1) });

export const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  search: z.string().trim().max(100).optional(),
  role: z.nativeEnum(ROLES).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  schoolId: z.string().trim().optional(), // super admin only
});

export const updateUserStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'INACTIVE'], { errorMap: () => ({ message: 'Status must be ACTIVE or INACTIVE' }) }),
});

export const listAuditLogsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  action: z.string().trim().max(60).optional(),
});
