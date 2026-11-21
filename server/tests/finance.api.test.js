import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// The real gateway talks to SSLCommerz; here we control what it "says".
vi.mock('../src/services/gateways/sslcommerz.js', () => ({
  isConfigured: () => true,
  initSession: vi.fn(async () => ({ gatewayUrl: 'https://sandbox.sslcommerz.test/pay/abc' })),
  validateTransaction: vi.fn(),
}));

const sslcommerz = await import('../src/services/gateways/sslcommerz.js');
const { prisma } = await import('../src/config/prisma.js');
const { api, bearer, tokenFor } = await import('./helpers.js');
const { invoiceStatus, netAmount, outstanding } = await import('../src/utils/calculations.js');

let admin;
let types;
let studentId;

beforeAll(async () => {
  admin = bearer(await tokenFor('SCHOOL_ADMIN'));
  types = Object.fromEntries((await api().get('/api/fee-types').set(admin)).body.data.map((t) => [t.code, t]));
  studentId = (await api().get('/api/students?search=Tasnim').set(admin)).body.data[0].id;
});

afterAll(() => prisma.$disconnect());

// Each test invoice gets its own billing month so the duplicate-invoice rule doesn't trip.
let periodCounter = 0;
function uniquePeriod() {
  periodCounter += 1;
  return `${2030 + Math.floor(periodCounter / 12)}-${String((periodCounter % 12) + 1).padStart(2, '0')}`;
}

async function newInvoice(amount = 1000, overrides = {}) {
  const res = await api()
    .post('/api/invoices')
    .set(admin)
    .send({ studentId, feeTypeId: types.LAB.id, amount, dueDate: '2026-12-10', billingPeriod: uniquePeriod(), ...overrides });
  if (res.status !== 201) throw new Error(JSON.stringify(res.body));
  return res.body.data;
}

describe('fee calculations', () => {
  it('outstanding = total fee − total paid', () => {
    expect(outstanding(2500, 1000)).toBe(1500);
    expect(outstanding(0.3, 0.1)).toBe(0.2); // no floating-point drift
    expect(outstanding(100, 150)).toBe(0);
  });
  it('net = amount − discount', () => {
    expect(netAmount(2500, 500)).toBe(2000);
  });
  it('status: Paid / Partially Paid / Unpaid', () => {
    expect(invoiceStatus(2500, 2500)).toBe('PAID');
    expect(invoiceStatus(2500, 1)).toBe('PARTIALLY_PAID');
    expect(invoiceStatus(2500, 0)).toBe('UNPAID');
  });
});

describe('fee structures', () => {
  it('creates a class fee and rejects a duplicate', async () => {
    const { classes } = (await api().get('/api/classes').set(admin)).body.data;
    const class7 = classes.find((c) => c.name === 'Class 7');
    const body = { classId: class7.id, feeTypeId: types.TRANSPORT.id, amount: 1200, frequency: 'MONTHLY' };
    const res = await api().post('/api/fees').set(admin).send(body);
    expect(res.status).toBe(201);
    const dup = await api().post('/api/fees').set(admin).send(body);
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('DUPLICATE_FEE_STRUCTURE');
  });

  it('is admin-only', async () => {
    expect((await api().get('/api/fees').set(bearer(await tokenFor('TEACHER')))).status).toBe(403);
  });
});

describe('invoices', () => {
  it('generates an invoice with a sequential number, and applies an authorised discount', async () => {
    const inv = await newInvoice(2000, { discount: 500 });
    expect(inv.invoiceNumber).toMatch(/^INV-\d{4}-\d{5}$/);
    expect(Number(inv.netAmount)).toBe(1500);
    expect(inv.status).toBe('UNPAID');
    expect(inv.outstanding).toBe(1500);
  });

  it('rejects a discount above the amount and a duplicate bill for the same period', async () => {
    const bad = await api().post('/api/invoices').set(admin).send({ studentId, feeTypeId: types.LAB.id, amount: 100, discount: 200, dueDate: '2026-12-10' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('INVALID_DISCOUNT');

    const body = { studentId, feeTypeId: types.TUITION.id, amount: 2500, billingPeriod: '2026-12', dueDate: '2026-12-10' };
    expect((await api().post('/api/invoices').set(admin).send(body)).status).toBe(201);
    const dup = await api().post('/api/invoices').set(admin).send(body);
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('DUPLICATE_INVOICE');
  });

  it('totals respect the status filter', async () => {
    const all = (await api().get('/api/invoices').set(admin)).body.meta.totals;
    const open = (await api().get('/api/invoices?status=OUTSTANDING').set(admin)).body.meta.totals;
    const paid = (await api().get('/api/invoices?status=PAID').set(admin)).body.meta.totals;
    expect(open.billed).toBeLessThan(all.billed);
    expect(paid.outstanding).toBe(0);
    expect(open.outstanding).toBe(all.outstanding);
  });

  it('bulk-generates monthly invoices for a class and skips students already billed', async () => {
    const { classes } = (await api().get('/api/classes').set(admin)).body.data;
    const class6 = classes.find((c) => c.name === 'Class 6');
    const tuition = (await api().get(`/api/fees?classId=${class6.id}`).set(admin)).body.data.find((f) => f.feeType.code === 'TUITION');
    const body = { classId: class6.id, feeStructureIds: [tuition.id], billingPeriod: '2027-01', dueDate: '2027-01-10' };
    const first = await api().post('/api/invoices/generate').set(admin).send(body);
    expect(first.status).toBe(200);
    expect(first.body.data.created).toBe(first.body.data.students);
    const again = await api().post('/api/invoices/generate').set(admin).send(body);
    expect(again.body.data.created).toBe(0);
    expect(again.body.data.skipped).toBe(first.body.data.students);

    const missingMonth = await api().post('/api/invoices/generate').set(admin).send({ ...body, billingPeriod: undefined });
    expect(missingMonth.status).toBe(400);
    expect(missingMonth.body.error.code).toBe('BILLING_PERIOD_REQUIRED');
  });
});

describe('payments (spec expected results)', () => {
  it('no payment → Unpaid; partial → Partially Paid; full → Paid', async () => {
    const inv = await newInvoice(3000);
    expect(inv.status).toBe('UNPAID');

    const part = await api().post('/api/payments').set(admin).send({ invoiceId: inv.id, amount: 1000, method: 'CASH' });
    expect(part.status).toBe(201);
    expect(part.body.data.receiptNumber).toMatch(/^RCPT-\d{4}-\d{5}$/);
    expect(part.body.data.invoice.status).toBe('PARTIALLY_PAID');
    expect(part.body.data.invoice.outstanding).toBe(2000);

    const rest = await api().post('/api/payments').set(admin).send({ invoiceId: inv.id, amount: 2000, method: 'BKASH', transactionRef: 'bk-full-001' });
    expect(rest.body.data.invoice.status).toBe('PAID');
    expect(rest.body.data.invoice.outstanding).toBe(0);
  });

  it('payment exceeding the balance → 400 OVERPAYMENT_NOT_ALLOWED', async () => {
    const inv = await newInvoice(500);
    const res = await api().post('/api/payments').set(admin).send({ invoiceId: inv.id, amount: 500.01, method: 'CASH' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('OVERPAYMENT_NOT_ALLOWED');
  });

  it('duplicate transaction reference → 409 DUPLICATE_TRANSACTION (case-insensitive)', async () => {
    const a = await newInvoice(400);
    const b = await newInvoice(400);
    expect((await api().post('/api/payments').set(admin).send({ invoiceId: a.id, amount: 100, method: 'NAGAD', transactionRef: 'NG-777' })).status).toBe(201);
    const dup = await api().post('/api/payments').set(admin).send({ invoiceId: b.id, amount: 100, method: 'NAGAD', transactionRef: 'ng-777' });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('DUPLICATE_TRANSACTION');
  });

  it('requires a reference for non-cash payments', async () => {
    const inv = await newInvoice(400);
    const res = await api().post('/api/payments').set(admin).send({ invoiceId: inv.id, amount: 100, method: 'BKASH' });
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].field).toBe('transactionRef');
  });

  it('is atomic: two simultaneous full payments cannot both succeed', async () => {
    const inv = await newInvoice(1000);
    const pay = () => api().post('/api/payments').set(admin).send({ invoiceId: inv.id, amount: 1000, method: 'CASH' });
    const results = await Promise.all([pay(), pay(), pay()]);
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 400).every((r) => r.body.error.code === 'OVERPAYMENT_NOT_ALLOWED')).toBe(true);
    const fresh = await api().get(`/api/invoices/${inv.id}`).set(admin);
    expect(Number(fresh.body.data.paidAmount)).toBe(1000);
  });

  it('cannot cancel an invoice that has payments', async () => {
    const inv = await newInvoice(600);
    await api().post('/api/payments').set(admin).send({ invoiceId: inv.id, amount: 100, method: 'CASH' });
    const res = await api().post(`/api/invoices/${inv.id}/cancel`).set(admin);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVOICE_HAS_PAYMENTS');
  });

  it('reports the month’s collection by method and fee type, with a CSV export', async () => {
    const res = await api().get('/api/payments/reports').set(admin);
    expect(res.status).toBe(200);
    expect(res.body.data.collected).toBeGreaterThan(0);
    expect(res.body.data.byMethod.map((m) => m.key)).toContain('CASH');
    const csv = await api().get('/api/payments/reports?format=csv').set(admin);
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
  });
});

describe('parent and student access to fees', () => {
  it("shows a parent their child's fees and receipts, but not another child's", async () => {
    const parent = bearer(await tokenFor('PARENT'));
    const childId = (await api().get('/api/dashboard/summary').set(parent)).body.data.children[0].id;
    const mine = await api().get(`/api/students/${childId}/fees`).set(parent);
    expect(mine.status).toBe(200);
    expect(mine.body.data.summary.outstanding).toBeGreaterThan(0); // seeded unpaid November tuition

    const receiptId = mine.body.data.payments[0].id;
    expect((await api().get(`/api/payments/${receiptId}/receipt`).set(parent)).status).toBe(200);

    expect((await api().get(`/api/students/${studentId}/fees`).set(parent)).status).toBe(403);
    expect((await api().post('/api/payments').set(parent).send({ invoiceId: 'x', amount: 1, method: 'CASH' })).status).toBe(403);
  });

  it('denies teachers all student-specific financial routes while preserving overview access', async () => {
    const inv = await newInvoice(825);
    const payment = await api().post('/api/payments').set(admin).send({ invoiceId: inv.id, amount: 100, method: 'CASH' });
    expect(payment.status).toBe(201);
    const teacher = bearer(await tokenFor('TEACHER'));

    expect((await api().get(`/api/invoices/${inv.id}`).set(teacher)).status).toBe(403);
    expect((await api().get(`/api/students/${studentId}/fees`).set(teacher)).status).toBe(403);
    expect((await api().get(`/api/payments/${payment.body.data.id}/receipt`).set(teacher)).status).toBe(403);
    expect((await api().post('/api/payments/online/init').set(teacher).send({ invoiceId: inv.id })).status).toBe(403);

    const overview = await api().get(`/api/students/${studentId}/overview`).set(teacher);
    expect(overview.status).toBe(200);
    expect(overview.body.data).not.toHaveProperty('fees');
  });

  it('preserves direct invoice and fee access for a student viewing their own account', async () => {
    const student = bearer(await tokenFor('STUDENT'));
    const ownId = (await api().get('/api/dashboard/summary').set(student)).body.data.profile.id;
    const inv = (await api()
      .post('/api/invoices')
      .set(admin)
      .send({ studentId: ownId, feeTypeId: types.LAB.id, amount: 325, dueDate: '2026-12-10', billingPeriod: uniquePeriod() })).body.data;
    expect((await api().get(`/api/invoices/${inv.id}`).set(student)).status).toBe(200);
    expect((await api().get(`/api/students/${ownId}/fees`).set(student)).status).toBe(200);
  });
});

describe('online payment (SSLCommerz, server-side verification)', () => {
  async function startOnline(amount) {
    const parent = bearer(await tokenFor('PARENT'));
    const childId = (await api().get('/api/dashboard/summary').set(parent)).body.data.children[0].id;
    const inv = (
      await api()
        .post('/api/invoices')
        .set(admin)
        .send({ studentId: childId, feeTypeId: types.LAB.id, amount, dueDate: '2026-12-31', billingPeriod: uniquePeriod() })
    ).body.data;
    const res = await api().post('/api/payments/online/init').set(parent).send({ invoiceId: inv.id });
    expect(res.status).toBe(201);
    expect(res.body.data.gatewayUrl).toMatch(/^https:/);
    const payment = await prisma.payment.findUnique({ where: { id: res.body.data.paymentId } });
    return { inv, payment };
  }

  it('does not credit the invoice until the gateway validates the transaction', async () => {
    const { inv, payment } = await startOnline(750);
    expect(payment.status).toBe('PENDING');
    expect((await api().get(`/api/invoices/${inv.id}`).set(admin)).body.data.status).toBe('UNPAID');

    sslcommerz.validateTransaction.mockResolvedValueOnce({ valid: true, tranId: payment.transactionRef, amount: 750, currency: 'BDT', raw: { status: 'VALID' } });
    const ipn = await api().post('/api/payments/online/ipn').type('form').send({ tran_id: payment.transactionRef, val_id: 'VAL123', status: 'VALID' });
    expect(ipn.body.data.status).toBe('SUCCESS');
    expect((await api().get(`/api/invoices/${inv.id}`).set(admin)).body.data.status).toBe('PAID');

    // A replayed callback is a no-op.
    const replay = await api().post('/api/payments/online/ipn').type('form').send({ tran_id: payment.transactionRef, val_id: 'VAL123' });
    expect(replay.body.data.status).toBe('SUCCESS');
    expect(sslcommerz.validateTransaction).toHaveBeenCalledTimes(1);
  });

  it('rejects a forged "VALID" callback whose amount does not match', async () => {
    const { inv, payment } = await startOnline(900);
    sslcommerz.validateTransaction.mockResolvedValueOnce({ valid: true, tranId: payment.transactionRef, amount: 1, currency: 'BDT', raw: {} });
    const ipn = await api().post('/api/payments/online/ipn').type('form').send({ tran_id: payment.transactionRef, val_id: 'VALX', status: 'VALID' });
    expect(ipn.body.data.status).toBe('FAILED');
    expect((await api().get(`/api/invoices/${inv.id}`).set(admin)).body.data.status).toBe('UNPAID');
  });

  it('sends the payer back to the app after a browser return', async () => {
    const { payment } = await startOnline(300);
    const res = await api().post('/api/payments/online/return/cancel').type('form').send({ tran_id: payment.transactionRef });
    expect(res.status).toBe(303);
    expect(res.headers.location).toMatch(/\/payments\/result\?status=FAILED/);
  });
});
