import * as academic from '../services/academic.service.js';
import { clientInfo, created, ok } from '../utils/http.js';

export const listYears = async (req, res) => ok(res, await academic.listAcademicYears(req.schoolId));
export const createYear = async (req, res) =>
  created(res, await academic.createAcademicYear(req.schoolId, req.body, req.user, clientInfo(req)));
export const updateYear = async (req, res) =>
  ok(res, await academic.updateAcademicYear(req.schoolId, req.params.id, req.body, req.user, clientInfo(req)));

export const listClasses = async (req, res) => ok(res, await academic.listClasses(req.schoolId, req.query, req.user));
export const getClass = async (req, res) => ok(res, await academic.getClass(req.schoolId, req.params.id, req.user));
export const createClass = async (req, res) =>
  created(res, await academic.createClass(req.schoolId, req.body, req.user, clientInfo(req)));
export const updateClass = async (req, res) =>
  ok(res, await academic.updateClass(req.schoolId, req.params.id, req.body, req.user, clientInfo(req)));
export const addSection = async (req, res) =>
  created(res, await academic.addSection(req.schoolId, req.params.id, req.body, req.user, clientInfo(req)));
export const updateSection = async (req, res) =>
  ok(res, await academic.updateSection(req.schoolId, req.params.id, req.body, req.user, clientInfo(req)));
export const setClassSubjects = async (req, res) =>
  ok(res, await academic.setClassSubjects(req.schoolId, req.params.id, req.body.subjects, req.user, clientInfo(req)));
export const classStudents = async (req, res) =>
  ok(res, await academic.listClassStudents(req.schoolId, req.params.id, req.query, req.user));
export const promote = async (req, res) =>
  ok(res, await academic.promoteStudents(req.schoolId, req.body, req.user, clientInfo(req)));

export const listSubjects = async (req, res) => ok(res, await academic.listSubjects(req.schoolId, req.query));
export const createSubject = async (req, res) =>
  created(res, await academic.createSubject(req.schoolId, req.body, req.user, clientInfo(req)));
export const updateSubject = async (req, res) =>
  ok(res, await academic.updateSubject(req.schoolId, req.params.id, req.body, req.user, clientInfo(req)));
