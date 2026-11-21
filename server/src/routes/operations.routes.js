// Phase 3: attendance and timetable.
import { Router } from 'express';
import { ADMIN_ROLES, ROLES } from '../config/roles.js';
import * as ops from '../controllers/operations.controller.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { requireSchool } from '../middleware/school.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler as h } from '../utils/http.js';
import { idParam } from '../validators/common.js';
import {
  attendanceReportQuery,
  attendanceSheetQuery,
  createTimetableSchema,
  listAttendanceQuery,
  listTimetableQuery,
  myTimetableQuery,
  recordAttendanceSchema,
  studentAttendanceQuery,
  updateAttendanceSchema,
  updateTimetableSchema,
} from '../validators/operations.validators.js';

const router = Router();
const scoped = [authenticate, requireSchool];
const admins = authorize(...ADMIN_ROLES);
const staff = authorize(...ADMIN_ROLES, ROLES.TEACHER);
const anyone = authorize(...Object.values(ROLES));

// ── Attendance ── (teachers limited to their own sections inside the service)
router.get('/attendance/sections', ...scoped, staff, h(ops.mySections));
router.get('/attendance/sheet', ...scoped, staff, validate({ query: attendanceSheetQuery }), h(ops.sheet));
router.get('/attendance/reports', ...scoped, staff, validate({ query: attendanceReportQuery }), h(ops.report));
router.get('/attendance', ...scoped, anyone, validate({ query: listAttendanceQuery }), h(ops.list));
router.post('/attendance', ...scoped, staff, validate({ body: recordAttendanceSchema }), h(ops.record));
router.put('/attendance', ...scoped, staff, validate({ body: recordAttendanceSchema }), h(ops.updateDay));
router.patch('/attendance/:id', ...scoped, staff, validate({ params: idParam, body: updateAttendanceSchema }), h(ops.updateOne));
router.get(
  '/students/:id/attendance',
  ...scoped,
  anyone,
  validate({ params: idParam, query: studentAttendanceQuery }),
  h(ops.studentSummary),
);

// ── Timetable ──
router.get('/timetables/me', ...scoped, anyone, validate({ query: myTimetableQuery }), h(ops.myTimetable));
router.get('/timetables', ...scoped, staff, validate({ query: listTimetableQuery }), h(ops.listTimetable));
router.post('/timetables', ...scoped, admins, validate({ body: createTimetableSchema }), h(ops.createTimetable));
router.patch('/timetables/:id', ...scoped, admins, validate({ params: idParam, body: updateTimetableSchema }), h(ops.updateTimetable));
router.delete('/timetables/:id', ...scoped, admins, validate({ params: idParam }), h(ops.deleteTimetable));

export default router;
