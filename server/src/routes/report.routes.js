// Phase 8: reports with Excel / PDF / CSV export.
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { ADMIN_ROLES, ROLES } from '../config/roles.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { requireSchool } from '../middleware/school.js';
import { validate } from '../middleware/validate.js';
import { REPORT_TYPES, buildReport } from '../services/report.service.js';
import { AppError } from '../utils/AppError.js';
import { audit } from '../utils/audit.js';
import { toCsv, toPdf, toXlsx } from '../utils/exporters.js';
import { asyncHandler as h, clientInfo, ok } from '../utils/http.js';
import { isoDate } from '../validators/common.js';

const router = Router();
const scoped = [authenticate, requireSchool];

// Teachers may run the class-level reports for their own classes (enforced in the services).
const TEACHER_REPORTS = ['attendance', 'exam'];

const reportQuery = z.object({
  format: z.enum(['json', 'xlsx', 'pdf', 'csv']).default('json'),
  from: isoDate.optional(),
  to: isoDate.optional(),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
  classId: z.string().trim().optional(),
  sectionId: z.string().trim().optional(),
  examId: z.string().trim().optional(),
});

router.get('/reports', ...scoped, authorize(...ADMIN_ROLES, ROLES.TEACHER), (req, res) => {
  const isTeacher = req.user.role.key === ROLES.TEACHER;
  const types = Object.entries(REPORT_TYPES)
    .filter(([key]) => !isTeacher || TEACHER_REPORTS.includes(key))
    .map(([key, title]) => ({ key, title }));
  return ok(res, types);
});

router.get(
  '/reports/:type',
  ...scoped,
  authorize(...ADMIN_ROLES, ROLES.TEACHER),
  validate({ params: z.object({ type: z.enum(Object.keys(REPORT_TYPES)) }), query: reportQuery }),
  h(async (req, res) => {
    if (req.user.role.key === ROLES.TEACHER && !TEACHER_REPORTS.includes(req.params.type)) throw AppError.forbidden();
    const report = await buildReport(req.schoolId, req.params.type, req.query, req.user);
    const { format } = req.query;
    if (format === 'json') return ok(res, report);

    const school = await prisma.school.findUnique({ where: { id: req.schoolId }, select: { name: true } });
    const stamp = new Date().toISOString().slice(0, 10);
    const base = `${req.params.type}-${stamp}`;
    const files = {
      xlsx: { body: () => toXlsx(report), type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
      pdf: { body: () => toPdf(report, { schoolName: school?.name }), type: 'application/pdf' },
      csv: { body: async () => toCsv(report), type: 'text/csv; charset=utf-8' },
    };
    const file = files[format];
    const body = await file.body();
    await audit({ action: 'REPORT_EXPORTED', entity: 'Report', entityId: req.params.type, actor: req.user, schoolId: req.schoolId, metadata: { format }, ...clientInfo(req) });
    res.setHeader('Content-Type', file.type);
    res.setHeader('Content-Disposition', `attachment; filename="${base}.${format}"`);
    return res.send(body);
  }),
);

export default router;
