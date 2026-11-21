import * as employees from '../services/employee.service.js';
import * as students from '../services/student.service.js';
import { clientInfo, created, ok } from '../utils/http.js';

// ── Students ──
export async function listStudents(req, res) {
  const { items, meta } = await students.listStudents(req.schoolId, req.query, req.user);
  return ok(res, items, { meta });
}

export async function exportStudents(req, res) {
  const csv = await students.exportStudentsCsv(req.schoolId, req.query, req.user);
  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="students-${stamp}.csv"`);
  res.send(csv);
}

export const getStudent = async (req, res) => ok(res, await students.getStudent(req.schoolId, req.params.id, req.user));
export const createStudent = async (req, res) =>
  created(res, await students.createStudent(req.schoolId, req.body, req.user, clientInfo(req)));
export const updateStudent = async (req, res) =>
  ok(res, await students.updateStudent(req.schoolId, req.params.id, req.body, req.user, clientInfo(req)));
export const deactivateStudent = async (req, res) =>
  ok(res, await students.deactivateStudent(req.schoolId, req.params.id, req.user, clientInfo(req)));
export const setEnrollment = async (req, res) =>
  ok(res, await students.setEnrollment(req.schoolId, req.params.id, req.body, req.user, clientInfo(req)));
export const addGuardian = async (req, res) =>
  created(res, await students.addGuardian(req.schoolId, req.params.id, req.body, req.user, clientInfo(req)));
export const removeGuardian = async (req, res) =>
  ok(res, await students.removeGuardian(req.schoolId, req.params.id, req.params.guardianId, req.user, clientInfo(req)));
export const listGuardians = async (req, res) => ok(res, await students.listGuardians(req.schoolId, req.query));
export const createStudentLogin = async (req, res) =>
  created(res, await students.createStudentLogin(req.schoolId, req.params.id, req.body, req.user, clientInfo(req)));
export const createTeacherLogin = async (req, res) =>
  created(res, await employees.createTeacherLogin(req.schoolId, req.params.id, req.body, req.user, clientInfo(req)));

// ── Teachers ──
export async function listTeachers(req, res) {
  const { items, meta } = await employees.listTeachers(req.schoolId, req.query, req.user);
  return ok(res, items, { meta });
}
export const getTeacher = async (req, res) => ok(res, await employees.getTeacher(req.schoolId, req.params.id, req.user));
export const createTeacher = async (req, res) =>
  created(res, await employees.createTeacher(req.schoolId, req.body, req.user, clientInfo(req)));
export const updateTeacher = async (req, res) =>
  ok(res, await employees.updateTeacher(req.schoolId, req.params.id, req.body, req.user, clientInfo(req)));

// ── Staff ──
export async function listStaff(req, res) {
  const { items, meta } = await employees.listStaff(req.schoolId, req.query);
  return ok(res, items, { meta });
}
export const getStaff = async (req, res) => ok(res, await employees.getStaff(req.schoolId, req.params.id));
export const createStaff = async (req, res) =>
  created(res, await employees.createStaff(req.schoolId, req.body, req.user, clientInfo(req)));
export const updateStaff = async (req, res) =>
  ok(res, await employees.updateStaff(req.schoolId, req.params.id, req.body, req.user, clientInfo(req)));
