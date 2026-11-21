import { z } from 'zod';
import {
  accountInput,
  email,
  isoDate,
  money,
  optionalEmail,
  optionalText,
  paginationQuery,
  phone,
  requiredText,
} from './common.js';

const todayUtc = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
};

const dateOfBirth = isoDate
  .refine((d) => d < latestLocalToday(), 'Date of birth must be in the past')
  .refine((d) => d.getUTCFullYear() >= 1950, 'Enter a realistic date of birth');

// Users ahead of UTC (e.g. Dhaka, UTC+6) can be a calendar day ahead of the
// server, so "today" in their timezone must still be accepted.
const latestLocalToday = () => new Date(todayUtc().getTime() + 24 * 60 * 60 * 1000);
const notFuture = (label) => isoDate.refine((d) => d <= latestLocalToday(), `${label} cannot be in the future`);

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const bloodGroup = z
  .string()
  .trim()
  .nullish()
  .transform((v) => (v === '' ? null : v))
  .refine((v) => v == null || BLOOD_GROUPS.includes(v), 'Choose a valid blood group');

const gender = z.enum(['MALE', 'FEMALE', 'OTHER'], { errorMap: () => ({ message: 'Choose a gender' }) });

const studentCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9-]{3,30}$/, 'Student ID: 3–30 letters, numbers or dashes');

const rollNumber = z.coerce.number().int('Roll must be a whole number').min(1, 'Roll must be at least 1').max(9999);

// ── Guardians ─────────────────────────────────────────
const newGuardian = z.object({
  fullName: requiredText('Guardian name', 120),
  phone,
  email: optionalEmail,
  occupation: optionalText(80),
  address: optionalText(300),
  nationalId: optionalText(30),
});

export const guardianLinkSchema = z
  .object({
    guardianId: z.string().trim().min(1).optional(), // link an existing guardian (e.g. a sibling's parent)
    guardian: newGuardian.optional(),
    relationship: requiredText('Relationship', 40),
    isPrimary: z.boolean().default(false),
    // Creates a PARENT login using the guardian's email.
    account: accountInput.optional(),
  })
  .refine((g) => Boolean(g.guardianId) !== Boolean(g.guardian), {
    message: 'Choose an existing guardian or enter a new one',
    path: ['guardian'],
  })
  .refine((g) => !g.account || g.guardianId || g.guardian?.email, {
    message: 'A guardian needs an email address to get a login account',
    path: ['guardian', 'email'],
  });

// ── Students ──────────────────────────────────────────
const studentProfile = {
  fullName: requiredText('Full name', 120),
  dateOfBirth,
  gender,
  photoUrl: optionalText(500),
  bloodGroup,
  presentAddress: requiredText('Present address', 300),
  permanentAddress: requiredText('Permanent address', 300),
  phone,
  email: optionalEmail,
  admissionDate: notFuture('Admission date'),
  previousSchool: optionalText(150),
};

export const createStudentSchema = z.object({
  // Normally generated; allowed for importing existing records.
  studentCode: studentCode.optional().or(z.literal('').transform(() => undefined)),
  ...studentProfile,
  enrollment: z.object({
    classId: requiredText('Class'),
    sectionId: requiredText('Section'),
    rollNumber: rollNumber.optional(),
  }),
  guardians: z.array(guardianLinkSchema).min(1, 'Add at least one guardian').max(4),
  // Student login; uses the student's email.
  account: accountInput.optional(),
});

export const updateStudentSchema = z.object({
  studentCode: studentCode.optional(),
  fullName: studentProfile.fullName.optional(),
  dateOfBirth: dateOfBirth.optional(),
  gender: gender.optional(),
  photoUrl: studentProfile.photoUrl,
  bloodGroup,
  presentAddress: studentProfile.presentAddress.optional(),
  permanentAddress: studentProfile.permanentAddress.optional(),
  phone: phone.optional(),
  email: optionalEmail,
  admissionDate: notFuture('Admission date').optional(),
  previousSchool: studentProfile.previousSchool,
  status: z.enum(['ACTIVE', 'INACTIVE', 'GRADUATED', 'TRANSFERRED']).optional(),
});

export const enrollmentSchema = z.object({
  classId: requiredText('Class'),
  sectionId: requiredText('Section'),
  rollNumber: rollNumber.optional(),
});

export const listStudentsQuery = z.object({
  search: z.string().trim().max(100).optional(),
  academicYearId: z.string().trim().optional(),
  classId: z.string().trim().optional(),
  sectionId: z.string().trim().optional(),
  gender: gender.optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'GRADUATED', 'TRANSFERRED', 'ALL']).default('ACTIVE'),
  ...paginationQuery,
});

export const listGuardiansQuery = z.object({ search: z.string().trim().max(100).optional() });

// ── Teachers & staff ──────────────────────────────────
const employeeCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9-]{3,20}$/, 'Employee ID: 3–20 letters, numbers or dashes');

const employmentType = z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT']);
const employmentStatus = z.enum(['ACTIVE', 'INACTIVE', 'ON_LEAVE', 'RESIGNED']);

const employeeProfile = {
  fullName: requiredText('Full name', 120),
  designation: requiredText('Designation', 80),
  department: optionalText(80),
  phone,
  address: optionalText(300),
  joiningDate: notFuture('Joining date'),
  employmentType: employmentType.default('FULL_TIME'),
  salary: money.nullish(),
};

export const createTeacherSchema = z.object({
  employeeCode: employeeCode.optional().or(z.literal('').transform(() => undefined)),
  ...employeeProfile,
  email,
  qualification: optionalText(150),
  subjectIds: z.array(z.string().trim().min(1)).max(20).default([]),
  account: accountInput.optional(), // TEACHER login with the teacher's email
});

export const updateTeacherSchema = z.object({
  employeeCode: employeeCode.optional(),
  fullName: employeeProfile.fullName.optional(),
  designation: employeeProfile.designation.optional(),
  department: employeeProfile.department,
  phone: phone.optional(),
  email: email.optional(),
  address: employeeProfile.address,
  qualification: optionalText(150),
  joiningDate: notFuture('Joining date').optional(),
  employmentType: employmentType.optional(),
  status: employmentStatus.optional(),
  salary: money.nullish(),
  subjectIds: z.array(z.string().trim().min(1)).max(20).optional(),
});

export const createStaffSchema = z.object({
  employeeCode: employeeCode.optional().or(z.literal('').transform(() => undefined)),
  ...employeeProfile,
  email: optionalEmail,
});

export const updateStaffSchema = z.object({
  employeeCode: employeeCode.optional(),
  fullName: employeeProfile.fullName.optional(),
  designation: employeeProfile.designation.optional(),
  department: employeeProfile.department,
  phone: phone.optional(),
  email: optionalEmail,
  address: employeeProfile.address,
  joiningDate: notFuture('Joining date').optional(),
  employmentType: employmentType.optional(),
  status: employmentStatus.optional(),
  salary: money.nullish(),
});

export const listEmployeesQuery = z.object({
  search: z.string().trim().max(100).optional(),
  status: employmentStatus.optional(),
  department: z.string().trim().max(80).optional(),
  subjectId: z.string().trim().optional(),
  ...paginationQuery,
});
