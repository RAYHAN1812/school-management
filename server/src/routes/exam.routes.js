// Phase 4: examinations, marks, grading and results.
import { Router } from 'express';
import { z } from 'zod';
import { ADMIN_ROLES, ROLES } from '../config/roles.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { requireSchool } from '../middleware/school.js';
import { validate } from '../middleware/validate.js';
import * as exams from '../services/exam.service.js';
import { asyncHandler as h, clientInfo, created, ok } from '../utils/http.js';
import { idParam } from '../validators/common.js';
import {
  createExamSchema,
  enterMarksSchema,
  gradeScaleSchema,
  listExamsQuery,
  marksSheetQuery,
  resultsQuery,
  updateExamSchema,
} from '../validators/exam.validators.js';

const router = Router();
const scoped = [authenticate, requireSchool];
const admins = authorize(...ADMIN_ROLES);
const staff = authorize(...ADMIN_ROLES, ROLES.TEACHER);
const anyone = authorize(...Object.values(ROLES));
const examStudentParams = z.object({ id: z.string().min(1), studentId: z.string().min(1) });

// Grading scale
router.get('/grade-scales', ...scoped, anyone, h(async (req, res) => ok(res, await exams.getGradeScale(req.schoolId))));
router.put(
  '/grade-scales',
  ...scoped,
  admins,
  validate({ body: gradeScaleSchema }),
  h(async (req, res) => ok(res, await exams.setGradeScale(req.schoolId, req.body, req.user, clientInfo(req)))),
);

// Exams
router.get('/exams', ...scoped, staff, validate({ query: listExamsQuery }), h(async (req, res) => ok(res, await exams.listExams(req.schoolId, req.query, req.user))));
router.post(
  '/exams',
  ...scoped,
  admins,
  validate({ body: createExamSchema }),
  h(async (req, res) => created(res, await exams.createExam(req.schoolId, req.body, req.user, clientInfo(req)))),
);
router.get('/exams/:id', ...scoped, staff, validate({ params: idParam }), h(async (req, res) => ok(res, await exams.getExam(req.schoolId, req.params.id, req.user))));
router.patch(
  '/exams/:id',
  ...scoped,
  admins,
  validate({ params: idParam, body: updateExamSchema }),
  h(async (req, res) => ok(res, await exams.updateExam(req.schoolId, req.params.id, req.body, req.user, clientInfo(req)))),
);

// Marks
router.get(
  '/exams/:id/marks',
  ...scoped,
  staff,
  validate({ params: idParam, query: marksSheetQuery }),
  h(async (req, res) => ok(res, await exams.marksSheet(req.schoolId, req.params.id, req.query, req.user))),
);
router.post(
  '/exams/:id/marks',
  ...scoped,
  staff,
  validate({ params: idParam, body: enterMarksSchema }),
  h(async (req, res) => ok(res, await exams.enterMarks(req.schoolId, req.params.id, req.body, req.user, clientInfo(req)))),
);

// Results
router.get(
  '/exams/:id/results',
  ...scoped,
  staff,
  validate({ params: idParam, query: resultsQuery }),
  h(async (req, res) => ok(res, await exams.examResults(req.schoolId, req.params.id, req.query, req.user))),
);
router.post('/exams/:id/publish', ...scoped, admins, validate({ params: idParam }), h(async (req, res) => ok(res, await exams.publishResults(req.schoolId, req.params.id, req.user, clientInfo(req)))));
router.post('/exams/:id/unpublish', ...scoped, admins, validate({ params: idParam }), h(async (req, res) => ok(res, await exams.unpublishResults(req.schoolId, req.params.id, req.user, clientInfo(req)))));
router.get(
  '/exams/:id/report-card/:studentId',
  ...scoped,
  anyone,
  validate({ params: examStudentParams }),
  h(async (req, res) => ok(res, await exams.reportCard(req.schoolId, req.params.id, req.params.studentId, req.user))),
);
router.get(
  '/students/:id/results',
  ...scoped,
  anyone,
  validate({ params: idParam }),
  h(async (req, res) => ok(res, await exams.studentResults(req.schoolId, req.params.id, req.user))),
);

export default router;
