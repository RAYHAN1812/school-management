import { z } from 'zod';
import { isoDate, optionalText, paginationQuery, requiredText } from './common.js';

const yearStatus = z.enum(['UPCOMING', 'ACTIVE', 'COMPLETED']);

export const createAcademicYearSchema = z
  .object({
    name: requiredText('Name', 30),
    startDate: isoDate,
    endDate: isoDate,
    status: yearStatus.default('UPCOMING'),
  })
  .refine((d) => d.endDate > d.startDate, { path: ['endDate'], message: 'End date must be after the start date' });

export const updateAcademicYearSchema = z.object({
  name: requiredText('Name', 30).optional(),
  startDate: isoDate.optional(),
  endDate: isoDate.optional(),
  status: yearStatus.optional(),
});

const sectionName = z
  .string({ required_error: 'Section name is required' })
  .trim()
  .min(1, 'Section name is required')
  .max(10)
  .transform((s) => s.toUpperCase());

const capacity = z.coerce.number().int('Capacity must be a whole number').min(1, 'Capacity must be at least 1').max(2000);

export const createClassSchema = z.object({
  academicYearId: requiredText('Academic year'),
  name: requiredText('Class name', 40),
  numericLevel: z.coerce.number().int().min(-2).max(20).nullish(),
  capacity,
  sections: z
    .array(sectionName)
    .min(1, 'Add at least one section')
    .max(26)
    .refine((a) => new Set(a).size === a.length, 'Section names must be unique'),
  subjectIds: z.array(z.string().trim().min(1)).max(40).default([]),
});

export const updateClassSchema = z.object({
  name: requiredText('Class name', 40).optional(),
  numericLevel: z.coerce.number().int().min(-2).max(20).nullish(),
  capacity: capacity.optional(),
});

export const createSectionSchema = z.object({
  name: sectionName,
  capacity: capacity.nullish(),
  roomNumber: optionalText(20),
  classTeacherId: z.string().trim().min(1).nullish(),
});

export const updateSectionSchema = createSectionSchema.partial();

export const setClassSubjectsSchema = z.object({
  subjects: z
    .array(z.object({ subjectId: z.string().trim().min(1), teacherId: z.string().trim().min(1).nullish() }))
    .max(40)
    .refine((a) => new Set(a.map((s) => s.subjectId)).size === a.length, 'Each subject can only be added once'),
});

export const listClassesQuery = z.object({ academicYearId: z.string().trim().optional() });

export const classStudentsQuery = z.object({ sectionId: z.string().trim().optional() });

export const promoteSchema = z
  .object({
    fromClassId: requiredText('Current class'),
    studentIds: z.array(z.string().trim().min(1)).min(1, 'Select at least one student').max(500),
    graduate: z.boolean().default(false),
    toClassId: z.string().trim().min(1).optional(),
    // If omitted, each student keeps their section letter in the new class.
    toSectionId: z.string().trim().min(1).optional(),
  })
  .refine((d) => d.graduate || d.toClassId, { path: ['toClassId'], message: 'Choose the class to promote into' });

export const createSubjectSchema = z.object({
  name: requiredText('Subject name', 80),
  code: z
    .string({ required_error: 'Subject code is required' })
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{2,15}$/, 'Code: 2–15 letters, numbers or dashes'),
  isOptional: z.boolean().default(false),
  hasPractical: z.boolean().default(false),
});

export const updateSubjectSchema = createSubjectSchema.partial();

export const listSubjectsQuery = z.object({ search: z.string().trim().max(80).optional(), ...paginationQuery });
