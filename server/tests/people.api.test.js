import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/config/prisma.js';
import { api, bearer, tokenFor, uniqueEmail } from './helpers.js';

let admin;
let superAdmin;
let class6;
let class7;
let sectionA;
let sectionB;

const studentPayload = (overrides = {}) => ({
  fullName: 'Test Student',
  dateOfBirth: '2014-04-01',
  gender: 'FEMALE',
  presentAddress: 'Uttara, Dhaka',
  permanentAddress: 'Comilla',
  phone: '01800000000',
  admissionDate: '2026-02-01',
  enrollment: { classId: class6.id, sectionId: sectionA.id },
  guardians: [{ guardian: { fullName: 'Guardian One', phone: '01900000000' }, relationship: 'Mother', isPrimary: true }],
  ...overrides,
});

beforeAll(async () => {
  admin = bearer(await tokenFor('SCHOOL_ADMIN'));
  const superToken = bearer(await tokenFor('SUPER_ADMIN'));
  const { data: schools } = (await api().get('/api/schools').set(superToken)).body;
  superAdmin = { ...superToken, 'X-School-Id': schools[0].id };
  const { classes } = (await api().get('/api/classes').set(admin)).body.data;
  class6 = classes.find((c) => c.name === 'Class 6');
  class7 = classes.find((c) => c.name === 'Class 7');
  sectionA = class6.sections.find((s) => s.name === 'A');
  sectionB = class6.sections.find((s) => s.name === 'B');
});

afterAll(() => prisma.$disconnect());

describe('POST /api/students', () => {
  it('creates a student with a generated ID, next roll number and guardian', async () => {
    const res = await api().post('/api/students').set(admin).send(studentPayload({ fullName: 'Ayesha Siddiqua' }));
    expect(res.status).toBe(201);
    const s = res.body.data;
    expect(s.studentCode).toMatch(/^STU-2026-\d{4}$/);
    expect(s.studentCode).not.toBe('STU-2026-0001'); // seeded IDs are skipped
    expect(s.enrollments[0].class.name).toBe('Class 6');
    expect(s.enrollments[0].rollNumber).toBeGreaterThan(4);
    expect(s.guardians[0].isPrimary).toBe(true);
  });

  it('returns 409 DUPLICATE_STUDENT_ID for an ID already in use', async () => {
    const res = await api().post('/api/students').set(admin).send(studentPayload({ studentCode: 'STU-2026-0001' }));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DUPLICATE_STUDENT_ID');
  });

  it('returns 404 CLASS_NOT_FOUND for a class that does not exist', async () => {
    const res = await api()
      .post('/api/students')
      .set(superAdmin)
      .send(studentPayload({ enrollment: { classId: 'missing', sectionId: sectionA.id } }));
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('CLASS_NOT_FOUND');
  });

  it('rejects a section from a different class', async () => {
    const res = await api()
      .post('/api/students')
      .set(superAdmin)
      .send(studentPayload({ enrollment: { classId: class7.id, sectionId: sectionA.id } }));
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('SECTION_NOT_FOUND');
  });

  it('rejects a roll number already taken in the section', async () => {
    const res = await api()
      .post('/api/students')
      .set(superAdmin)
      .send(studentPayload({ enrollment: { classId: class6.id, sectionId: sectionA.id, rollNumber: 1 } }));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DUPLICATE_ROLL_NUMBER');
  });

  it('allows the same roll number in a different section', async () => {
    const res = await api()
      .post('/api/students')
      .set(superAdmin)
      .send(studentPayload({ enrollment: { classId: class6.id, sectionId: sectionB.id, rollNumber: 40 } }));
    expect(res.status).toBe(201);
  });

  it('validates required fields and the date of birth', async () => {
    const res = await api()
      .post('/api/students')
      .set(superAdmin)
      .send(studentPayload({ fullName: '', dateOfBirth: '2999-01-01', guardians: [] }));
    expect(res.status).toBe(400);
    const fields = res.body.error.details.map((d) => d.field);
    expect(fields).toEqual(expect.arrayContaining(['fullName', 'dateOfBirth', 'guardians']));
  });

  it('enforces section capacity', async () => {
    await api().patch(`/api/sections/${sectionB.id}`).set(admin).send({ capacity: 40 });
    const tiny = await api().post(`/api/classes/${class7.id}/sections`).set(admin).send({ name: 'T', capacity: 1 });
    const sectionT = tiny.body.data.sections.find((s) => s.name === 'T');
    const first = await api()
      .post('/api/students')
      .set(admin)
      .send(studentPayload({ enrollment: { classId: class7.id, sectionId: sectionT.id } }));
    expect(first.status).toBe(201);
    const second = await api()
      .post('/api/students')
      .set(admin)
      .send(studentPayload({ enrollment: { classId: class7.id, sectionId: sectionT.id } }));
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('SECTION_CAPACITY_EXCEEDED');
  });

  it('creates student and parent logins in one go', async () => {
    const studentEmail = uniqueEmail('kid');
    const parentEmail = uniqueEmail('mum');
    const res = await api()
      .post('/api/students')
      .set(admin)
      .send(
        studentPayload({
          email: studentEmail,
          account: { password: 'Study@2026' },
          guardians: [
            {
              guardian: { fullName: 'Login Parent', phone: '01911111111', email: parentEmail },
              relationship: 'Mother',
              isPrimary: true,
              account: { password: 'Parent@2026' },
            },
          ],
        }),
      );
    expect(res.status).toBe(201);
    expect(res.body.data.user.email).toBe(studentEmail);

    const parentToken = bearer(await tokenFor(parentEmail, 'Parent@2026'));
    const dash = await api().get('/api/dashboard/summary').set(parentToken);
    expect(dash.body.data.children.map((c) => c.id)).toEqual([res.body.data.id]);
  });
});

describe('student updates, transfer and deactivation', () => {
  let studentId;

  beforeAll(async () => {
    const res = await api().post('/api/students').set(admin).send(studentPayload({ fullName: 'Movable Student' }));
    studentId = res.body.data.id;
  });

  it('updates profile fields', async () => {
    const res = await api().patch(`/api/students/${studentId}`).set(admin).send({ bloodGroup: 'O+', previousSchool: 'Sunrise School' });
    expect(res.status).toBe(200);
    expect(res.body.data.bloodGroup).toBe('O+');
  });

  it('transfers the student to another section within the year', async () => {
    const res = await api().put(`/api/students/${studentId}/enrollment`).set(admin).send({ classId: class6.id, sectionId: sectionB.id });
    expect(res.status).toBe(200);
    const detail = await api().get(`/api/students/${studentId}`).set(admin);
    const current = detail.body.data.enrollments.find((e) => e.academicYear.status === 'ACTIVE');
    expect(current.section.name).toBe('B');
    expect(detail.body.data.enrollments.filter((e) => e.academicYear.status === 'ACTIVE')).toHaveLength(1);
  });

  it('deactivates via DELETE and drops out of the active list', async () => {
    const del = await api().delete(`/api/students/${studentId}`).set(admin);
    expect(del.status).toBe(200);
    expect(del.body.data.status).toBe('INACTIVE');

    const active = await api().get('/api/students?search=Movable').set(admin);
    expect(active.body.data).toHaveLength(0);
    const all = await api().get('/api/students?search=Movable&status=ALL').set(admin);
    expect(all.body.data).toHaveLength(1);
  });

  it('searches and filters by class and section', async () => {
    const res = await api().get(`/api/students?classId=${class6.id}&sectionId=${sectionA.id}&limit=100`).set(admin);
    expect(res.status).toBe(200);
    expect(res.body.data.every((s) => s.enrollment.section.name === 'A')).toBe(true);
    const byName = await api().get('/api/students?search=nadia').set(admin);
    expect(byName.body.data[0].fullName).toBe('Nadia Sultana');
  });

  it('exports CSV with a header row and neutralised formulas', async () => {
    await api().post('/api/students').set(admin).send(studentPayload({ fullName: '=HYPERLINK("x")' }));
    const res = await api().get('/api/students/export?status=ALL').set(admin);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.text).toMatch(/"Student ID","Full name"/);
    expect(res.text).toContain(`"'=HYPERLINK(""x"")"`);
  });
});

describe('teacher access to students', () => {
  it('only lists students in the teacher’s classes and blocks others with 403', async () => {
    // A fresh teacher with no classes.
    const email = uniqueEmail('newteach');
    await api()
      .post('/api/teachers')
      .set(superAdmin)
      .send({ fullName: 'No Classes', designation: 'Teacher', phone: '01700000009', email, joiningDate: '2025-01-01', account: { password: 'Teach@2026' } });
    const lonely = bearer(await tokenFor(email, 'Teach@2026'));
    expect((await api().get('/api/students').set(lonely)).body.data).toHaveLength(0);

    const someone = (await api().get('/api/students').set(admin)).body.data[0];
    const res = await api().get(`/api/students/${someone.id}`).set(lonely);
    expect(res.status).toBe(403);

    // The seeded teacher is class teacher of 6-A, so sees those students.
    const classTeacher = bearer(await tokenFor('TEACHER'));
    const theirs = await api().get('/api/students').set(classTeacher);
    expect(theirs.body.data.length).toBeGreaterThan(0);
    expect((await api().post('/api/students').set(classTeacher).send(studentPayload())).status).toBe(403);
  });
});

describe('teachers and staff', () => {
  it('creates a teacher with a generated employee ID and subjects', async () => {
    const subjects = (await api().get('/api/subjects').set(admin)).body.data;
    const res = await api()
      .post('/api/teachers')
      .set(superAdmin)
      .send({
        fullName: 'Shamima Nasrin',
        designation: 'Lecturer',
        department: 'Science',
        phone: '01700000010',
        email: 'shamima@ratonpur.test',
        joiningDate: '2025-06-01',
        salary: 40000,
        subjectIds: [subjects[0].id],
      });
    expect(res.status).toBe(201);
    expect(res.body.data.employeeCode).toMatch(/^EMP-\d{4}$/);
    expect(res.body.data.subjects).toHaveLength(1);
  });

  it('rejects a duplicate employee ID across teachers and staff', async () => {
    const teacherDup = await api()
      .post('/api/teachers')
      .set(superAdmin)
      .send({ employeeCode: 'EMP-0003', fullName: 'X', designation: 'T', phone: '01700000011', email: 'x@ratonpur.test', joiningDate: '2025-01-01' });
    expect(teacherDup.status).toBe(409);
    expect(teacherDup.body.error.code).toBe('DUPLICATE_EMPLOYEE_ID');

    const staffDup = await api()
      .post('/api/staff')
      .set(admin)
      .send({ employeeCode: 'EMP-0001', fullName: 'Y', designation: 'Guard', phone: '01700000012', joiningDate: '2025-01-01' });
    expect(staffDup.status).toBe(409);
  });

  it('rejects unknown subjects with 404 SUBJECT_NOT_FOUND', async () => {
    const res = await api()
      .post('/api/teachers')
      .set(superAdmin)
      .send({ fullName: 'Z', designation: 'T', phone: '01700000013', email: 'z@ratonpur.test', joiningDate: '2025-01-01', subjectIds: ['nope'] });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('SUBJECT_NOT_FOUND');
  });

  it('shows salary to admins only', async () => {
    const asAdmin = (await api().get('/api/teachers').set(admin)).body.data;
    expect(asAdmin.find((t) => t.employeeCode === 'EMP-0001').salary).toBe('45000');

    const asTeacher = (await api().get('/api/teachers').set(bearer(await tokenFor('TEACHER')))).body.data;
    expect(asTeacher.every((t) => !('salary' in t))).toBe(true);
    const one = await api().get(`/api/teachers/${asTeacher[0].id}`).set(bearer(await tokenFor('TEACHER')));
    expect('salary' in one.body.data).toBe(false);
  });

  it('reports workload for the current year', async () => {
    const list = (await api().get('/api/teachers?search=Farhana').set(admin)).body.data;
    expect(list[0]._count.sectionsAsClassTchr).toBeGreaterThanOrEqual(1);
  });

  it('deactivating a teacher also disables their login', async () => {
    const email = uniqueEmail('leaving');
    const created = await api()
      .post('/api/teachers')
      .set(superAdmin)
      .send({ fullName: 'Leaving Soon', designation: 'T', phone: '01700000014', email, joiningDate: '2025-01-01', account: { password: 'Teach@2026' } });
    const token = bearer(await tokenFor(email, 'Teach@2026'));
    await api().patch(`/api/teachers/${created.body.data.id}`).set(superAdmin).send({ status: 'RESIGNED' });
    expect((await api().get('/api/auth/me').set(token)).status).toBe(401);
  });

  it('creates a login for an existing teacher and links it to the profile', async () => {
    const created = await api()
      .post('/api/teachers')
      .set(superAdmin)
      .send({ fullName: 'Late Login', designation: 'T', phone: '01700000015', email: uniqueEmail('late'), joiningDate: '2025-01-01' });
    const id = created.body.data.id;
    const res = await api().post(`/api/teachers/${id}/account`).set(superAdmin).send({ password: 'Teach@2026' });
    expect(res.status).toBe(201);
    expect(res.body.data.user.email).toBe(created.body.data.email);

    const again = await api().post(`/api/teachers/${id}/account`).set(superAdmin).send({ password: 'Teach@2026' });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('ACCOUNT_EXISTS');

    const token = bearer(await tokenFor(created.body.data.email, 'Teach@2026'));
    const dash = await api().get('/api/dashboard/summary').set(token);
    expect(dash.body.data.profile.employeeCode).toBe(created.body.data.employeeCode);
  });

  it('needs an email on the student before creating a student login', async () => {
    const student = (await api().get('/api/students?search=Rakib').set(admin)).body.data[0];
    const res = await api().post(`/api/students/${student.id}/account`).set(admin).send({ password: 'Study@2026' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('EMAIL_REQUIRED');
  });

  it('keeps non-teaching staff admin-only', async () => {
    expect((await api().get('/api/staff').set(admin)).status).toBe(200);
    expect((await api().get('/api/staff').set(bearer(await tokenFor('TEACHER')))).status).toBe(403);
  });
});
