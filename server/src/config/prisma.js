import { PrismaClient } from '@prisma/client';
import { env } from './env.js';

// Reuse a single client across hot reloads in development.
const globalForPrisma = globalThis;

export const prisma =
  globalForPrisma.__prisma ??
  new PrismaClient({
    log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (!env.isProduction) globalForPrisma.__prisma = prisma;
