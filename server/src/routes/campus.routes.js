// Phase 7: homework, notices, library, transport and file uploads.
import { Router } from 'express';
import { z } from 'zod';
import { ADMIN_ROLES, ROLES } from '../config/roles.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { requireSchool } from '../middleware/school.js';
import { validate } from '../middleware/validate.js';
import * as homework from '../services/homework.service.js';
import * as library from '../services/library.service.js';
import * as notices from '../services/notice.service.js';
import * as transport from '../services/transport.service.js';
import { assertCanAccessFile } from '../services/file-access.service.js';
import { resolveFile, uploader, verifyUpload } from '../services/upload.service.js';
import { asyncHandler as h, clientInfo as ctx, created, ok } from '../utils/http.js';
import { idParam } from '../validators/common.js';
import * as v from '../validators/campus.validators.js';

const router = Router();
const scoped = [authenticate, requireSchool];
const admins = authorize(...ADMIN_ROLES);
const staff = authorize(...ADMIN_ROLES, ROLES.TEACHER);
const anyone = authorize(...Object.values(ROLES));
const withMeta = (fn) => h(async (req, res) => {
  const { items, meta } = await fn(req);
  return ok(res, items, { meta });
});

// ── Files ──
router.post('/uploads', ...scoped, uploader.single('file'), h(async (req, res) => created(res, await verifyUpload(req.file, req.schoolId, req.user))));
router.get(
  '/files/:name',
  ...scoped,
  validate({ params: z.object({ name: z.string().max(60) }) }),
  h(async (req, res) => {
    const { full, isImage } = resolveFile(req.params.name);
    await assertCanAccessFile(req.schoolId, req.params.name, req.user);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    if (!isImage) res.setHeader('Content-Disposition', `attachment; filename="${req.params.name}"`);
    res.sendFile(full);
  }),
);

// ── Homework ──
router.get('/assignments', ...scoped, anyone, validate({ query: v.listAssignmentsQuery }), h(async (req, res) => ok(res, await homework.listAssignments(req.schoolId, req.query, req.user))));
router.post('/assignments', ...scoped, staff, validate({ body: v.createAssignmentSchema }), h(async (req, res) => created(res, await homework.createAssignment(req.schoolId, req.body, req.user, ctx(req)))));
router.get('/assignments/:id', ...scoped, anyone, validate({ params: idParam }), h(async (req, res) => ok(res, await homework.getAssignment(req.schoolId, req.params.id, req.user))));
router.patch('/assignments/:id', ...scoped, staff, validate({ params: idParam, body: v.updateAssignmentSchema }), h(async (req, res) => ok(res, await homework.updateAssignment(req.schoolId, req.params.id, req.body, req.user, ctx(req)))));
router.delete('/assignments/:id', ...scoped, staff, validate({ params: idParam }), h(async (req, res) => ok(res, await homework.deleteAssignment(req.schoolId, req.params.id, req.user, ctx(req)))));
router.get('/assignments/:id/submissions', ...scoped, staff, validate({ params: idParam }), h(async (req, res) => ok(res, await homework.listSubmissions(req.schoolId, req.params.id, req.user))));
router.post('/assignments/:id/submissions', ...scoped, authorize(ROLES.STUDENT), validate({ params: idParam, body: v.submitSchema }), h(async (req, res) => created(res, await homework.submitAssignment(req.schoolId, req.params.id, req.body, req.user, ctx(req)))));
router.patch('/submissions/:id/grade', ...scoped, staff, validate({ params: idParam, body: v.gradeSchema }), h(async (req, res) => ok(res, await homework.gradeSubmission(req.schoolId, req.params.id, req.body, req.user, ctx(req)))));

// ── Notices ──
router.get('/notices', ...scoped, anyone, validate({ query: v.listNoticesQuery }), withMeta((req) => notices.listNotices(req.schoolId, req.query, req.user)));
router.post('/notices', ...scoped, staff, validate({ body: v.createNoticeSchema }), h(async (req, res) => created(res, await notices.createNotice(req.schoolId, req.body, req.user, ctx(req)))));
router.get('/notices/:id', ...scoped, anyone, validate({ params: idParam }), h(async (req, res) => ok(res, await notices.getNotice(req.schoolId, req.params.id, req.user))));
router.patch('/notices/:id', ...scoped, staff, validate({ params: idParam, body: v.updateNoticeSchema }), h(async (req, res) => ok(res, await notices.updateNotice(req.schoolId, req.params.id, req.body, req.user, ctx(req)))));
router.delete('/notices/:id', ...scoped, staff, validate({ params: idParam }), h(async (req, res) => ok(res, await notices.deleteNotice(req.schoolId, req.params.id, req.user, ctx(req)))));
router.post('/notices/:id/read', ...scoped, anyone, validate({ params: idParam }), h(async (req, res) => ok(res, await notices.markRead(req.schoolId, req.params.id, req.user))));

// ── Library ──
router.get('/books', ...scoped, anyone, validate({ query: v.listBooksQuery }), withMeta((req) => library.listBooks(req.schoolId, req.query)));
router.post('/books', ...scoped, admins, validate({ body: v.createBookSchema }), h(async (req, res) => created(res, await library.createBook(req.schoolId, req.body, req.user, ctx(req)))));
router.patch('/books/:id', ...scoped, admins, validate({ params: idParam, body: v.updateBookSchema }), h(async (req, res) => ok(res, await library.updateBook(req.schoolId, req.params.id, req.body, req.user, ctx(req)))));
router.post('/books/:id/issue', ...scoped, admins, validate({ params: idParam, body: v.issueBookSchema }), h(async (req, res) => created(res, await library.issueBook(req.schoolId, req.params.id, req.body, req.user, ctx(req)))));
router.post('/books/:id/return', ...scoped, admins, validate({ params: idParam, body: v.returnBookSchema }), h(async (req, res) => ok(res, await library.returnBook(req.schoolId, req.params.id, req.body, req.user, ctx(req)))));
router.get('/book-issues', ...scoped, admins, validate({ query: v.listIssuesQuery }), withMeta((req) => library.listIssues(req.schoolId, req.query)));
router.get('/library/stats', ...scoped, admins, h(async (req, res) => ok(res, await library.libraryStats(req.schoolId))));
router.get('/students/:id/library', ...scoped, anyone, validate({ params: idParam }), h(async (req, res) => ok(res, await library.studentLibrary(req.schoolId, req.params.id, req.user))));

// ── Transport ──
router.get('/buses', ...scoped, admins, h(async (req, res) => ok(res, await transport.listBuses(req.schoolId))));
router.post('/buses', ...scoped, admins, validate({ body: v.busSchema }), h(async (req, res) => created(res, await transport.createBus(req.schoolId, req.body, req.user, ctx(req)))));
router.patch('/buses/:id', ...scoped, admins, validate({ params: idParam, body: v.updateBusSchema }), h(async (req, res) => ok(res, await transport.updateBus(req.schoolId, req.params.id, req.body, req.user, ctx(req)))));
router.get('/transport-routes', ...scoped, admins, h(async (req, res) => ok(res, await transport.listRoutes(req.schoolId))));
router.post('/transport-routes', ...scoped, admins, validate({ body: v.routeSchema }), h(async (req, res) => created(res, await transport.createRoute(req.schoolId, req.body, req.user, ctx(req)))));
router.get('/transport-routes/:id', ...scoped, admins, validate({ params: idParam }), h(async (req, res) => ok(res, await transport.getRoute(req.schoolId, req.params.id))));
router.patch('/transport-routes/:id', ...scoped, admins, validate({ params: idParam, body: v.updateRouteSchema }), h(async (req, res) => ok(res, await transport.updateRoute(req.schoolId, req.params.id, req.body, req.user, ctx(req)))));
router.post('/transport-routes/:id/students', ...scoped, admins, validate({ params: idParam, body: v.assignTransportSchema }), h(async (req, res) => created(res, await transport.assignStudent(req.schoolId, req.params.id, req.body, req.user, ctx(req)))));
router.delete('/transport-assignments/:id', ...scoped, admins, validate({ params: idParam }), h(async (req, res) => ok(res, await transport.unassignStudent(req.schoolId, req.params.id, req.user, ctx(req)))));
router.get('/students/:id/transport', ...scoped, anyone, validate({ params: idParam }), h(async (req, res) => ok(res, await transport.studentTransport(req.schoolId, req.params.id, req.user))));

export default router;
