import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/config/prisma.js';
import { api, bearer, tokenFor, uniqueEmail } from './helpers.js';

let admin;
let superAdmin;
let teacherToken;
let year2026;
let year2027;
let class6;

beforeAll(async () => {
  admin = bearer(await tokenFor('SCHOOL_ADMIN'));
  const superToken = bearer(await tokenFor('SUPER_ADMIN'));
  const { data: schools } = (await api().get('/api/schools').set(superToken)).body;
  superAdmin = { ...superToken, 'X-School-Id': schools[0].id };
  teacherToken = bearer(await tokenFor('TEACHER'));
  const years = (await api().get('/api/academic-years').set(admin)).body.data;
  year2026 = years.find((y) => y.name === '2026');
  year2027 = years.find((y) => y.name === '2027');
  const classes = (await api().get('/api/classes').set(admin)).body.data.classes;
  class6 = classes.find((c) => c.name === 'Class 6');
});

afterAll(() => prisma.$disconnect());

describe('academic years', () => {
  it('lists years with the active one first in use', () => {
    expect(year2026.status).toBe('ACTIVE');
    expect(year2027.status).toBe('UPCOMING');
  });

  it('rejects an end date before the start date', async () => {
    const res = await api()
      .post('/api/academic-years')
      .set(superAdmin)
      .send({ name: '2030', startDate: '2030-12-31', endDate: '2030-01-01' });
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].field).toBe('endDate');
  });

  it('rejects impossible dates', async () => {
    const res = await api()
      .post('/api/academic-years')
      .set(admin)
      .send({ name: '2031', startDate: '2031-02-30', endDate: '2031-12-31' });
    expect(res.status).toBe(400);
  });

  it('rejects a duplicate year name', async () => {
    const res = await api()
      .post('/api/academic-years')
      .set(admin)
      .send({ name: '2026', startDate: '2026-01-01', endDate: '2026-12-31' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DUPLICATE_ACADEMIC_YEAR');
  });

  it('is read-only for teachers', async () => {
    expect((await api().get('/api/academic-years').set(teacherToken)).status).toBe(200);
    const res = await api()
      .post('/api/academic-years')
      .set(teacherToken)
      .send({ name: '2032', startDate: '2032-01-01', endDate: '2032-12-31' });
    expect(res.status).toBe(403);
  });

  it('is forbidden to students and parents', async () => {
    const res = await api().get('/api/classes').set(bearer(await tokenFor('PARENT')));
    expect(res.status).toBe(403);
  });
});

describe('classes and sections', () => {
  it('lists classes for the active year with section enrollment counts', async () => {
    const sectionA = class6.sections.find((s) => s.name === 'A');
    expect(sectionA._count.enrollments).toBeGreaterThanOrEqual(4);
    expect(sectionA.classTeacher.fullName).toBe('Farhana Akter');
  });

  it('creates a class with sections and subjects', async () => {
    const subjects = (await api().get('/api/subjects').set(admin)).body.data;
    const res = await api()
      .post('/api/classes')
      .set(admin)
      .send({
        academicYearId: year2026.id,
        name: 'Class 8',
        numericLevel: 8,
        capacity: 60,
        sections: ['a', 'B'],
        subjectIds: subjects.slice(0, 2).map((s) => s.id),
      });
    expect(res.status).toBe(201);
    expect(res.body.data.sections.map((s) => s.name)).toEqual(['A', 'B']);
    expect(res.body.data.classSubjects).toHaveLength(2);
  });

  it('rejects a duplicate class in the same year with 409 DUPLICATE_CLASS', async () => {
    const res = await api()
      .post('/api/classes')
      .set(admin)
      .send({ academicYearId: year2026.id, name: 'Class 6', capacity: 50, sections: ['A'] });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DUPLICATE_CLASS');
  });

  it('rejects a duplicate section with 409 DUPLICATE_SECTION', async () => {
    const res = await api().post(`/api/classes/${class6.id}/sections`).set(admin).send({ name: 'a' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DUPLICATE_SECTION');
  });

  it('returns 404 CLASS_NOT_FOUND for an unknown class', async () => {
    const res = await api().get('/api/classes/does-not-exist').set(admin);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('CLASS_NOT_FOUND');
  });

  it('will not shrink capacity below current enrollment', async () => {
    const res = await api().patch(`/api/classes/${class6.id}`).set(admin).send({ capacity: 2 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CAPACITY_BELOW_ENROLLMENT');
  });

  it('lists class-wise students ordered by section and roll', async () => {
    const res = await api().get(`/api/classes/${class6.id}/students`).set(admin);
    expect(res.status).toBe(200);
    const sectionA = res.body.data.filter((e) => e.section.name === 'A').map((e) => e.rollNumber);
    expect(sectionA).toEqual([...sectionA].sort((a, b) => a - b));
  });

  it('limits teacher class details and rosters to assigned classes', async () => {
    const email = uniqueEmail('unassigned-teacher');
    await api()
      .post('/api/teachers')
      .set(superAdmin)
      .send({ fullName: 'Unassigned Teacher', designation: 'Teacher', phone: '01700000031', email, joiningDate: '2025-01-01', account: { password: 'Teach@2026' } });
    const outsider = bearer(await tokenFor(email, 'Teach@2026'));

    expect((await api().get('/api/classes').set(outsider)).body.data.classes).toHaveLength(0);
    expect((await api().get(`/api/classes/${class6.id}`).set(outsider)).status).toBe(403);
    expect((await api().get(`/api/classes/${class6.id}/students`).set(outsider)).status).toBe(403);

    const sectionTeacherEmail = uniqueEmail('section-teacher');
    const created = await api()
      .post('/api/teachers')
      .set(superAdmin)
      .send({ fullName: 'Section Teacher', designation: 'Teacher', phone: '01700000032', email: sectionTeacherEmail, joiningDate: '2025-01-01', account: { password: 'Teach@2026' } });
    const sectionB = class6.sections.find((section) => section.name === 'B');
    const original = await prisma.section.findUnique({ where: { id: sectionB.id }, select: { classTeacherId: true } });
    await prisma.section.update({ where: { id: sectionB.id }, data: { classTeacherId: created.body.data.id } });
    try {
      const sectionTeacher = bearer(await tokenFor(sectionTeacherEmail, 'Teach@2026'));
      const ownClasses = (await api().get('/api/classes').set(sectionTeacher)).body.data.classes;
      expect(ownClasses.map((klass) => klass.id)).toEqual([class6.id]);
      expect(ownClasses[0].sections.map((section) => section.id)).toEqual([sectionB.id]);

      const detail = await api().get(`/api/classes/${class6.id}`).set(sectionTeacher);
      expect(detail.status).toBe(200);
      expect(detail.body.data.sections.map((section) => section.id)).toEqual([sectionB.id]);
      expect(detail.body.data.classSubjects).toHaveLength(0);

      const ownRoster = await api().get(`/api/classes/${class6.id}/students`).set(sectionTeacher);
      expect(ownRoster.status).toBe(200);
      expect(ownRoster.body.data.length).toBeGreaterThan(0);
      expect(ownRoster.body.data.every((enrollment) => enrollment.section.id === sectionB.id)).toBe(true);
      expect((await api().get(`/api/classes/${class6.id}/students?sectionId=${class6.sections.find((section) => section.name === 'A').id}`).set(sectionTeacher)).status).toBe(403);
    } finally {
      await prisma.section.update({ where: { id: sectionB.id }, data: { classTeacherId: original.classTeacherId } });
    }

    const ownRoster = await api().get(`/api/classes/${class6.id}/students`).set(teacherToken);
    expect(ownRoster.status).toBe(200);
    expect(ownRoster.body.data.length).toBeGreaterThan(0);
  });
});

describe('teacher assignment rules', () => {
  it('refuses to assign an inactive teacher as class teacher (409 TEACHER_INACTIVE)', async () => {
    const created = await api()
      .post('/api/teachers')
      .set(superAdmin)
      .send({ fullName: 'On Leave', designation: 'Teacher', phone: '01700000001', email: 'leave@ratonpur.test', joiningDate: '2024-01-01' });
    await api().patch(`/api/teachers/${created.body.data.id}`).set(superAdmin).send({ status: 'INACTIVE' });

    const res = await api()
      .post(`/api/classes/${class6.id}/sections`)
      .set(admin)
      .send({ name: 'Z', classTeacherId: created.body.data.id });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('TEACHER_INACTIVE');
  });

  it('assigns subject teachers to a class and rejects unknown subjects', async () => {
    const teachers = (await api().get('/api/teachers?status=ACTIVE').set(admin)).body.data;
    const subjects = (await api().get('/api/subjects').set(admin)).body.data;
    const ok = await api()
      .put(`/api/classes/${class6.id}/subjects`)
      .set(admin)
      .send({ subjects: subjects.map((s) => ({ subjectId: s.id, teacherId: teachers[0].id })) });
    expect(ok.status).toBe(200);
    expect(ok.body.data.classSubjects.every((cs) => cs.teacher?.id === teachers[0].id)).toBe(true);

    const bad = await api()
      .put(`/api/classes/${class6.id}/subjects`)
      .set(admin)
      .send({ subjects: [{ subjectId: 'nope' }] });
    expect(bad.status).toBe(404);
    expect(bad.body.error.code).toBe('SUBJECT_NOT_FOUND');
  });
});

describe('subjects', () => {
  it('creates a subject and rejects a duplicate code', async () => {
    const first = await api().post('/api/subjects').set(admin).send({ name: 'ICT', code: 'ict' });
    expect(first.status).toBe(201);
    expect(first.body.data.code).toBe('ICT');
    const dup = await api().post('/api/subjects').set(admin).send({ name: 'Computing', code: 'ICT' });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('DUPLICATE_SUBJECT_CODE');
  });
});

describe('promotion to the next academic year', () => {
  it('promotes selected students, keeps section letters, and blocks a second promotion', async () => {
    const students = (await api().get(`/api/classes/${class6.id}/students`).set(admin)).body.data;
    const pick = students.filter((e) => e.section.name === 'B').slice(0, 2);
    const class7in2027 = (await api().get(`/api/classes?academicYearId=${year2027.id}`).set(admin)).body.data.classes.find(
      (c) => c.name === 'Class 7',
    );

    const res = await api()
      .post('/api/classes/promote')
      .set(admin)
      .send({ fromClassId: class6.id, toClassId: class7in2027.id, studentIds: pick.map((e) => e.student.id) });
    expect(res.status).toBe(200);
    expect(res.body.data.promoted).toBe(2);

    const after = (await api().get(`/api/classes/${class7in2027.id}/students`).set(admin)).body.data;
    expect(after.map((e) => e.section.name)).toEqual(['B', 'B']);
    expect(after.map((e) => e.rollNumber)).toEqual([1, 2]);

    // They left Class 6's active list…
    const class6After = (await api().get(`/api/classes/${class6.id}/students`).set(admin)).body.data;
    expect(class6After.some((e) => pick.some((p) => p.student.id === e.student.id))).toBe(false);

    // …so promoting them again is rejected.
    const again = await api()
      .post('/api/classes/promote')
      .set(admin)
      .send({ fromClassId: class6.id, toClassId: class7in2027.id, studentIds: pick.map((e) => e.student.id) });
    expect(again.status).toBe(400);
    expect(again.body.error.code).toBe('INVALID_STUDENTS');
  });

  it('refuses to "promote" within the same academic year', async () => {
    const students = (await api().get(`/api/classes/${class6.id}/students`).set(admin)).body.data;
    const class7in2026 = (await api().get('/api/classes').set(admin)).body.data.classes.find((c) => c.name === 'Class 7');
    const res = await api()
      .post('/api/classes/promote')
      .set(admin)
      .send({ fromClassId: class6.id, toClassId: class7in2026.id, studentIds: [students[0].student.id] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('SAME_ACADEMIC_YEAR');
  });
});

describe('super admin school selection', () => {
  it('requires X-School-Id for school-scoped data', async () => {
    const token = bearer(await tokenFor('SUPER_ADMIN'));
    const missing = await api().get('/api/classes').set(token);
    expect(missing.status).toBe(400);
    expect(missing.body.error.code).toBe('SCHOOL_REQUIRED');

    const schools = (await api().get('/api/schools').set(token)).body.data;
    const gis = schools.find((s) => s.code === 'GIS');
    const ok = await api().get('/api/classes').set(token).set('X-School-Id', gis.id);
    expect(ok.status).toBe(200);
  });
});
