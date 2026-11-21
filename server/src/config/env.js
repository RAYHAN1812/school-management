import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('1d'),
  CLIENT_URL: z.string().default('http://localhost:5173'),
  PUBLIC_SCHOOL_CODE: z.string().trim().min(2).max(20).default('GIS'),
  COOKIE_SECURE: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),
  // Public base URL of this API (for payment-gateway callbacks), e.g. https://api.example.com
  API_PUBLIC_URL: z.string().url().optional().or(z.literal('').transform(() => undefined)),
  // SSLCommerz online payments (optional; get sandbox credentials at developer.sslcommerz.com)
  SSLCOMMERZ_STORE_ID: z.string().optional(),
  SSLCOMMERZ_STORE_PASSWORD: z.string().optional(),
  SSLCOMMERZ_SANDBOX: z
    .string()
    .optional()
    .transform((v) => v !== 'false'),
  // Folder for uploaded files (assignment attachments, notices, photos)
  UPLOAD_DIR: z.string().default('src/uploads'),
  SUPABASE_URL: z.string().url().optional().or(z.literal('').transform(() => undefined)),
  SUPABASE_PUBLISHABLE_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional().or(z.literal('').transform(() => undefined)),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().optional(),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  // Fail fast: a misconfigured server must never start.
  console.error(`Invalid environment configuration:\n${issues}`);
  process.exit(1);
}

export const env = {
  ...parsed.data,
  SUPABASE_URL: parsed.data.SUPABASE_URL || parsed.data.NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY:
    parsed.data.SUPABASE_PUBLISHABLE_KEY || parsed.data.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  isProduction: parsed.data.NODE_ENV === 'production',
  isTest: parsed.data.NODE_ENV === 'test',
  // Allow a comma-separated list of origins for CORS.
  clientOrigins: parsed.data.CLIENT_URL.split(',').map((s) => s.trim()).filter(Boolean),
};
