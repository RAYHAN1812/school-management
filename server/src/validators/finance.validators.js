import { z } from 'zod';
import { isoDate, money, optionalText, paginationQuery, requiredText } from './common.js';

const positiveMoney = money.refine((v) => v > 0, 'Amount must be more than 0');
const period = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use the format YYYY-MM');
const code = z
  .string({ required_error: 'Code is required' })
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9_-]{2,20}$/, 'Code: 2–20 letters, numbers, dash or underscore');

export const feeTypeSchema = z.object({
  name: requiredText('Name', 60),
  code,
  description: optionalText(200),
});
export const updateFeeTypeSchema = feeTypeSchema.partial();

export const feeStructureSchema = z.object({
  academicYearId: z.string().trim().min(1).optional(), // default: active year
  classId: z.string().trim().min(1).nullish(), // null = every class
  feeTypeId: requiredText('Fee type'),
  amount: positiveMoney,
  frequency: z.enum(['ONE_TIME', 'MONTHLY', 'TERM', 'YEARLY']).default('MONTHLY'),
  dueDay: z.coerce.number().int().min(1).max(28).nullish(),
});
export const updateFeeStructureSchema = z.object({
  amount: positiveMoney.optional(),
  frequency: z.enum(['ONE_TIME', 'MONTHLY', 'TERM', 'YEARLY']).optional(),
  dueDay: z.coerce.number().int().min(1).max(28).nullish(),
});
export const listFeeStructuresQuery = z.object({
  academicYearId: z.string().trim().optional(),
  classId: z.string().trim().optional(),
});

export const createInvoiceSchema = z
  .object({
    studentId: requiredText('Student'),
    feeTypeId: requiredText('Fee type'),
    feeStructureId: z.string().trim().min(1).optional(),
    amount: positiveMoney.optional(), // default: from the fee structure
    discount: money.default(0),
    billingPeriod: period.optional(),
    description: optionalText(200),
    dueDate: isoDate,
  })
  .refine((d) => d.amount !== undefined || d.feeStructureId, { path: ['amount'], message: 'Enter an amount or choose a fee structure' });

export const generateInvoicesSchema = z.object({
  classId: requiredText('Class'),
  sectionId: z.string().trim().min(1).optional(),
  feeStructureIds: z.array(z.string().trim().min(1)).min(1, 'Choose at least one fee').max(20),
  billingPeriod: period.optional(),
  dueDate: isoDate,
});

export const updateInvoiceSchema = z.object({
  discount: money.optional(),
  dueDate: isoDate.optional(),
  description: optionalText(200),
});

export const listInvoicesQuery = z.object({
  studentId: z.string().trim().optional(),
  classId: z.string().trim().optional(),
  status: z.enum(['UNPAID', 'PARTIALLY_PAID', 'PAID', 'CANCELLED', 'OUTSTANDING']).optional(),
  feeTypeId: z.string().trim().optional(),
  billingPeriod: period.optional(),
  overdue: z.enum(['true', 'false']).optional(),
  search: z.string().trim().max(100).optional(),
  ...paginationQuery,
});

const methods = z.enum(['CASH', 'BANK_TRANSFER', 'BKASH', 'NAGAD', 'OTHER'], {
  errorMap: () => ({ message: 'Choose a payment method' }),
});

export const recordPaymentSchema = z
  .object({
    invoiceId: requiredText('Invoice'),
    amount: positiveMoney,
    method: methods,
    transactionRef: z
      .string()
      .trim()
      .max(60)
      .optional()
      .transform((v) => (v ? v.toUpperCase() : undefined)),
    // Date ("2026-11-20") for back-dated payments, or a full timestamp. Not in the future.
    paidAt: z.coerce
      .date({ invalid_type_error: 'Enter a valid date' })
      .refine((d) => d.getTime() <= Date.now() + 60_000, 'Payment date cannot be in the future')
      .optional(),
  })
  .refine((p) => p.method === 'CASH' || Boolean(p.transactionRef), {
    path: ['transactionRef'],
    message: 'Enter the transaction reference for non-cash payments',
  });

export const listPaymentsQuery = z.object({
  studentId: z.string().trim().optional(),
  method: z.enum(['CASH', 'BANK_TRANSFER', 'BKASH', 'NAGAD', 'SSLCOMMERZ', 'OTHER']).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  ...paginationQuery,
});

export const financeReportQuery = z.object({
  month: period.optional(), // default: current month
  format: z.enum(['json', 'csv']).default('json'),
});

export const onlinePaymentSchema = z.object({
  invoiceId: requiredText('Invoice'),
  amount: positiveMoney.optional(), // default: full outstanding amount
});
