import * as attendance from '../services/attendance.service.js';
import * as timetable from '../services/timetable.service.js';
import { clientInfo, created, ok } from '../utils/http.js';

// ── Attendance ──
export const sheet = async (req, res) => ok(res, await attendance.getSheet(req.schoolId, req.query, req.user));
export const record = async (req, res) =>
  created(res, await attendance.recordAttendance(req.schoolId, req.body, req.user, clientInfo(req)));
export const updateDay = async (req, res) =>
  ok(res, await attendance.updateAttendanceDay(req.schoolId, req.body, req.user, clientInfo(req)));
export const updateOne = async (req, res) =>
  ok(res, await attendance.updateAttendanceRecord(req.schoolId, req.params.id, req.body, req.user, clientInfo(req)));
export const list = async (req, res) => ok(res, await attendance.listAttendance(req.schoolId, req.query, req.user));
export const mySections = async (req, res) => ok(res, await attendance.mySections(req.schoolId, req.user));
export const studentSummary = async (req, res) =>
  ok(res, await attendance.studentAttendanceSummary(req.schoolId, req.params.id, req.query, req.user));

export async function report(req, res) {
  const data = await attendance.attendanceReport(req.schoolId, req.query, req.user);
  if (req.query.format !== 'csv') return ok(res, data);
  const label = data.type === 'monthly' ? `${data.class.name}-${data.section.name}-${data.month}` : `${data.class.name}-${data.date}`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="attendance-${label.replace(/[^\w-]+/g, '_')}.csv"`);
  return res.send(attendance.reportToCsv(data));
}

// ── Timetable ──
export const listTimetable = async (req, res) => ok(res, await timetable.listEntries(req.schoolId, req.query, req.user));
export const myTimetable = async (req, res) => ok(res, await timetable.myTimetable(req.schoolId, req.user, req.query));
export const createTimetable = async (req, res) =>
  created(res, await timetable.createEntry(req.schoolId, req.body, req.user, clientInfo(req)));
export const updateTimetable = async (req, res) =>
  ok(res, await timetable.updateEntry(req.schoolId, req.params.id, req.body, req.user, clientInfo(req)));
export const deleteTimetable = async (req, res) =>
  ok(res, await timetable.deleteEntry(req.schoolId, req.params.id, req.user, clientInfo(req)));
