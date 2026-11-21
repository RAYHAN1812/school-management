import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/config/prisma.js';
import { api, bearer, tokenFor } from './helpers.js';

let admin;
let parent;
let student;
let childId;
let otherId;

beforeAll(async () => {
  admin = bearer(await tokenFor('SCHOOL_ADMIN'));
  parent = bearer(await tokenFor('PARENT'));
  student = bearer(await tokenFor('STUDENT'));
  childId = (await api().get('/api/portal/students').set(parent)).body.data[0].id;
  otherId = (await api().get('/api/students?search=Nadia').set(admin)).body.data[0].id;
});

afterAll(() => prisma.$disconnect());

describe('portal', () => {
  it('lists a parent’s linked children and a student’s own record', async () => {
    const kids = (await api().get('/api/portal/students').set(parent)).body.data;
    expect(kids.map((k) => k.studentCode)).toEqual(['STU-2026-0001']);
    const me = (await api().get('/api/portal/students').set(student)).body.data;
    expect(me).toHaveLength(1);
    expect(me[0].id).toBe(childId);
    expect((await api().get('/api/portal/students').set(admin)).status).toBe(403);
  });

  it('gives a parent the child overview: attendance, results, fees and teachers', async () => {
    const res = await api().get(`/api/students/${childId}/overview`).set(parent);
    expect(res.status).toBe(200);
    const o = res.body.data;
    expect(o.enrollment.class.name).toBe('Class 6');
    expect(o.attendance.total).toBeGreaterThan(0);
    expect(o.latestResult).not.toBeNull();
    expect(o.fees.outstanding).toBeGreaterThan(0);
    expect(o.teachers.some((t) => t.roles.includes('Class teacher'))).toBe(true);
  });

  it('blocks parents and students from other students (403 FORBIDDEN)', async () => {
    for (const token of [parent, student]) {
      for (const path of ['overview', 'attendance', 'results', 'fees']) {
        const res = await api().get(`/api/students/${otherId}/${path}`).set(token);
        expect(res.status, `${path}`).toBe(403);
        expect(res.body.error.code).toBe('FORBIDDEN');
      }
    }
  });

  it('lets the student see their own overview', async () => {
    const res = await api().get(`/api/students/${childId}/overview`).set(student);
    expect(res.status).toBe(200);
    expect(res.body.data.student.studentCode).toBe('STU-2026-0001');
  });
});
