import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';

export function notFoundHandler(req, _res, next) {
  next(AppError.notFound('ROUTE_NOT_FOUND', `No route for ${req.method} ${req.originalUrl}`));
}

// Centralised error → JSON response: { success: false, error: { code, message, details? } }
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  let status = 500;
  let code = 'INTERNAL_SERVER_ERROR';
  let message = 'Something went wrong';
  let details;

  if (err instanceof AppError) {
    ({ status, code, message, details } = err);
  } else if (err instanceof ZodError) {
    status = 400;
    code = 'VALIDATION_ERROR';
    message = 'Request validation failed';
    details = err.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
  } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      status = 409;
      code = 'DUPLICATE_RECORD';
      message = 'A record with these values already exists';
      details = { fields: err.meta?.target };
    } else if (err.code === 'P2025') {
      status = 404;
      code = 'NOT_FOUND';
      message = 'Resource not found';
    } else if (err.code === 'P2003') {
      status = 400;
      code = 'INVALID_REFERENCE';
      message = 'A referenced record does not exist';
    }
  } else if (err?.name === 'MulterError') {
    status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    code = err.code === 'LIMIT_FILE_SIZE'
      ? (req.originalUrl?.includes('/profile/photo') ? 'PROFILE_PHOTO_TOO_LARGE' : 'FILE_TOO_LARGE')
      : 'INVALID_UPLOAD';
    message = err.code === 'LIMIT_FILE_SIZE'
      ? (req.originalUrl?.includes('/profile/photo') ? 'Profile photo must be 2 MB or smaller' : 'Files can be at most 5 MB')
      : 'Upload one file in the "file" field';
  } else if (err?.type === 'entity.parse.failed') {
    status = 400;
    code = 'INVALID_JSON';
    message = 'Request body is not valid JSON';
  } else if (err?.type === 'entity.too.large') {
    status = 413;
    code = 'PAYLOAD_TOO_LARGE';
    message = 'Request body is too large';
  }

  if (status >= 500) {
    console.error('[error]', req.method, req.originalUrl, err);
  }

  const body = { success: false, error: { code, message } };
  if (details !== undefined) body.error.details = details;
  if (status >= 500 && !env.isProduction && err?.message) body.error.debug = err.message;

  res.status(status).json(body);
}
