// Wrap async route handlers so rejected promises reach the error middleware.
export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Consistent success envelope: { success: true, data, meta? }
export function ok(res, data, { status = 200, meta } = {}) {
  const body = { success: true, data };
  if (meta) body.meta = meta;
  return res.status(status).json(body);
}

export function created(res, data) {
  return ok(res, data, { status: 201 });
}

// Parse ?page=&limit= into Prisma skip/take plus a meta builder.
export function getPagination(query, { defaultLimit = 20, maxLimit = 100 } = {}) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, Number.parseInt(query.limit, 10) || defaultLimit));
  return {
    page,
    limit,
    skip: (page - 1) * limit,
    take: limit,
    meta: (total) => ({ page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) }),
  };
}

export function clientInfo(req) {
  return { ipAddress: req.ip, userAgent: req.get('user-agent')?.slice(0, 255) };
}
