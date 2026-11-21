// Phase 5: fees, invoices and payments.
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { env } from '../config/env.js';
import { ADMIN_ROLES, ROLES } from '../config/roles.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { requireSchool } from '../middleware/school.js';
import { validate } from '../middleware/validate.js';
import * as finance from '../services/finance.service.js';
import { asyncHandler as h, clientInfo, created, ok } from '../utils/http.js';
import { idParam } from '../validators/common.js';
import {
  createInvoiceSchema,
  feeStructureSchema,
  feeTypeSchema,
  financeReportQuery,
  generateInvoicesSchema,
  listFeeStructuresQuery,
  listInvoicesQuery,
  listPaymentsQuery,
  onlinePaymentSchema,
  recordPaymentSchema,
  updateFeeStructureSchema,
  updateFeeTypeSchema,
  updateInvoiceSchema,
} from '../validators/finance.validators.js';

const router = Router();
const scoped = [authenticate, requireSchool];
const admins = authorize(...ADMIN_ROLES);
const anyone = authorize(...Object.values(ROLES));
const payers = authorize(...ADMIN_ROLES, ROLES.PARENT, ROLES.STUDENT);
const ctx = clientInfo;

// Fee types & structures
router.get('/fee-types', ...scoped, admins, h(async (req, res) => ok(res, await finance.listFeeTypes(req.schoolId))));
router.post('/fee-types', ...scoped, admins, validate({ body: feeTypeSchema }), h(async (req, res) => created(res, await finance.createFeeType(req.schoolId, req.body, req.user, ctx(req)))));
router.patch('/fee-types/:id', ...scoped, admins, validate({ params: idParam, body: updateFeeTypeSchema }), h(async (req, res) => ok(res, await finance.updateFeeType(req.schoolId, req.params.id, req.body, req.user, ctx(req)))));
router.get('/fees', ...scoped, admins, validate({ query: listFeeStructuresQuery }), h(async (req, res) => ok(res, await finance.listFeeStructures(req.schoolId, req.query))));
router.post('/fees', ...scoped, admins, validate({ body: feeStructureSchema }), h(async (req, res) => created(res, await finance.createFeeStructure(req.schoolId, req.body, req.user, ctx(req)))));
router.patch('/fees/:id', ...scoped, admins, validate({ params: idParam, body: updateFeeStructureSchema }), h(async (req, res) => ok(res, await finance.updateFeeStructure(req.schoolId, req.params.id, req.body, req.user, ctx(req)))));
router.delete('/fees/:id', ...scoped, admins, validate({ params: idParam }), h(async (req, res) => ok(res, await finance.deleteFeeStructure(req.schoolId, req.params.id, req.user, ctx(req)))));

// Invoices
router.get('/invoices', ...scoped, admins, validate({ query: listInvoicesQuery }), h(async (req, res) => {
  const { items, meta } = await finance.listInvoices(req.schoolId, req.query);
  return ok(res, items, { meta });
}));
router.post('/invoices', ...scoped, admins, validate({ body: createInvoiceSchema }), h(async (req, res) => created(res, await finance.createInvoice(req.schoolId, req.body, req.user, ctx(req)))));
router.post('/invoices/generate', ...scoped, admins, validate({ body: generateInvoicesSchema }), h(async (req, res) => ok(res, await finance.generateInvoices(req.schoolId, req.body, req.user, ctx(req)))));
router.get('/invoices/:id', ...scoped, anyone, validate({ params: idParam }), h(async (req, res) => ok(res, await finance.getInvoice(req.schoolId, req.params.id, req.user))));
router.patch('/invoices/:id', ...scoped, admins, validate({ params: idParam, body: updateInvoiceSchema }), h(async (req, res) => ok(res, await finance.updateInvoice(req.schoolId, req.params.id, req.body, req.user, ctx(req)))));
router.post('/invoices/:id/cancel', ...scoped, admins, validate({ params: idParam }), h(async (req, res) => ok(res, await finance.cancelInvoice(req.schoolId, req.params.id, req.user, ctx(req)))));
router.get('/students/:id/fees', ...scoped, anyone, validate({ params: idParam }), h(async (req, res) => ok(res, await finance.studentFees(req.schoolId, req.params.id, req.user))));

// Payments
router.get('/payments', ...scoped, admins, validate({ query: listPaymentsQuery }), h(async (req, res) => {
  const { items, meta } = await finance.listPayments(req.schoolId, req.query);
  return ok(res, items, { meta });
}));
router.post('/payments', ...scoped, admins, validate({ body: recordPaymentSchema }), h(async (req, res) => created(res, await finance.recordPayment(req.schoolId, req.body, req.user, ctx(req)))));
router.get('/payments/reports', ...scoped, admins, validate({ query: financeReportQuery }), h(async (req, res) => {
  const report = await finance.financeReport(req.schoolId, req.query);
  if (req.query.format !== 'csv') return ok(res, report);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="finance-${report.month}.csv"`);
  return res.send(finance.financeReportCsv(report));
}));
router.get('/payments/:id/receipt', ...scoped, anyone, validate({ params: idParam }), h(async (req, res) => ok(res, await finance.getReceipt(req.schoolId, req.params.id, req.user))));

// Online payments (SSLCommerz). Callbacks come from the gateway / payer's browser,
// so they carry no session — they are trusted only after server-side validation.
router.post('/payments/online/init', ...scoped, payers, validate({ body: onlinePaymentSchema }), h(async (req, res) => created(res, await finance.startOnlinePayment(req.schoolId, req.body, req.user))));

const callbackLimiter = rateLimit({ windowMs: 60_000, limit: 60, skip: () => env.isTest });
const callbackBody = z.object({ tran_id: z.string().max(60).optional(), val_id: z.string().max(100).optional() }).passthrough();
router.post('/payments/online/ipn', callbackLimiter, validate({ body: callbackBody }), h(async (req, res) => ok(res, await finance.confirmOnlinePayment(req.body))));
router.post(
  '/payments/online/return/:result',
  callbackLimiter,
  validate({ params: z.object({ result: z.enum(['success', 'fail', 'cancel']) }), body: callbackBody }),
  h(async (req, res) => {
    let status = req.params.result === 'success' ? 'FAILED' : req.params.result.toUpperCase();
    try {
      if (req.body.tran_id) status = (await finance.confirmOnlinePayment(req.params.result === 'success' ? req.body : { tran_id: req.body.tran_id })).status;
    } catch {
      status = 'FAILED';
    }
    res.redirect(303, finance.clientReturnUrl(status));
  }),
);

export default router;
