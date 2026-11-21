import crypto from 'node:crypto';
import { Prisma } from '@prisma/client';
import { env } from '../config/env.js';
import { prisma } from '../config/prisma.js';
import { AppError } from '../utils/AppError.js';
import { rethrowUnique } from '../utils/accounts.js';
import { audit } from '../utils/audit.js';
import { fromPaisa, invoiceStatus, netAmount, outstanding, toPaisa } from '../utils/calculations.js';
import { getPagination } from '../utils/http.js';
import { nextSequence } from '../utils/sequences.js';
import { resolveAcademicYear } from './academic.service.js';
import { assertCanViewStudentFinance, isAdmin } from './access.service.js';
import * as sslcommerz from './gateways/sslcommerz.js';

const money = (v) => (v == null ? null : Number(v));
const pad = (n, w) => String(n).padStart(w, '0');
const day = (d) => new Date(d).toISOString().slice(0, 10);

const invoiceInclude = {
  student: { select: { id: true, fullName: true, studentCode: true } },
  feeType: { select: { id: true, name: true, code: true } },
  academicYear: { select: { id: true, name: true } },
};

/** Add the computed outstanding amount to an invoice row. */
const withOutstanding = (inv) => ({ ...inv, outstanding: outstanding(inv.netAmount, inv.paidAmount) });

async function nextInvoiceNumber(tx, schoolId) {
  const year = new Date().getUTCFullYear();
  return `INV-${year}-${pad(await nextSequence(tx, schoolId, `INVOICE-${year}`), 5)}`;
}

async function nextReceiptNumber(tx, schoolId) {
  const year = new Date().getUTCFullYear();
  return `RCPT-${year}-${pad(await nextSequence(tx, schoolId, `RECEIPT-${year}`), 5)}`;
}

// ───────────────────────── Fee types & structures ─────────────────────────

export function listFeeTypes(schoolId) {
  return prisma.feeType.findMany({ where: { schoolId }, orderBy: { name: 'asc' } });
}

export async function createFeeType(schoolId, data, actor, ctx) {
  const dup = await prisma.feeType.findUnique({ where: { schoolId_code: { schoolId, code: data.code } } });
  if (dup) throw AppError.conflict('DUPLICATE_FEE_TYPE', `Fee type code ${data.code} is already used`);
  const ft = await prisma.feeType.create({ data: { ...data, schoolId } });
  await audit({ action: 'FEE_TYPE_CREATED', entity: 'FeeType', entityId: ft.id, actor, schoolId, ...ctx });
  return ft;
}

export async function updateFeeType(schoolId, id, data, actor, ctx) {
  const ft = await prisma.feeType.findFirst({ where: { id, schoolId } });
  if (!ft) throw AppError.notFound('FEE_TYPE_NOT_FOUND', 'Fee type not found');
  if (data.code && data.code !== ft.code) {
    const dup = await prisma.feeType.findUnique({ where: { schoolId_code: { schoolId, code: data.code } } });
    if (dup) throw AppError.conflict('DUPLICATE_FEE_TYPE', `Fee type code ${data.code} is already used`);
  }
  const updated = await prisma.feeType.update({ where: { id }, data });
  await audit({ action: 'FEE_TYPE_UPDATED', entity: 'FeeType', entityId: id, actor, schoolId, ...ctx });
  return updated;
}

export async function listFeeStructures(schoolId, query) {
  const year = await resolveAcademicYear(schoolId, query.academicYearId);
  return prisma.feeStructure.findMany({
    where: {
      schoolId,
      academicYearId: year.id,
      ...(query.classId ? { OR: [{ classId: query.classId }, { classId: null }] } : {}),
    },
    orderBy: [{ class: { numericLevel: 'asc' } }, { feeType: { name: 'asc' } }],
    include: {
      feeType: true,
      class: { select: { id: true, name: true } },
      academicYear: { select: { id: true, name: true } },
      _count: { select: { invoices: true } },
    },
  });
}

export async function createFeeStructure(schoolId, data, actor, ctx) {
  const year = await resolveAcademicYear(schoolId, data.academicYearId);
  const ft = await prisma.feeType.findFirst({ where: { id: data.feeTypeId, schoolId } });
  if (!ft) throw AppError.notFound('FEE_TYPE_NOT_FOUND', 'Fee type not found');
  if (data.classId) {
    const klass = await prisma.class.findFirst({ where: { id: data.classId, schoolId, academicYearId: year.id } });
    if (!klass) throw AppError.notFound('CLASS_NOT_FOUND', 'Class not found in that academic year');
  }
  const dup = await prisma.feeStructure.findFirst({ where: { academicYearId: year.id, classId: data.classId ?? null, feeTypeId: ft.id } });
  if (dup) throw AppError.conflict('DUPLICATE_FEE_STRUCTURE', `A ${ft.name} fee is already set for this class and year`);

  const fs = await prisma.feeStructure.create({
    data: {
      schoolId,
      academicYearId: year.id,
      classId: data.classId ?? null,
      feeTypeId: ft.id,
      amount: data.amount,
      frequency: data.frequency,
      dueDay: data.dueDay ?? null,
    },
  });
  await audit({ action: 'FEE_STRUCTURE_CREATED', entity: 'FeeStructure', entityId: fs.id, actor, schoolId, metadata: { amount: data.amount }, ...ctx });
  return fs;
}

export async function updateFeeStructure(schoolId, id, data, actor, ctx) {
  const fs = await prisma.feeStructure.findFirst({ where: { id, schoolId } });
  if (!fs) throw AppError.notFound('FEE_STRUCTURE_NOT_FOUND', 'Fee structure not found');
  // Existing invoices keep their amounts; only new invoices use the new fee.
  const updated = await prisma.feeStructure.update({ where: { id }, data });
  await audit({ action: 'FEE_STRUCTURE_UPDATED', entity: 'FeeStructure', entityId: id, actor, schoolId, metadata: { from: money(fs.amount), to: data.amount }, ...ctx });
  return updated;
}

export async function deleteFeeStructure(schoolId, id, actor, ctx) {
  const fs = await prisma.feeStructure.findFirst({ where: { id, schoolId }, include: { _count: { select: { invoices: true } } } });
  if (!fs) throw AppError.notFound('FEE_STRUCTURE_NOT_FOUND', 'Fee structure not found');
  if (fs._count.invoices) throw AppError.conflict('FEE_STRUCTURE_IN_USE', 'Invoices were already generated from this fee; edit it instead');
  await prisma.feeStructure.delete({ where: { id } });
  await audit({ action: 'FEE_STRUCTURE_DELETED', entity: 'FeeStructure', entityId: id, actor, schoolId, ...ctx });
  return { deleted: true };
}

// ───────────────────────── Invoices ─────────────────────────

function assertDiscount(amount, discount) {
  if (toPaisa(discount) > toPaisa(amount)) throw AppError.badRequest('INVALID_DISCOUNT', 'Discount cannot exceed the invoice amount');
}

async function assertNotAlreadyBilled(tx, { studentId, feeTypeId, billingPeriod, academicYearId }) {
  // One live invoice per student, fee type and period (or per year for one-off fees).
  const existing = await tx.invoice.findFirst({
    where: { studentId, feeTypeId, academicYearId, billingPeriod: billingPeriod ?? null, status: { not: 'CANCELLED' } },
  });
  if (existing) {
    throw AppError.conflict('DUPLICATE_INVOICE', `Already invoiced (${existing.invoiceNumber})${billingPeriod ? ` for ${billingPeriod}` : ''}`);
  }
}

export async function createInvoice(schoolId, data, actor, ctx) {
  const student = await prisma.student.findFirst({ where: { id: data.studentId, schoolId, deletedAt: null } });
  if (!student) throw AppError.notFound('STUDENT_NOT_FOUND', 'Student not found');
  const ft = await prisma.feeType.findFirst({ where: { id: data.feeTypeId, schoolId } });
  if (!ft) throw AppError.notFound('FEE_TYPE_NOT_FOUND', 'Fee type not found');
  let structure = null;
  if (data.feeStructureId) {
    structure = await prisma.feeStructure.findFirst({ where: { id: data.feeStructureId, schoolId, feeTypeId: ft.id } });
    if (!structure) throw AppError.notFound('FEE_STRUCTURE_NOT_FOUND', 'Fee structure not found for that fee type');
  }
  const year = structure ? { id: structure.academicYearId } : await resolveAcademicYear(schoolId);
  const amount = data.amount ?? money(structure.amount);
  assertDiscount(amount, data.discount);

  const invoice = await prisma.$transaction(async (tx) => {
    await assertNotAlreadyBilled(tx, { studentId: student.id, feeTypeId: ft.id, billingPeriod: data.billingPeriod, academicYearId: year.id });
    const net = netAmount(amount, data.discount);
    return tx.invoice.create({
      data: {
        schoolId,
        invoiceNumber: await nextInvoiceNumber(tx, schoolId),
        studentId: student.id,
        academicYearId: year.id,
        feeTypeId: ft.id,
        feeStructureId: structure?.id ?? null,
        billingPeriod: data.billingPeriod ?? null,
        description: data.description ?? null,
        amount,
        discount: data.discount,
        netAmount: net,
        dueDate: data.dueDate,
        status: invoiceStatus(net, 0),
        discountApprovedById: data.discount > 0 ? actor.id : null,
        createdById: actor.id,
      },
      include: invoiceInclude,
    });
  });
  await audit({
    action: 'INVOICE_CREATED',
    entity: 'Invoice',
    entityId: invoice.id,
    actor,
    schoolId,
    metadata: { invoiceNumber: invoice.invoiceNumber, amount, discount: data.discount },
    ...ctx,
  });
  return withOutstanding(invoice);
}

/** Bill every active student in a class (or section) for the chosen fees. Re-running skips existing invoices. */
export async function generateInvoices(schoolId, data, actor, ctx) {
  const klass = await prisma.class.findFirst({ where: { id: data.classId, schoolId } });
  if (!klass) throw AppError.notFound('CLASS_NOT_FOUND', 'Class not found');
  const structures = await prisma.feeStructure.findMany({
    where: { id: { in: data.feeStructureIds }, schoolId, academicYearId: klass.academicYearId, OR: [{ classId: klass.id }, { classId: null }] },
    include: { feeType: true },
  });
  if (structures.length !== new Set(data.feeStructureIds).size) {
    throw AppError.badRequest('INVALID_FEE_STRUCTURE', 'Some fees do not apply to this class and year');
  }
  if (structures.some((s) => s.frequency === 'MONTHLY') && !data.billingPeriod) {
    throw AppError.badRequest('BILLING_PERIOD_REQUIRED', 'Choose the month for monthly fees', [{ field: 'billingPeriod', message: 'Choose the month' }]);
  }

  const enrollments = await prisma.enrollment.findMany({
    where: { classId: klass.id, status: 'ACTIVE', ...(data.sectionId ? { sectionId: data.sectionId } : {}), student: { status: 'ACTIVE', deletedAt: null } },
    select: { studentId: true },
  });

  let created = 0;
  let skipped = 0;
  for (const s of structures) {
    // Monthly fees are per month; other frequencies once per year.
    const billingPeriod = s.frequency === 'MONTHLY' ? data.billingPeriod : null;
    for (const { studentId } of enrollments) {
      try {
        await prisma.$transaction(async (tx) => {
          await assertNotAlreadyBilled(tx, { studentId, feeTypeId: s.feeTypeId, billingPeriod, academicYearId: klass.academicYearId });
          const amount = money(s.amount);
          await tx.invoice.create({
            data: {
              schoolId,
              invoiceNumber: await nextInvoiceNumber(tx, schoolId),
              studentId,
              academicYearId: klass.academicYearId,
              feeTypeId: s.feeTypeId,
              feeStructureId: s.id,
              billingPeriod,
              description: `${s.feeType.name}${billingPeriod ? ` — ${billingPeriod}` : ''}`,
              amount,
              discount: 0,
              netAmount: amount,
              dueDate: data.dueDate,
              status: 'UNPAID',
              createdById: actor.id,
            },
          });
        });
        created += 1;
      } catch (err) {
        if (err instanceof AppError && err.code === 'DUPLICATE_INVOICE') skipped += 1;
        else throw err;
      }
    }
  }
  await audit({ action: 'INVOICES_GENERATED', entity: 'Class', entityId: klass.id, actor, schoolId, metadata: { created, skipped, billingPeriod: data.billingPeriod }, ...ctx });
  return { created, skipped, students: enrollments.length };
}

export async function listInvoices(schoolId, query) {
  const { skip, take, meta } = getPagination(query);
  const today = new Date(new Date().toISOString().slice(0, 10));
  const where = {
    schoolId,
    ...(query.studentId ? { studentId: query.studentId } : {}),
    ...(query.feeTypeId ? { feeTypeId: query.feeTypeId } : {}),
    ...(query.billingPeriod ? { billingPeriod: query.billingPeriod } : {}),
    ...(query.status === 'OUTSTANDING' ? { status: { in: ['UNPAID', 'PARTIALLY_PAID'] } } : query.status ? { status: query.status } : {}),
    ...(query.overdue === 'true' ? { dueDate: { lt: today }, status: { in: ['UNPAID', 'PARTIALLY_PAID'] } } : {}),
    ...(query.classId ? { student: { enrollments: { some: { classId: query.classId } } } } : {}),
    ...(query.search
      ? {
          OR: [
            { invoiceNumber: { contains: query.search, mode: 'insensitive' } },
            { student: { fullName: { contains: query.search, mode: 'insensitive' } } },
            { student: { studentCode: { contains: query.search, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };
  const [items, total, sums] = await Promise.all([
    prisma.invoice.findMany({ where, orderBy: [{ dueDate: 'desc' }, { invoiceNumber: 'desc' }], skip, take, include: invoiceInclude }),
    prisma.invoice.count({ where }),
    // Totals follow the same filters; without a status filter, cancelled invoices are excluded.
    prisma.invoice.aggregate({ where: where.status ? where : { ...where, status: { not: 'CANCELLED' } }, _sum: { netAmount: true, paidAmount: true } }),
  ]);
  const billed = money(sums._sum.netAmount) ?? 0;
  const paid = money(sums._sum.paidAmount) ?? 0;
  return { items: items.map(withOutstanding), meta: { ...meta(total), totals: { billed, paid, outstanding: outstanding(billed, paid) } } };
}

export async function getInvoice(schoolId, id, actor) {
  const invoice = await prisma.invoice.findFirst({
    where: { id, schoolId },
    include: {
      ...invoiceInclude,
      payments: { orderBy: { createdAt: 'desc' }, include: { receivedBy: { select: { fullName: true } } } },
      createdBy: { select: { fullName: true } },
      discountApprovedBy: { select: { fullName: true } },
    },
  });
  if (!invoice) throw AppError.notFound('INVOICE_NOT_FOUND', 'Invoice not found');
  if (!isAdmin(actor)) await assertCanViewStudentFinance(actor, schoolId, invoice.studentId);
  return withOutstanding(invoice);
}

export async function updateInvoice(schoolId, id, data, actor, ctx) {
  const invoice = await prisma.invoice.findFirst({ where: { id, schoolId } });
  if (!invoice) throw AppError.notFound('INVOICE_NOT_FOUND', 'Invoice not found');
  if (invoice.status === 'CANCELLED') throw AppError.conflict('INVOICE_CANCELLED', 'This invoice is cancelled');

  const patch = { ...(data.dueDate ? { dueDate: data.dueDate } : {}), ...(data.description !== undefined ? { description: data.description } : {}) };
  if (data.discount !== undefined) {
    assertDiscount(invoice.amount, data.discount);
    const net = netAmount(invoice.amount, data.discount);
    if (toPaisa(invoice.paidAmount) > toPaisa(net)) {
      throw AppError.badRequest('INVALID_DISCOUNT', 'That discount would leave the invoice overpaid');
    }
    Object.assign(patch, {
      discount: data.discount,
      netAmount: net,
      status: invoiceStatus(net, invoice.paidAmount),
      discountApprovedById: data.discount > 0 ? actor.id : null,
    });
  }
  const updated = await prisma.invoice.update({ where: { id }, data: patch });
  await audit({
    action: data.discount !== undefined ? 'INVOICE_DISCOUNT_APPLIED' : 'INVOICE_UPDATED',
    entity: 'Invoice',
    entityId: id,
    actor,
    schoolId,
    metadata: { discountFrom: money(invoice.discount), discountTo: data.discount },
    ...ctx,
  });
  return getInvoice(schoolId, updated.id, actor);
}

export async function cancelInvoice(schoolId, id, actor, ctx) {
  const invoice = await prisma.invoice.findFirst({ where: { id, schoolId } });
  if (!invoice) throw AppError.notFound('INVOICE_NOT_FOUND', 'Invoice not found');
  if (toPaisa(invoice.paidAmount) > 0) throw AppError.conflict('INVOICE_HAS_PAYMENTS', 'Invoices with payments cannot be cancelled');
  if (invoice.status === 'CANCELLED') return getInvoice(schoolId, id, actor);
  await prisma.invoice.update({ where: { id }, data: { status: 'CANCELLED' } });
  await audit({ action: 'INVOICE_CANCELLED', entity: 'Invoice', entityId: id, actor, schoolId, ...ctx });
  return getInvoice(schoolId, id, actor);
}

/** A student's fees for the student/parent portal. */
export async function studentFees(schoolId, studentId, actor) {
  await assertCanViewStudentFinance(actor, schoolId, studentId);
  const [invoices, payments] = await Promise.all([
    prisma.invoice.findMany({ where: { schoolId, studentId, status: { not: 'CANCELLED' } }, orderBy: { dueDate: 'desc' }, include: invoiceInclude }),
    prisma.payment.findMany({
      where: { schoolId, studentId, status: 'SUCCESS' },
      orderBy: { paidAt: 'desc' },
      include: { invoice: { select: { invoiceNumber: true, feeType: { select: { name: true } }, billingPeriod: true } } },
    }),
  ]);
  const billed = invoices.reduce((a, i) => a + toPaisa(i.netAmount), 0);
  const paid = invoices.reduce((a, i) => a + toPaisa(i.paidAmount), 0);
  return {
    summary: { billed: fromPaisa(billed), paid: fromPaisa(paid), outstanding: fromPaisa(Math.max(0, billed - paid)) },
    invoices: invoices.map(withOutstanding),
    payments,
    onlinePaymentsEnabled: sslcommerz.isConfigured(),
  };
}

// ───────────────────────── Payments ─────────────────────────

/**
 * Lock the invoice row for the rest of the transaction so two simultaneous
 * payments can't both see the same outstanding balance.
 */
async function lockInvoice(tx, schoolId, invoiceId) {
  const rows = await tx.$queryRaw(Prisma.sql`SELECT id FROM invoices WHERE id = ${invoiceId} AND "schoolId" = ${schoolId} FOR UPDATE`);
  if (!rows.length) throw AppError.notFound('INVOICE_NOT_FOUND', 'Invoice not found');
  return tx.invoice.findUnique({ where: { id: invoiceId } });
}

function assertPayable(invoice, amount) {
  if (invoice.status === 'CANCELLED') throw AppError.conflict('INVOICE_CANCELLED', 'This invoice is cancelled');
  const due = outstanding(invoice.netAmount, invoice.paidAmount);
  if (due <= 0) throw AppError.badRequest('OVERPAYMENT_NOT_ALLOWED', 'This invoice is already fully paid');
  if (toPaisa(amount) > toPaisa(due)) {
    throw AppError.badRequest('OVERPAYMENT_NOT_ALLOWED', `Payment of ৳${amount} exceeds the outstanding balance of ৳${due}`);
  }
}

async function creditInvoice(tx, invoice, amount) {
  const paid = fromPaisa(toPaisa(invoice.paidAmount) + toPaisa(amount));
  return tx.invoice.update({ where: { id: invoice.id }, data: { paidAmount: paid, status: invoiceStatus(invoice.netAmount, paid) } });
}

const duplicateTransaction = () => AppError.conflict('DUPLICATE_TRANSACTION', 'A payment with this transaction reference already exists');

/** Record a payment received at the office (cash, bank transfer, bKash, Nagad…). Atomic and traceable. */
export async function recordPayment(schoolId, data, actor, ctx) {
  if (data.transactionRef) {
    const dup = await prisma.payment.findUnique({ where: { schoolId_transactionRef: { schoolId, transactionRef: data.transactionRef } } });
    if (dup) throw duplicateTransaction();
  }
  try {
    const payment = await prisma.$transaction(async (tx) => {
      const invoice = await lockInvoice(tx, schoolId, data.invoiceId);
      assertPayable(invoice, data.amount);
      const p = await tx.payment.create({
        data: {
          schoolId,
          invoiceId: invoice.id,
          studentId: invoice.studentId,
          amount: data.amount,
          method: data.method,
          transactionRef: data.transactionRef ?? null,
          receiptNumber: await nextReceiptNumber(tx, schoolId),
          status: 'SUCCESS',
          paidAt: data.paidAt ?? new Date(),
          receivedById: actor.id,
        },
      });
      await creditInvoice(tx, invoice, data.amount);
      return p;
    });
    await audit({
      action: 'PAYMENT_RECORDED',
      entity: 'Payment',
      entityId: payment.id,
      actor,
      schoolId,
      metadata: { invoiceId: data.invoiceId, amount: data.amount, method: data.method, receipt: payment.receiptNumber },
      ...ctx,
    });
    return getReceipt(schoolId, payment.id, actor);
  } catch (err) {
    return rethrowUnique(err, { transactionRef: duplicateTransaction() });
  }
}

export async function listPayments(schoolId, query) {
  const { skip, take, meta } = getPagination(query);
  const where = {
    schoolId,
    status: 'SUCCESS',
    ...(query.studentId ? { studentId: query.studentId } : {}),
    ...(query.method ? { method: query.method } : {}),
    ...(query.from || query.to
      ? { paidAt: { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lt: new Date(query.to.getTime() + 86400000) } : {}) } }
      : {}),
  };
  const [items, total, sum] = await Promise.all([
    prisma.payment.findMany({
      where,
      orderBy: { paidAt: 'desc' },
      skip,
      take,
      include: {
        student: { select: { id: true, fullName: true, studentCode: true } },
        invoice: { select: { id: true, invoiceNumber: true, billingPeriod: true, feeType: { select: { name: true } } } },
        receivedBy: { select: { fullName: true } },
      },
    }),
    prisma.payment.count({ where }),
    prisma.payment.aggregate({ where, _sum: { amount: true } }),
  ]);
  return { items, meta: { ...meta(total), totalAmount: money(sum._sum.amount) ?? 0 } };
}

export async function getReceipt(schoolId, paymentId, actor) {
  const payment = await prisma.payment.findFirst({
    where: { id: paymentId, schoolId },
    include: {
      invoice: { include: { feeType: true, academicYear: { select: { name: true } } } },
      student: {
        select: {
          id: true,
          fullName: true,
          studentCode: true,
          enrollments: { where: { status: 'ACTIVE' }, include: { class: { select: { name: true } }, section: { select: { name: true } } }, take: 1 },
        },
      },
      receivedBy: { select: { fullName: true } },
    },
  });
  if (!payment) throw AppError.notFound('PAYMENT_NOT_FOUND', 'Payment not found');
  if (!isAdmin(actor)) await assertCanViewStudentFinance(actor, schoolId, payment.studentId);
  const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { name: true, address: true, phone: true } });
  return { ...payment, school, invoice: withOutstanding(payment.invoice) };
}

/** Monthly collection and dues summary. */
export async function financeReport(schoolId, { month }) {
  const m = month ?? new Date().toISOString().slice(0, 7);
  const [y, mo] = m.split('-').map(Number);
  const from = new Date(Date.UTC(y, mo - 1, 1));
  const to = new Date(Date.UTC(y, mo, 1));

  const [payments, byStatus, dues] = await Promise.all([
    prisma.payment.findMany({
      where: { schoolId, status: 'SUCCESS', paidAt: { gte: from, lt: to } },
      include: { invoice: { select: { feeType: { select: { name: true } } } } },
    }),
    prisma.invoice.groupBy({ by: ['status'], where: { schoolId }, _count: { _all: true }, _sum: { netAmount: true, paidAmount: true } }),
    prisma.invoice.aggregate({
      where: { schoolId, status: { in: ['UNPAID', 'PARTIALLY_PAID'] } },
      _sum: { netAmount: true, paidAmount: true },
      _count: { _all: true },
    }),
  ]);

  const sumBy = (keyFn) => {
    const map = new Map();
    for (const p of payments) map.set(keyFn(p), (map.get(keyFn(p)) ?? 0) + toPaisa(p.amount));
    return [...map.entries()].map(([key, paisa]) => ({ key, amount: fromPaisa(paisa) })).sort((a, b) => b.amount - a.amount);
  };
  const collected = fromPaisa(payments.reduce((a, p) => a + toPaisa(p.amount), 0));
  const daily = sumBy((p) => day(p.paidAt)).sort((a, b) => a.key.localeCompare(b.key));

  return {
    month: m,
    collected,
    paymentCount: payments.length,
    byMethod: sumBy((p) => p.method),
    byFeeType: sumBy((p) => p.invoice.feeType.name),
    daily,
    outstanding: {
      invoices: dues._count._all,
      amount: outstanding(money(dues._sum.netAmount) ?? 0, money(dues._sum.paidAmount) ?? 0),
    },
    invoicesByStatus: byStatus.map((s) => ({ status: s.status, count: s._count._all, billed: money(s._sum.netAmount) ?? 0, paid: money(s._sum.paidAmount) ?? 0 })),
  };
}

export function financeReportCsv(r) {
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [
    [`Finance report ${r.month}`],
    ['Collected', r.collected],
    ['Payments', r.paymentCount],
    ['Outstanding (all time)', r.outstanding.amount],
    [],
    ['By method', 'Amount'],
    ...r.byMethod.map((x) => [x.key, x.amount]),
    [],
    ['By fee type', 'Amount'],
    ...r.byFeeType.map((x) => [x.key, x.amount]),
    [],
    ['Date', 'Collected'],
    ...r.daily.map((x) => [x.key, x.amount]),
  ];
  return `﻿${rows.map((row) => row.map(cell).join(',')).join('\r\n')}\r\n`;
}

// ───────────────────────── Online payments (SSLCommerz) ─────────────────────────

/** Start an online payment. The invoice is only credited after server-side validation. */
export async function startOnlinePayment(schoolId, data, actor) {
  if (!sslcommerz.isConfigured()) {
    throw new AppError(503, 'PAYMENT_GATEWAY_NOT_CONFIGURED', 'Online payment is not available yet. Please pay at the school office.');
  }
  const invoice = await prisma.invoice.findFirst({ where: { id: data.invoiceId, schoolId }, include: { student: true, feeType: true } });
  if (!invoice) throw AppError.notFound('INVOICE_NOT_FOUND', 'Invoice not found');
  if (!isAdmin(actor)) await assertCanViewStudentFinance(actor, schoolId, invoice.studentId);
  const amount = data.amount ?? outstanding(invoice.netAmount, invoice.paidAmount);
  assertPayable(invoice, amount);

  const tranId = `SMS${Date.now()}${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  const payment = await prisma.$transaction(async (tx) =>
    tx.payment.create({
      data: {
        schoolId,
        invoiceId: invoice.id,
        studentId: invoice.studentId,
        amount,
        method: 'SSLCOMMERZ',
        transactionRef: tranId,
        receiptNumber: await nextReceiptNumber(tx, schoolId),
        status: 'PENDING',
      },
    }),
  );
  const { gatewayUrl } = await sslcommerz.initSession({
    tranId,
    amount,
    customer: { name: actor.fullName, email: actor.email, phone: actor.phone },
    productName: `${invoice.feeType.name} — ${invoice.invoiceNumber}`,
  });
  return { paymentId: payment.id, gatewayUrl };
}

/**
 * Handle an SSLCommerz callback (IPN or browser return). Idempotent.
 * Only a VALID response from the validation API, matching our pending
 * payment's amount and currency, credits the invoice.
 */
export async function confirmOnlinePayment({ val_id: valId, tran_id: tranId }) {
  if (!tranId) throw AppError.badRequest('INVALID_CALLBACK', 'Missing transaction id');
  const payment = await prisma.payment.findFirst({ where: { transactionRef: tranId, method: 'SSLCOMMERZ' } });
  if (!payment) throw AppError.notFound('PAYMENT_NOT_FOUND', 'Unknown transaction');
  if (payment.status !== 'PENDING') return { status: payment.status, paymentId: payment.id };
  if (!valId) {
    await prisma.payment.update({ where: { id: payment.id }, data: { status: 'FAILED' } });
    return { status: 'FAILED', paymentId: payment.id };
  }

  const check = await sslcommerz.validateTransaction(valId);
  const matches = check.valid && check.tranId === tranId && check.currency === 'BDT' && toPaisa(check.amount) === toPaisa(payment.amount);
  if (!matches) {
    await prisma.payment.update({ where: { id: payment.id }, data: { status: 'FAILED', gatewayResponse: check.raw } });
    return { status: 'FAILED', paymentId: payment.id };
  }

  const result = await prisma.$transaction(async (tx) => {
    const fresh = await tx.payment.findUnique({ where: { id: payment.id } });
    if (fresh.status !== 'PENDING') return fresh.status; // another callback got here first
    const invoice = await lockInvoice(tx, payment.schoolId, payment.invoiceId);
    try {
      assertPayable(invoice, money(payment.amount));
    } catch {
      // Paid at the office meanwhile — keep the record for a manual refund.
      await tx.payment.update({ where: { id: payment.id }, data: { status: 'FAILED', gatewayResponse: { ...check.raw, note: 'Invoice no longer payable; refund required' } } });
      return 'FAILED';
    }
    await tx.payment.update({ where: { id: payment.id }, data: { status: 'SUCCESS', paidAt: new Date(), gatewayResponse: check.raw } });
    await creditInvoice(tx, invoice, money(payment.amount));
    return 'SUCCESS';
  });
  await audit({ action: `ONLINE_PAYMENT_${result}`, entity: 'Payment', entityId: payment.id, schoolId: payment.schoolId, metadata: { tranId } });
  return { status: result, paymentId: payment.id };
}

export const clientReturnUrl = (status) => `${env.clientOrigins[0]}/payments/result?status=${encodeURIComponent(status)}`;
