import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/config/prisma.js';
import { api, bearer, tokenFor } from './helpers.js';

let admin;
let mathTeacher; // Farhana (seed): teaches Maths and Science
let class6;
let subjects;
let examId;

beforeAll(async () => {
  admin = bearer(await tokenFor('SCHOOL_ADMIN'));
  mathTeacher = bearer(await tokenFor('TEACHER'));
  const { classes } = (await api().get('/api/classes').set(admin)).body.data;
  class6 = classes.find((c) => c.name === 'Class 6');
  subjects = Object.fromEntries((await api().get('/api/subjects').set(admin)).body.data.map((s) => [s.code, s]));
  const teachers = (await api().get('/api/teachers').set(admin)).body.data;
  const farhana = teachers.find((t) => t.employeeCode === 'EMP-0001');
  const mahmudul = teachers.find((t) => t.employeeCode === 'EMP-0002');

  // Pin subject teachers so this file doesn't depend on other test files.
  await api()
    .put(`/api/classes/${class6.id}/subjects`)
    .set(admin)
    .send({
      subjects: [
        { subjectId: subjects.MATH.id, teacherId: farhana.id },
        { subjectId: subjects.SCI.id, teacherId: farhana.id },
        { subjectId: subjects.ENG.id, teacherId: mahmudul.id },
        { subjectId: subjects.BAN.id, teacherId: mahmudul.id },
      ],
    });
});

afterAll(() => prisma.$disconnect());

const sheetFor = (token, code) => api().get(`/api/exams/${examId}/marks?subjectId=${subjects[code].id}`).set(token);

describe('creating exams', () => {
  it('creates an exam with component marks', async () => {
    const res = await api()
      .post('/api/exams')
      .set(admin)
      .send({
        classId: class6.id,
        name: 'Final',
        startDate: '2026-11-01',
        endDate: '2026-11-10',
        subjects: [
          { subjectId: subjects.MATH.id, fullMarks: 100, passMarks: 33, writtenMarks: 70, mcqMarks: 30 },
          { subjectId: subjects.ENG.id, fullMarks: 50, passMarks: 17 },
        ],
      });
    expect(res.status).toBe(201);
    examId = res.body.data.id;
    expect(res.body.data.subjects).toHaveLength(2);
  });

  it('rejects components that do not add up, pass > full, and duplicate names', async () => {
    const bad = await api()
      .post('/api/exams')
      .set(admin)
      .send({ classId: class6.id, name: 'Bad', subjects: [{ subjectId: subjects.MATH.id, fullMarks: 100, passMarks: 120, writtenMarks: 60, mcqMarks: 30 }] });
    expect(bad.status).toBe(400);
    const fields = bad.body.error.details.map((d) => d.field);
    expect(fields).toEqual(expect.arrayContaining(['subjects.0.passMarks', 'subjects.0.writtenMarks']));

    const dup = await api()
      .post('/api/exams')
      .set(admin)
      .send({ classId: class6.id, name: 'Final', subjects: [{ subjectId: subjects.MATH.id, fullMarks: 100, passMarks: 33 }] });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('DUPLICATE_EXAM');
  });

  it('is admin-only; teachers can list exams for their classes', async () => {
    const res = await api()
      .post('/api/exams')
      .set(mathTeacher)
      .send({ classId: class6.id, name: 'Quiz', subjects: [{ subjectId: subjects.MATH.id, fullMarks: 20, passMarks: 7 }] });
    expect(res.status).toBe(403);
    const list = await api().get('/api/exams').set(mathTeacher);
    expect(list.body.data.map((e) => e.name)).toContain('Final');
  });
});

describe('entering marks', () => {
  it('lets the subject teacher enter marks and computes grade and pass/fail', async () => {
    const sheet = await sheetFor(mathTeacher, 'MATH');
    expect(sheet.status).toBe(200);
    expect(sheet.body.data.canEdit).toBe(true);
    const students = sheet.body.data.students;
    const marks = students.map((s, i) => (i === 0 ? { studentId: s.studentId, written: 60, mcq: 25 } : i === 1 ? { studentId: s.studentId, isAbsent: true } : { studentId: s.studentId, written: 20, mcq: 10 + (i % 3) }));
    const res = await api().post(`/api/exams/${examId}/marks`).set(mathTeacher).send({ subjectId: subjects.MATH.id, marks });
    expect(res.status).toBe(200);

    const after = (await sheetFor(mathTeacher, 'MATH')).body.data.students;
    expect(after[0].mark).toMatchObject({ total: '85', grade: 'A+', resultStatus: 'PASS' });
    expect(after[1].mark).toMatchObject({ isAbsent: true, grade: 'F', resultStatus: 'ABSENT' });
  });

  it('rejects marks above the maximum (MARKS_EXCEED_FULL_MARKS) and negative marks', async () => {
    const [first] = (await sheetFor(mathTeacher, 'MATH')).body.data.students;
    const over = await api().post(`/api/exams/${examId}/marks`).set(mathTeacher).send({ subjectId: subjects.MATH.id, marks: [{ studentId: first.studentId, written: 71, mcq: 10 }] });
    expect(over.status).toBe(400);
    expect(over.body.error.code).toBe('MARKS_EXCEED_FULL_MARKS');

    const english = (await sheetFor(admin, 'ENG')).body.data.students[0];
    const overTotal = await api().post(`/api/exams/${examId}/marks`).set(admin).send({ subjectId: subjects.ENG.id, marks: [{ studentId: english.studentId, written: 51 }] });
    expect(overTotal.status).toBe(400);
    expect(overTotal.body.error.code).toBe('MARKS_EXCEED_FULL_MARKS');

    const negative = await api().post(`/api/exams/${examId}/marks`).set(mathTeacher).send({ subjectId: subjects.MATH.id, marks: [{ studentId: first.studentId, written: -5, mcq: 10 }] });
    expect(negative.status).toBe(400);
    expect(negative.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('stops a teacher entering marks for a subject they do not teach', async () => {
    const sheet = await sheetFor(mathTeacher, 'ENG');
    expect(sheet.body.data.canEdit).toBe(false);
    const res = await api()
      .post(`/api/exams/${examId}/marks`)
      .set(mathTeacher)
      .send({ subjectId: subjects.ENG.id, marks: [{ studentId: sheet.body.data.students[0].studentId, written: 30 }] });
    expect(res.status).toBe(403);
  });

  it('refuses to publish until every student has marks in every subject', async () => {
    const res = await api().post(`/api/exams/${examId}/publish`).set(admin);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('RESULTS_INCOMPLETE');
    expect(res.body.error.message).toMatch(/English/);
  });
});

describe('publishing and results', () => {
  beforeAll(async () => {
    const students = (await sheetFor(admin, 'ENG')).body.data.students;
    await api()
      .post(`/api/exams/${examId}/marks`)
      .set(admin)
      .send({ subjectId: subjects.ENG.id, marks: students.map((s, i) => ({ studentId: s.studentId, written: 30 + (i % 15) })) });
  });

  it('ranks the class by GPA with a merit position and summary', async () => {
    const res = await api().get(`/api/exams/${examId}/results`).set(admin);
    expect(res.status).toBe(200);
    const { rows, summary } = res.body.data;
    expect(rows[0].position).toBe(1);
    expect(rows.find((r) => r.subjects.some((s) => s.isAbsent)).result).toBe('FAIL');
    expect(summary.complete).toBe(rows.length);
    expect(summary.passed + summary.failed).toBe(rows.length);
    const top = rows[0];
    expect(top.gpa).toBeGreaterThan(0);
  });

  it('publishes, then blocks teachers from changing marks', async () => {
    const pub = await api().post(`/api/exams/${examId}/publish`).set(admin);
    expect(pub.status).toBe(200);
    expect(pub.body.data.status).toBe('PUBLISHED');

    const [first] = (await sheetFor(mathTeacher, 'MATH')).body.data.students;
    const res = await api().post(`/api/exams/${examId}/marks`).set(mathTeacher).send({ subjectId: subjects.MATH.id, marks: [{ studentId: first.studentId, written: 70, mcq: 30 }] });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('RESULTS_PUBLISHED');
  });

  it('lets an admin amend published marks, and records it in the audit log', async () => {
    const [first] = (await sheetFor(admin, 'MATH')).body.data.students;
    const res = await api().post(`/api/exams/${examId}/marks`).set(admin).send({ subjectId: subjects.MATH.id, marks: [{ studentId: first.studentId, written: 70, mcq: 30 }] });
    expect(res.status).toBe(200);
    const log = await api().get('/api/audit-logs?action=MARKS_AMENDED_AFTER_PUBLICATION').set(admin);
    expect(log.body.data.length).toBeGreaterThan(0);
  });

  it('shows a student their own report card and published results', async () => {
    const student = bearer(await tokenFor('STUDENT'));
    const me = (await api().get('/api/dashboard/summary').set(student)).body.data;
    const studentId = (await api().get('/api/students?search=Arif').set(admin)).body.data[0].id;
    expect(me.profile.studentCode).toBe('STU-2026-0001');

    const card = await api().get(`/api/exams/${examId}/report-card/${studentId}`).set(student);
    expect(card.status).toBe(200);
    expect(card.body.data.subjects).toHaveLength(2);
    expect(card.body.data.overall.position).toBeGreaterThan(0);

    const results = await api().get(`/api/students/${studentId}/results`).set(student);
    expect(results.body.data.map((r) => r.exam.name)).toEqual(expect.arrayContaining(['Final', 'First Term']));
  });

  it("blocks a parent from another student's result with 403 FORBIDDEN", async () => {
    const parent = bearer(await tokenFor('PARENT'));
    const other = (await api().get('/api/students?search=Nadia').set(admin)).body.data[0].id;
    const res = await api().get(`/api/exams/${examId}/report-card/${other}`).set(parent);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('hides unpublished results from students', async () => {
    const midterm = (await api().get(`/api/exams?classId=${class6.id}`).set(admin)).body.data.find((e) => e.name === 'Midterm');
    const studentId = (await api().get('/api/students?search=Arif').set(admin)).body.data[0].id;
    const res = await api().get(`/api/exams/${midterm.id}/report-card/${studentId}`).set(bearer(await tokenFor('STUDENT')));
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('RESULT_NOT_PUBLISHED');
  });
});

describe('grading scale', () => {
  it('is configurable by admins and rejects overlapping bands', async () => {
    const current = (await api().get('/api/grade-scales').set(admin)).body.data;
    expect(current).toHaveLength(7);
    const bad = await api()
      .put('/api/grade-scales')
      .set(admin)
      .send({ bands: [{ grade: 'P', minPercent: 0, maxPercent: 60, gradePoint: 1 }, { grade: 'Q', minPercent: 50, maxPercent: 100, gradePoint: 2 }] });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('INVALID_GRADE_SCALE');
    const teacherTry = await api().put('/api/grade-scales').set(mathTeacher).send({ bands: current });
    expect(teacherTry.status).toBe(403);
    // Re-saving the same scale is fine.
    const same = await api().put('/api/grade-scales').set(admin).send({ bands: current.map(({ grade, minPercent, maxPercent, gradePoint }) => ({ grade, minPercent, maxPercent, gradePoint })) });
    expect(same.status).toBe(200);
  });
});

