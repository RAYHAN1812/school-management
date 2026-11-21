import { z } from 'zod';
import { attachmentUrl } from '../services/upload.service.js';
import { isoDate, money, optionalPhone, optionalText, paginationQuery, requiredText } from './common.js';

// ── Homework ──
const dueDateTime = z.coerce.date({ invalid_type_error: 'Enter the deadline' });

export const createAssignmentSchema = z.object({
  classId: requiredText('Class'),
  sectionId: z.string().trim().min(1).nullish(),
  subjectId: requiredText('Subject'),
  teacherId: z.string().trim().min(1).optional(), // admins only
  title: requiredText('Title', 150),
  description: requiredText('Instructions', 5000),
  assignedDate: isoDate.optional(),
  dueDate: dueDateTime,
  attachmentUrl,
  totalMarks: z.coerce.number().positive().max(1000).nullish(),
  allowResubmission: z.boolean().default(false),
});

export const updateAssignmentSchema = z.object({
  title: requiredText('Title', 150).optional(),
  description: requiredText('Instructions', 5000).optional(),
  dueDate: dueDateTime.optional(),
  attachmentUrl,
  totalMarks: z.coerce.number().positive().max(1000).nullish(),
  allowResubmission: z.boolean().optional(),
});

export const listAssignmentsQuery = z.object({
  classId: z.string().trim().optional(),
  subjectId: z.string().trim().optional(),
  studentId: z.string().trim().optional(),
  when: z.enum(['upcoming', 'past', 'all']).default('all'),
});

export const submitSchema = z.object({
  content: optionalText(10000),
  attachmentUrl,
});

export const gradeSchema = z.object({
  marks: z.coerce.number().min(0, 'Marks cannot be negative').max(1000).nullish(),
  feedback: optionalText(2000),
});

// ── Notices ──
const audience = z.enum(['ALL', 'STUDENTS', 'TEACHERS', 'PARENTS', 'CLASS', 'SECTION', 'ADMINS']);

export const createNoticeSchema = z
  .object({
    title: requiredText('Title', 150),
    description: requiredText('Notice text', 10000),
    attachmentUrl,
    publishDate: z.coerce.date().optional(),
    expiryDate: z.coerce.date().nullish(),
    audience: audience.default('ALL'),
    isPublic: z.boolean().optional(),
    classId: z.string().trim().min(1).nullish(),
    sectionId: z.string().trim().min(1).nullish(),
    status: z.enum(['DRAFT', 'PUBLISHED']).default('PUBLISHED'),
  })
  .refine((n) => !n.expiryDate || !n.publishDate || n.expiryDate > n.publishDate, { path: ['expiryDate'], message: 'Expiry must be after publication' });

export const updateNoticeSchema = z.object({
  title: requiredText('Title', 150).optional(),
  description: requiredText('Notice text', 10000).optional(),
  attachmentUrl,
  publishDate: z.coerce.date().optional(),
  expiryDate: z.coerce.date().nullish(),
  audience: audience.optional(),
  isPublic: z.boolean().optional(),
  classId: z.string().trim().min(1).nullish(),
  sectionId: z.string().trim().min(1).nullish(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
});

export const listNoticesQuery = z.object({
  manage: z.enum(['true', 'false']).optional(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
  audience: audience.optional(),
  search: z.string().trim().max(100).optional(),
  ...paginationQuery,
});

// ── Library ──
const isbn = z
  .string()
  .trim()
  .transform((v) => v.replace(/[-\s]/g, ''))
  .refine((v) => v === '' || /^(\d{9}[\dX]|\d{13})$/i.test(v), 'ISBN must have 10 or 13 digits')
  .nullish()
  .transform((v) => (v ? v.toUpperCase() : null));

export const createBookSchema = z.object({
  bookCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{2,20}$/, 'Book ID: 2–20 letters, numbers or dashes')
    .optional()
    .or(z.literal('').transform(() => undefined)),
  isbn,
  title: requiredText('Title', 200),
  author: requiredText('Author', 150),
  category: optionalText(60),
  publisher: optionalText(120),
  totalCopies: z.coerce.number().int().min(1, 'At least 1 copy').max(10000),
});

export const updateBookSchema = createBookSchema.omit({ bookCode: true }).partial();

export const listBooksQuery = z.object({
  search: z.string().trim().max(100).optional(),
  category: z.string().trim().max(60).optional(),
  available: z.enum(['true', 'false']).optional(),
  ...paginationQuery,
});

export const issueBookSchema = z.object({ studentId: requiredText('Student'), dueDate: isoDate.optional() });
export const returnBookSchema = z.object({ studentId: requiredText('Student') });

export const listIssuesQuery = z.object({
  studentId: z.string().trim().optional(),
  bookId: z.string().trim().optional(),
  status: z.enum(['ISSUED', 'RETURNED', 'LOST']).optional(),
  overdue: z.enum(['true', 'false']).optional(),
  ...paginationQuery,
});

// ── Transport ──
export const busSchema = z.object({
  busNumber: z.string().trim().toUpperCase().min(1).max(20),
  registrationNumber: optionalText(40),
  capacity: z.coerce.number().int().min(1).max(200),
  driverId: z.string().trim().min(1).nullish(),
  driverName: optionalText(120),
  driverPhone: optionalPhone,
});
export const updateBusSchema = busSchema.partial();

const stops = z.array(z.string().trim().min(1).max(100)).max(40);
export const routeSchema = z.object({
  routeCode: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{1,15}$/, 'Route ID: letters, numbers or dashes'),
  name: requiredText('Route name', 100),
  pickupPoints: stops.min(1, 'Add at least one pickup point'),
  dropOffPoints: stops.default([]),
  busId: z.string().trim().min(1).nullish(),
  monthlyFee: money,
});
export const updateRouteSchema = routeSchema.partial();

export const assignTransportSchema = z.object({
  studentId: requiredText('Student'),
  pickupPoint: optionalText(100),
  startDate: isoDate.optional(),
});
