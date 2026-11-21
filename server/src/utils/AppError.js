/**
 * Operational error with an HTTP status and a stable machine-readable code
 * (e.g. 409 DUPLICATE_STUDENT_ID). Thrown from services, rendered by errorHandler.
 */
export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message ?? code);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(code = 'BAD_REQUEST', message = 'Bad request', details) {
    return new AppError(400, code, message, details);
  }

  static unauthorized(code = 'UNAUTHORIZED', message = 'Authentication required') {
    return new AppError(401, code, message);
  }

  static forbidden(code = 'FORBIDDEN', message = 'You do not have permission to perform this action') {
    return new AppError(403, code, message);
  }

  static notFound(code = 'NOT_FOUND', message = 'Resource not found') {
    return new AppError(404, code, message);
  }

  static conflict(code = 'CONFLICT', message = 'Resource already exists') {
    return new AppError(409, code, message);
  }

  static serviceUnavailable(code = 'SERVICE_UNAVAILABLE', message = 'Service unavailable', details) {
    return new AppError(503, code, message, details);
  }

  static badGateway(code = 'BAD_GATEWAY', message = 'Upstream service error', details) {
    return new AppError(502, code, message, details);
  }
}
