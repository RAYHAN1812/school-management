import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

const limited = (message) => ({
  success: false,
  error: { code: 'TOO_MANY_REQUESTS', message },
});

// Brute-force protection for credential endpoints. Disabled under tests.
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  skip: () => env.isTest,
  message: limited('Too many login attempts. Please try again in 15 minutes.'),
});

export const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => env.isTest,
  message: limited('Too many password reset requests. Please try again later.'),
});

export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => env.isTest,
  message: limited('Too many requests. Please slow down.'),
});
