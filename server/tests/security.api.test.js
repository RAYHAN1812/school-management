// Phase 9: cross-cutting security checks.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/config/prisma.js';
import { api, bearer, DEMO_PASSWORD, tokenFor, uniqueEmail } from './helpers.js';

let tokens;
let gis; // ids from the seeded school

beforeAll(async () => {
  tokens = {};
  for (const role of ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'TEACHER', 'STUDENT', 'PARENT']) tokens[role] = bearer(await tokenFor(role));
  const admin = tokens.SCHOOL_ADMIN;
  const student = (await api().get('/api/students?search=Arif').set(admin)).body.data[0];
  const { classes } = (await api().get('/api/classes').set(admin)).body.data;
  const invoice = (await api().get('/api/invoices?limit=1').set(admin)).body.data[0];
  const exam = (await api().get('/api/exams').set(admin)).body.data[0];
  gis = { student, class6: classes.find((c) => c.name === 'Class 6'), invoice, exam };
});

afterAll(() => prisma.$disconnect());

describe('no secrets in responses', () => {
  const GETS = [
    '/api/auth/me', '/api/dashboard/summary', '/api/users', '/api/students', '/api/teachers', '/api/classes',
    '/api/notices', '/api/assignments', '/api/exams', '/api/invoices', '/api/timetables/me', '/api/portal/students',
  ];

  it.each(['SUPER_ADMIN', 'SCHOOL_ADMIN', 'TEACHER', 'STUDENT', 'PARENT'])('never returns password hashes or token versions to %s', async (role) => {
    for (const path of GETS) {
      const res = await api().get(path).set(tokens[role]).set('X-School-Id', gis.class6.schoolId);
      const body = JSON.stringify(res.body);
      expect(body, path).not.toMatch(/passwordHash|tokenVersion|tokenHash/);
      if (!['SUPER_ADMIN', 'SCHOOL_ADMIN'].includes(role)) expect(body, path).not.toMatch(/"salary"/);
    }
  });

  it('includes no stack traces or internals in error responses', async () => {
    const res = await api().post('/api/auth/login').set('Content-Type', 'application/json').send('{"broken json');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
    expect(JSON.stringify(res.body)).not.toMatch(/at .*\.js:\d+/);
  });
});

describe('multi-school isolation', () => {
  let otherAdmin;

  beforeAll(async () => {
    const code = `ISO${Date.now().toString().slice(-5)}`;
    const school = (await api().post('/api/schools').set(tokens.SUPER_ADMIN).send({ name: 'Isolation School', code })).body.data;
    const email = uniqueEmail('otheradmin');
    await api()
      .post('/api/auth/register')
      .set(tokens.SUPER_ADMIN)
      .send({ fullName: 'Other Admin', email, password: 'Other@2026', role: 'SCHOOL_ADMIN', schoolId: school.id });
    otherAdmin = bearer(await tokenFor(email, 'Other@2026'));
  });

  it("cannot read another school's student, invoice or exam", async () => {
    expect((await api().get(`/api/students/${gis.student.id}`).set(otherAdmin)).status).toBe(404);
    expect((await api().get(`/api/invoices/${gis.invoice.id}`).set(otherAdmin)).status).toBe(404);
    expect((await api().get(`/api/exams/${gis.exam.id}`).set(otherAdmin)).status).toBe(404);
    expect((await api().get(`/api/students/${gis.student.id}/overview`).set(otherAdmin)).status).toBe(404);
  });

  it("cannot write to another school's records", async () => {
    const pay = await api().post('/api/payments').set(otherAdmin).send({ invoiceId: gis.invoice.id, amount: 1, method: 'CASH' });
    expect(pay.status).toBe(404);
    const edit = await api().patch(`/api/students/${gis.student.id}`).set(otherAdmin).send({ fullName: 'Hacked' });
    expect(edit.status).toBe(404);
    const subjects = await api().put(`/api/classes/${gis.class6.id}/subjects`).set(otherAdmin).send({ subjects: [] });
    expect(subjects.status).toBe(404);
  });

  it('ignores X-School-Id from school-level users (no tenant hopping)', async () => {
    const res = await api().get('/api/students').set(otherAdmin).set('X-School-Id', gis.class6.schoolId);
    expect(res.status).toBe(200);
    expect(res.body.data.some((s) => s.id === gis.student.id)).toBe(false);
  });
});

describe('CSRF protection for cookie sessions', () => {
  const cookieFor = async () => {
    const res = await api().post('/api/auth/login').send({ identifier: 'admin@edumanage.test', password: DEMO_PASSWORD });
    return res.headers['set-cookie'].join(';').match(/sms_token=([^;]+)/)[1];
  };

  it('blocks cookie-authenticated writes without X-Requested-With', async () => {
    const cookie = await cookieFor();
    const res = await api().post('/api/subjects').set('Cookie', `sms_token=${cookie}`).send({ name: 'CSRF', code: 'CSRF1' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF_CHECK_FAILED');
  });

  it('allows them with the header (as the web app sends), and allows reads without it', async () => {
    const cookie = await cookieFor();
    const ok = await api().post('/api/subjects').set('Cookie', `sms_token=${cookie}`).set('X-Requested-With', 'XMLHttpRequest').send({ name: 'CSRF ok', code: 'CSRF2' });
    expect(ok.status).toBe(201);
    expect((await api().get('/api/subjects').set('Cookie', `sms_token=${cookie}`)).status).toBe(200);
  });
});

describe('security headers', () => {
  it('sets protective headers and hides the framework', async () => {
    const res = await api().get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBeDefined();
    expect(res.headers['strict-transport-security']).toBeDefined();
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('rejects oversized JSON bodies', async () => {
    const res = await api().post('/api/auth/login').send({ identifier: 'x'.repeat(1_200_000), password: 'x' });
    expect(res.status).toBe(413);
  });
});
