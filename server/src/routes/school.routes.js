// Phase 2: academic structure, students, teachers and staff.
// Every route here is school-scoped (req.schoolId via requireSchool).
import { Router } from 'express';
import { z } from 'zod';
import { ADMIN_ROLES, ROLES } from '../config/roles.js';
import * as academic from '../controllers/academic.controller.js';
import * as people from '../controllers/people.controller.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { requireSchool } from '../middleware/school.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler as h } from '../utils/http.js';
import {
  classStudentsQuery,
  createAcademicYearSchema,
  createClassSchema,
  createSectionSchema,
  createSubjectSchema,
  listClassesQuery,
  listSubjectsQuery,
  promoteSchema,
  setClassSubjectsSchema,
  updateAcademicYearSchema,
  updateClassSchema,
  updateSectionSchema,
  updateSubjectSchema,
} from '../validators/academic.validators.js';
import { accountInput, idParam } from '../validators/common.js';
import {
  createStaffSchema,
  createStudentSchema,
  createTeacherSchema,
  enrollmentSchema,
  guardianLinkSchema,
  listEmployeesQuery,
  listGuardiansQuery,
  listStudentsQuery,
  updateStaffSchema,
  updateStudentSchema,
  updateTeacherSchema,
} from '../validators/people.validators.js';

const router = Router();

const admins = authorize(...ADMIN_ROLES);
const staffRoles = authorize(...ADMIN_ROLES, ROLES.TEACHER); // admins + teachers (read access)

// Applied per route (not router.use) so unknown /api paths still fall through to 404.
const scoped = [authenticate, requireSchool];

// ── Academic years ──
router.get('/academic-years', ...scoped, staffRoles, h(academic.listYears));
router.post('/academic-years', ...scoped, admins, validate({ body: createAcademicYearSchema }), h(academic.createYear));
router.patch('/academic-years/:id', ...scoped, admins, validate({ params: idParam, body: updateAcademicYearSchema }), h(academic.updateYear));

// ── Classes & sections ──
router.get('/classes', ...scoped, staffRoles, validate({ query: listClassesQuery }), h(academic.listClasses));
router.post('/classes', ...scoped, admins, validate({ body: createClassSchema }), h(academic.createClass));
router.post('/classes/promote', ...scoped, admins, validate({ body: promoteSchema }), h(academic.promote));
router.get('/classes/:id', ...scoped, staffRoles, validate({ params: idParam }), h(academic.getClass));
router.patch('/classes/:id', ...scoped, admins, validate({ params: idParam, body: updateClassSchema }), h(academic.updateClass));
router.get('/classes/:id/students', ...scoped, staffRoles, validate({ params: idParam, query: classStudentsQuery }), h(academic.classStudents));
router.put('/classes/:id/subjects', ...scoped, admins, validate({ params: idParam, body: setClassSubjectsSchema }), h(academic.setClassSubjects));
router.post('/classes/:id/sections', ...scoped, admins, validate({ params: idParam, body: createSectionSchema }), h(academic.addSection));
router.patch('/sections/:id', ...scoped, admins, validate({ params: idParam, body: updateSectionSchema }), h(academic.updateSection));

// ── Subjects ──
router.get('/subjects', ...scoped, staffRoles, validate({ query: listSubjectsQuery }), h(academic.listSubjects));
router.post('/subjects', ...scoped, admins, validate({ body: createSubjectSchema }), h(academic.createSubject));
router.patch('/subjects/:id', ...scoped, admins, validate({ params: idParam, body: updateSubjectSchema }), h(academic.updateSubject));

// ── Students ── (teachers: read-only, limited to their own classes)
router.get('/students', ...scoped, staffRoles, validate({ query: listStudentsQuery }), h(people.listStudents));
router.get('/students/export', ...scoped, admins, validate({ query: listStudentsQuery }), h(people.exportStudents));
router.post('/students', ...scoped, admins, validate({ body: createStudentSchema }), h(people.createStudent));
router.get('/students/:id', ...scoped, staffRoles, validate({ params: idParam }), h(people.getStudent));
router.patch('/students/:id', ...scoped, admins, validate({ params: idParam, body: updateStudentSchema }), h(people.updateStudent));
router.delete('/students/:id', ...scoped, admins, validate({ params: idParam }), h(people.deactivateStudent));
router.put('/students/:id/enrollment', ...scoped, admins, validate({ params: idParam, body: enrollmentSchema }), h(people.setEnrollment));
router.post('/students/:id/guardians', ...scoped, admins, validate({ params: idParam, body: guardianLinkSchema }), h(people.addGuardian));
router.delete(
  '/students/:id/guardians/:guardianId',
  ...scoped,
  admins,
  validate({ params: z.object({ id: z.string().min(1), guardianId: z.string().min(1) }) }),
  h(people.removeGuardian),
);
router.post('/students/:id/account', ...scoped, admins, validate({ params: idParam, body: accountInput }), h(people.createStudentLogin));
router.get('/guardians', ...scoped, admins, validate({ query: listGuardiansQuery }), h(people.listGuardians));

// ── Teachers ── (teachers can browse colleagues; salary is stripped for non-admins)
router.get('/teachers', ...scoped, staffRoles, validate({ query: listEmployeesQuery }), h(people.listTeachers));
router.post('/teachers', ...scoped, authorize(ROLES.SUPER_ADMIN), validate({ body: createTeacherSchema }), h(people.createTeacher));
router.get('/teachers/:id', ...scoped, staffRoles, validate({ params: idParam }), h(people.getTeacher));
router.patch('/teachers/:id', ...scoped, authorize(ROLES.SUPER_ADMIN), validate({ params: idParam, body: updateTeacherSchema }), h(people.updateTeacher));
router.post('/teachers/:id/account', ...scoped, authorize(ROLES.SUPER_ADMIN), validate({ params: idParam, body: accountInput }), h(people.createTeacherLogin));

// ── Non-teaching staff ──
router.get('/staff', ...scoped, admins, validate({ query: listEmployeesQuery }), h(people.listStaff));
router.post('/staff', ...scoped, admins, validate({ body: createStaffSchema }), h(people.createStaff));
router.get('/staff/:id', ...scoped, admins, validate({ params: idParam }), h(people.getStaff));
router.patch('/staff/:id', ...scoped, admins, validate({ params: idParam, body: updateStaffSchema }), h(people.updateStaff));

export default router;
