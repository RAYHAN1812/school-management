// Phase 6: parent and student portals.
import { Router } from 'express';
import { ROLES } from '../config/roles.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { requireSchool } from '../middleware/school.js';
import { validate } from '../middleware/validate.js';
import { myStudents, studentOverview } from '../services/portal.service.js';
import { asyncHandler as h, ok } from '../utils/http.js';
import { idParam } from '../validators/common.js';

const router = Router();
const scoped = [authenticate, requireSchool];

router.get('/portal/students', ...scoped, authorize(ROLES.PARENT, ROLES.STUDENT), h(async (req, res) => ok(res, await myStudents(req.schoolId, req.user))));
router.get(
  '/students/:id/overview',
  ...scoped,
  authorize(...Object.values(ROLES)),
  validate({ params: idParam }),
  h(async (req, res) => ok(res, await studentOverview(req.schoolId, req.params.id, req.user))),
);

export default router;
