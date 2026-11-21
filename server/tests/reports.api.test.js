import ExcelJS from 'exceljs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/config/prisma.js';
import { api, bearer, tokenFor } from './helpers.js';

let admin;
let teacher;
let class6;
let sectionA;
let firstTermId;

// Supertest: collect binary responses as Buffers.
const binary = (req) => req.buffer(true).parse((res, cb) => {
  const chunks = [];
  res.on('data', (c) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
});

beforeAll(async () => {
  admin = bearer(await tokenFor('SCHOOL_ADMIN'));
  teacher = bearer(await tokenFor('TEACHER'));
  const { classes } = (await api().get('/api/classes').set(admin)).body.data;
  class6 = classes.find((c) => c.name === 'Class 6');
  sectionA = class6.sections.find((s) => s.name === 'A');
  firstTermId = (await api().get(`/api/exams?classId=${class6.id}`).set(admin)).body.data.find((e) => e.name === 'First Term').id;
});

afterAll(() => prisma.$disconnect());

describe('reports', () => {
  const cases = {
    admissions: '',
    'class-students': () => `classId=${class6.id}`,
    attendance: () => `classId=${class6.id}&sectionId=${sectionA.id}`,
    exam: () => `examId=${firstTermId}`,
    'fee-collection': 'from=2026-01-01&to=2026-12-31',
    outstanding: '',
    'teacher-workload': '',
    library: '',
  };

  it('lists all eight report types for admins, two for teachers', async () => {
    expect((await api().get('/api/reports').set(admin)).body.data).toHaveLength(8);
    expect((await api().get('/api/reports').set(teacher)).body.data.map((r) => r.key)).toEqual(['attendance', 'exam']);
  });

  it.each(Object.keys(cases))('builds the %s report as a table', async (type) => {
    const q = typeof cases[type] === 'function' ? cases[type]() : cases[type];
    const res = await api().get(`/api/reports/${type}?${q}`).set(admin);
    expect(res.status).toBe(200);
    expect(res.body.data.columns.length).toBeGreaterThan(2);
    expect(Array.isArray(res.body.data.rows)).toBe(true);
    expect(res.body.data.title).toBeTruthy();
  });

  it('exports a real Excel workbook', async () => {
    const res = await binary(api().get(`/api/reports/class-students?classId=${class6.id}&format=xlsx`).set(admin));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/spreadsheetml/);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body);
    const ws = wb.worksheets[0];
    expect(ws.getCell('A1').value).toBe('Class-wise student report');
    expect(ws.rowCount).toBeGreaterThan(5);
  });

  it('exports a PDF', async () => {
    const res = await binary(api().get('/api/reports/outstanding?format=pdf').set(admin));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.body.subarray(0, 5).toString()).toBe('%PDF-');
    expect(res.body.length).toBeGreaterThan(1000);
  });

  it('keeps finance and staff reports away from teachers', async () => {
    expect((await api().get('/api/reports/fee-collection').set(teacher)).status).toBe(403);
    expect((await api().get('/api/reports/teacher-workload').set(teacher)).status).toBe(403);
    expect((await api().get(`/api/reports/attendance?classId=${class6.id}&sectionId=${sectionA.id}`).set(teacher)).status).toBe(200);
    expect((await api().get('/api/reports').set(bearer(await tokenFor('PARENT')))).status).toBe(403);
  });
});

describe('dashboards (Phase 8)', () => {
  it('gives admins today’s attendance, fees, trends and upcoming items', async () => {
    const res = await api().get('/api/dashboard/summary?date=2026-10-05').set(admin);
    const d = res.body.data;
    expect(d.todayAttendance.date).toBe('2026-10-05');
    expect(d.fees.outstanding).toBeGreaterThan(0);
    expect(d.collectionTrend).toHaveLength(6);
    expect(Array.isArray(d.recentAdmissions)).toBe(true);
    expect(Array.isArray(d.latestNotices)).toBe(true);
  });

  it("gives teachers today's periods, attendance tasks and pending marking", async () => {
    const d = (await api().get('/api/dashboard/summary?date=2026-11-22').set(teacher)).body.data; // a Sunday
    expect(d.today.dayOfWeek).toBe('SUNDAY');
    expect(d.today.periods.length).toBeGreaterThan(0);
    expect(d.attendanceTasks.length).toBeGreaterThan(0);
    expect(d.pendingEvaluations.total).toBeGreaterThanOrEqual(0);
  });
});
