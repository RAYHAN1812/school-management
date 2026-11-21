import { z } from 'zod';
import { timeToMinutes } from '../utils/calculations.js';
import { isoDate, optionalText, requiredText } from './common.js';

// Accept "today" in timezones up to a day ahead of the server's UTC date.
const notFutureDate = isoDate.refine(
  (d) => d.getTime() <= Date.now() + 24 * 60 * 60 * 1000,
  'Attendance cannot be recorded for a future date',
);

const attendanceStatus = z.enum(['PRESENT', 'ABSENT', 'LATE', 'LEAVE'], {
  errorMap: () => ({ message: 'Status must be PRESENT, ABSENT, LATE or LEAVE' }),
});

const attendanceRecord = z.object({
  studentId: requiredText('Student'),
  status: attendanceStatus,
  remarks: optionalText(200),
});

export const recordAttendanceSchema = z.object({
  classId: requiredText('Class'),
  sectionId: requiredText('Section'),
  date: notFutureDate,
  records: z
    .array(attendanceRecord)
    .min(1, 'Mark at least one student')
    .max(300)
    .refine((r) => new Set(r.map((x) => x.studentId)).size === r.length, 'Each student can only appear once'),
});

export const updateAttendanceSchema = z.object({
  status: attendanceStatus,
  remarks: optionalText(200),
});

export const attendanceSheetQuery = z.object({
  classId: requiredText('Class'),
  sectionId: requiredText('Section'),
  date: notFutureDate,
});

export const listAttendanceQuery = z
  .object({
    classId: z.string().trim().optional(),
    sectionId: z.string().trim().optional(),
    studentId: z.string().trim().optional(),
    from: isoDate.optional(),
    to: isoDate.optional(),
  })
  .refine((q) => q.studentId || q.sectionId, { message: 'Provide a studentId or a sectionId', path: ['sectionId'] });

const month = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use the format YYYY-MM');

export const attendanceReportQuery = z
  .object({
    type: z.enum(['daily', 'monthly']).default('daily'),
    classId: requiredText('Class'),
    sectionId: z.string().trim().optional(),
    date: isoDate.optional(),
    month: month.optional(),
    format: z.enum(['json', 'csv']).default('json'),
  })
  .refine((q) => (q.type === 'daily' ? Boolean(q.date) : Boolean(q.month)), {
    message: 'Daily reports need a date; monthly reports need a month',
    path: ['date'],
  })
  .refine((q) => q.type === 'daily' || Boolean(q.sectionId), { message: 'Monthly reports need a section', path: ['sectionId'] });

export const studentAttendanceQuery = z.object({ from: isoDate.optional(), to: isoDate.optional() });

// ── Timetable ─────────────────────────────────────────
const time = z
  .string({ required_error: 'Time is required' })
  .refine((t) => timeToMinutes(t) !== null, 'Use 24-hour HH:MM, e.g. 08:30');

export const DAYS = ['SATURDAY', 'SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];
const day = z.enum(DAYS, { errorMap: () => ({ message: 'Choose a day' }) });

const timetableFields = {
  classId: requiredText('Class'),
  sectionId: requiredText('Section'),
  subjectId: requiredText('Subject'),
  teacherId: requiredText('Teacher'),
  dayOfWeek: day,
  startTime: time,
  endTime: time,
  roomNumber: optionalText(20),
};

const endAfterStart = (d) => !d.startTime || !d.endTime || timeToMinutes(d.endTime) > timeToMinutes(d.startTime);

export const createTimetableSchema = z
  .object(timetableFields)
  .refine(endAfterStart, { path: ['endTime'], message: 'End time must be after the start time' });

export const updateTimetableSchema = z
  .object(timetableFields)
  .partial()
  .refine(endAfterStart, { path: ['endTime'], message: 'End time must be after the start time' });

export const listTimetableQuery = z.object({
  classId: z.string().trim().optional(),
  sectionId: z.string().trim().optional(),
  teacherId: z.string().trim().optional(),
  academicYearId: z.string().trim().optional(),
  dayOfWeek: day.optional(),
});

export const myTimetableQuery = z.object({ studentId: z.string().trim().optional() });
