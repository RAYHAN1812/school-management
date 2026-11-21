import { z } from 'zod';
import { isoDate, requiredText } from './common.js';

const marksValue = z.coerce.number({ invalid_type_error: 'Enter a number' }).min(0, 'Marks cannot be negative').max(1000);
const positiveMarks = z.coerce.number({ invalid_type_error: 'Enter a number' }).positive('Must be more than 0').max(1000);
const optionalMarks = marksValue.nullish();

const examSubject = z
  .object({
    subjectId: requiredText('Subject'),
    examDate: isoDate.nullish(),
    fullMarks: positiveMarks,
    passMarks: marksValue,
    // Maximum marks per component; omit all three to enter one total.
    writtenMarks: optionalMarks,
    mcqMarks: optionalMarks,
    practicalMarks: optionalMarks,
  })
  .refine((s) => s.passMarks <= s.fullMarks, { path: ['passMarks'], message: 'Pass marks cannot exceed full marks' })
  .refine(
    (s) => {
      const parts = [s.writtenMarks, s.mcqMarks, s.practicalMarks].filter((v) => v != null);
      return parts.length === 0 || Math.abs(parts.reduce((a, b) => a + b, 0) - s.fullMarks) < 0.001;
    },
    { path: ['writtenMarks'], message: 'Written + MCQ + practical must add up to the full marks' },
  );

const subjects = z
  .array(examSubject)
  .min(1, 'Add at least one subject')
  .max(30)
  .refine((a) => new Set(a.map((s) => s.subjectId)).size === a.length, 'Each subject can only be added once');

export const createExamSchema = z
  .object({
    classId: requiredText('Class'),
    name: requiredText('Exam name', 60),
    startDate: isoDate.nullish(),
    endDate: isoDate.nullish(),
    subjects,
  })
  .refine((e) => !e.startDate || !e.endDate || e.endDate >= e.startDate, { path: ['endDate'], message: 'End date is before the start date' });

export const updateExamSchema = z.object({
  name: requiredText('Exam name', 60).optional(),
  startDate: isoDate.nullish(),
  endDate: isoDate.nullish(),
  status: z.enum(['DRAFT', 'SCHEDULED', 'ONGOING', 'COMPLETED']).optional(),
  subjects: subjects.optional(),
});

export const listExamsQuery = z.object({
  classId: z.string().trim().optional(),
  academicYearId: z.string().trim().optional(),
  status: z.enum(['DRAFT', 'SCHEDULED', 'ONGOING', 'COMPLETED', 'PUBLISHED']).optional(),
});

export const marksSheetQuery = z.object({
  subjectId: requiredText('Subject'),
  sectionId: z.string().trim().optional(),
});

export const enterMarksSchema = z.object({
  subjectId: requiredText('Subject'),
  marks: z
    .array(
      z.object({
        studentId: requiredText('Student'),
        written: optionalMarks,
        mcq: optionalMarks,
        practical: optionalMarks,
        isAbsent: z.boolean().default(false),
      }),
    )
    .min(1)
    .max(300)
    .refine((a) => new Set(a.map((m) => m.studentId)).size === a.length, 'Each student can only appear once'),
});

export const resultsQuery = z.object({ sectionId: z.string().trim().optional() });

export const gradeScaleSchema = z.object({
  bands: z
    .array(
      z.object({
        grade: requiredText('Grade', 5),
        minPercent: z.coerce.number().min(0).max(100),
        maxPercent: z.coerce.number().min(0).max(100),
        gradePoint: z.coerce.number().min(0).max(10),
      }),
    )
    .min(2)
    .max(15),
});
