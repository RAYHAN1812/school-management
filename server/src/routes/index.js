import { Router } from 'express';
import { z } from 'zod';
import { ADMIN_ROLES, ROLES } from '../config/roles.js';
import * as auth from '../controllers/auth.controller.js';
import * as misc from '../controllers/misc.controller.js';
import * as users from '../controllers/user.controller.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { loginLimiter, passwordResetLimiter } from '../middleware/rateLimiters.js';
import { validate } from '../middleware/validate.js';
import { requireSchool } from '../middleware/school.js';
import * as schoolDetails from '../services/school-details.service.js';
import { env } from '../config/env.js';
import { checkProfileStorage, getProfilePhoto, profilePhotoUpload, removeProfilePhoto, uploadProfilePhoto } from '../services/profile-photo.service.js';
import { asyncHandler as h, created, ok } from '../utils/http.js';
import campusRoutes from './campus.routes.js';
import examRoutes from './exam.routes.js';
import financeRoutes from './finance.routes.js';
import operationsRoutes from './operations.routes.js';
import portalRoutes from './portal.routes.js';
import reportRoutes from './report.routes.js';
import schoolRoutes from './school.routes.js';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from '../validators/auth.validators.js';
import {
  idParamSchema,
  listAuditLogsQuerySchema,
  listUsersQuerySchema,
  updateUserStatusSchema,
} from '../validators/user.validators.js';

const router = Router();

router.get('/health', (_req, res) => res.json({ success: true, data: { status: 'ok', time: new Date().toISOString() } }));

router.get('/public/school', h(async (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  return ok(res, await schoolDetails.getPublicSchoolPage());
}));
router.get('/public/school/image/:path(*)', h(async (req, res) => {
  const image = await schoolDetails.getPublicSchoolContentImage(req.params.path);
  res.setHeader('Content-Type', image.contentType);
  res.setHeader('Cache-Control', 'no-store');
  return res.send(image.buffer);
}));

// ── Auth ──────────────────────────────────────────────
router.post('/auth/login', loginLimiter, validate({ body: loginSchema }), h(auth.login));
router.post('/auth/logout', authenticateOptional, h(auth.logout));
router.get('/auth/me', authenticate, h(auth.me));
// Accounts are created by administrators, not by public self-sign-up.
router.post('/auth/register', authenticate, authorize(...ADMIN_ROLES), validate({ body: registerSchema }), h(auth.register));
router.post('/auth/forgot-password', passwordResetLimiter, validate({ body: forgotPasswordSchema }), h(auth.forgotPassword));
router.post('/auth/reset-password', passwordResetLimiter, validate({ body: resetPasswordSchema }), h(auth.resetPassword));
router.post('/auth/change-password', authenticate, validate({ body: changePasswordSchema }), h(auth.changePassword));

// Profile photos are stored privately in Supabase. The existing app JWT remains the
// authority for authorization; the service-role key never reaches the browser.
router.get('/profile/photo/me', authenticate, h(async (req, res) => {
  const photo = await getProfilePhoto(req.user, req.user.id);
  res.setHeader('Content-Type', photo.contentType);
  res.setHeader('Cache-Control', 'private, no-cache');
  return res.send(photo.buffer);
}));
router.get('/profile/photo/:id', authenticate, h(async (req, res) => {
  const photo = await getProfilePhoto(req.user, req.params.id);
  res.setHeader('Content-Type', photo.contentType);
  res.setHeader('Cache-Control', 'private, no-cache');
  return res.send(photo.buffer);
}));
router.post('/profile/photo', authenticate, profilePhotoUpload.single('photo'), h(async (req, res) =>
  ok(res, await uploadProfilePhoto(req.user, req.file)),
));
router.delete('/profile/photo', authenticate, h(async (req, res) =>
  ok(res, await removeProfilePhoto(req.user)),
));
router.get('/supabase/status', authenticate, h(async (req, res) => {
  if (!env.SUPABASE_URL) return ok(res, { connected: false, storageConfigured: false, reason: 'SUPABASE_URL_NOT_CONFIGURED', bucket: 'profile-photos' });
  if (!env.SUPABASE_SERVICE_ROLE_KEY) return ok(res, { connected: true, storageConfigured: false, reason: 'SUPABASE_STORAGE_KEY_MISSING', bucket: 'profile-photos' });
  return ok(res, await checkProfileStorage());
}));

// School Details: published content is readable by all users; only SUPER_ADMIN can manage it.
router.get('/school-details', authenticate, requireSchool, h(async (req, res) =>
  ok(res, await schoolDetails.getSchoolDetails(req.schoolId, req.user)),
));
router.patch('/school-details', authenticate, requireSchool, authorize(ROLES.SUPER_ADMIN), h(async (req, res) =>
  ok(res, await schoolDetails.updateSchoolDetails(req.schoolId, req.user, req.body)),
));
router.delete('/school-details', authenticate, requireSchool, authorize(ROLES.SUPER_ADMIN), h(async (req, res) =>
  ok(res, await schoolDetails.deleteSchoolDetails(req.schoolId, req.user)),
));
router.post('/school-details/upload', authenticate, requireSchool, authorize(ROLES.SUPER_ADMIN), schoolDetails.schoolContentUpload.single('image'), h(async (req, res) =>
  created(res, await schoolDetails.uploadSchoolContent(req.schoolId, req.user, req.file, req.query.category)),
));
router.get('/school-details/image/:path(*)', authenticate, requireSchool, h(async (req, res) => {
  const photo = await schoolDetails.getSchoolContentImage(req.schoolId, req.user, req.params.path);
  res.setHeader('Content-Type', photo.contentType);
  res.setHeader('Cache-Control', 'private, no-cache');
  return res.send(photo.buffer);
}));
router.post('/school-details/albums', authenticate, requireSchool, authorize(ROLES.SUPER_ADMIN), h(async (req, res) =>
  created(res, await schoolDetails.saveGalleryAlbum(req.schoolId, req.user, req.body)),
));
router.patch('/school-details/albums/:id', authenticate, requireSchool, authorize(ROLES.SUPER_ADMIN), h(async (req, res) =>
  ok(res, await schoolDetails.saveGalleryAlbum(req.schoolId, req.user, { ...req.body, id: req.params.id })),
));
router.delete('/school-details/albums/:id', authenticate, requireSchool, authorize(ROLES.SUPER_ADMIN), h(async (req, res) =>
  ok(res, await schoolDetails.deleteGalleryAlbum(req.schoolId, req.user, req.params.id)),
));
router.post('/school-details/gallery', authenticate, requireSchool, authorize(ROLES.SUPER_ADMIN), h(async (req, res) =>
  created(res, await schoolDetails.saveGalleryImage(req.schoolId, req.user, req.body)),
));
router.patch('/school-details/gallery/:id', authenticate, requireSchool, authorize(ROLES.SUPER_ADMIN), h(async (req, res) =>
  ok(res, await schoolDetails.saveGalleryImage(req.schoolId, req.user, { ...req.body, id: req.params.id })),
));
router.delete('/school-details/gallery/:id', authenticate, requireSchool, authorize(ROLES.SUPER_ADMIN), h(async (req, res) =>
  ok(res, await schoolDetails.deleteGalleryImage(req.schoolId, req.user, req.params.id)),
));

// ── Users & roles (admin) ─────────────────────────────
router.get('/users', authenticate, authorize(...ADMIN_ROLES), validate({ query: listUsersQuerySchema }), h(users.list));
router.get('/users/:id', authenticate, authorize(...ADMIN_ROLES), validate({ params: idParamSchema }), h(users.get));
router.patch(
  '/users/:id/status',
  authenticate,
  authorize(...ADMIN_ROLES),
  validate({ params: idParamSchema, body: updateUserStatusSchema }),
  h(users.updateStatus),
);
router.get('/roles', authenticate, authorize(...ADMIN_ROLES), h(users.roles));
router.get('/audit-logs', authenticate, authorize(...ADMIN_ROLES), validate({ query: listAuditLogsQuerySchema }), h(users.auditLogs));

// ── Schools (super admin) ─────────────────────────────
const createSchoolSchema = z.object({
  name: z.string().trim().min(2).max(150),
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{2,20}$/, 'Code: 2–20 letters, numbers or dashes'),
  address: z.string().trim().max(300).optional(),
  phone: z.string().trim().max(30).optional(),
  email: z.string().trim().toLowerCase().email().optional(),
});
router.get('/schools', authenticate, authorize(ROLES.SUPER_ADMIN), h(misc.listSchools));
router.post('/schools', authenticate, authorize(ROLES.SUPER_ADMIN), validate({ body: createSchoolSchema }), h(misc.createSchool));

// ── Dashboard ─────────────────────────────────────────
router.get('/dashboard/summary', authenticate, h(misc.dashboardSummary));

// ── Academics, students, teachers, staff (Phase 2) ────
router.use(schoolRoutes);

// ── Attendance & timetable (Phase 3) ──────────────────
router.use(operationsRoutes);

// ── Exams & results (Phase 4) ─────────────────────────
router.use(examRoutes);

// ── Fees & payments (Phase 5) ─────────────────────────
router.use(financeRoutes);

// ── Parent & student portals (Phase 6) ────────────────
router.use(portalRoutes);

// ── Homework, notices, library, transport, files (Phase 7) ──
router.use(campusRoutes);

// ── Reports & exports (Phase 8) ───────────────────────
router.use(reportRoutes);

export default router;

// Logout should succeed even when the session already expired.
function authenticateOptional(req, res, next) {
  authenticate(req, res, () => next());
}
