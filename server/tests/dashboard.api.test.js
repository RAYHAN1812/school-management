import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/config/prisma.js';
import { api, bearer, tokenFor } from './helpers.js';

afterAll(() => prisma.$disconnect());

describe('GET /api/dashboard/summary is role-specific', () => {
  it('gives admins school-wide statistics from the database', async () => {
    const res = await api().get('/api/dashboard/summary').set(bearer(await tokenFor('SCHOOL_ADMIN')));
    expect(res.status).toBe(200);
    expect(res.body.data.type).toBe('admin');
    expect(res.body.data.stats.totalStudents).toBeGreaterThanOrEqual(1);
    expect(res.body.data.stats.totalTeachers).toBeGreaterThanOrEqual(1);
    expect(res.body.data.usersByRole.map((r) => r.role)).not.toContain('SUPER_ADMIN');
  });

  it('shows the super admin the number of schools', async () => {
    const res = await api().get('/api/dashboard/summary').set(bearer(await tokenFor('SUPER_ADMIN')));
    expect(res.body.data.stats.totalSchools).toBeGreaterThanOrEqual(1);
  });

  it('gives a teacher their subjects and class-teacher sections', async () => {
    const res = await api().get('/api/dashboard/summary').set(bearer(await tokenFor('TEACHER')));
    expect(res.body.data.type).toBe('teacher');
    expect(res.body.data.subjects.map((s) => s.code).sort()).toEqual(['MATH', 'SCI']);
    expect(res.body.data.classTeacherOf[0].class.name).toBe('Class 6');
  });

  it('gives a student their own enrollment', async () => {
    const res = await api().get('/api/dashboard/summary').set(bearer(await tokenFor('STUDENT')));
    expect(res.body.data.type).toBe('student');
    expect(res.body.data.profile.studentCode).toBe('STU-2026-0001');
    expect(res.body.data.enrollment.rollNumber).toBe(1);
  });

  it('gives a parent only their linked children', async () => {
    const res = await api().get('/api/dashboard/summary').set(bearer(await tokenFor('PARENT')));
    expect(res.body.data.type).toBe('parent');
    expect(res.body.data.children).toHaveLength(1);
    expect(res.body.data.children[0].studentCode).toBe('STU-2026-0001');
  });
});

describe('schools are super-admin only', () => {
  it('blocks school admins', async () => {
    const res = await api().get('/api/schools').set(bearer(await tokenFor('SCHOOL_ADMIN')));
    expect(res.status).toBe(403);
  });

  it('lets a super admin create a school and rejects a duplicate code', async () => {
    const token = await tokenFor('SUPER_ADMIN');
    const code = `T${Date.now().toString().slice(-6)}`;
    const first = await api().post('/api/schools').set(bearer(token)).send({ name: 'Test School', code });
    expect(first.status).toBe(201);
    const dup = await api().post('/api/schools').set(bearer(token)).send({ name: 'Again', code });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('DUPLICATE_SCHOOL_CODE');
  });
});
