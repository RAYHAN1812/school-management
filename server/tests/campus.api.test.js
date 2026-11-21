import fs from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/config/prisma.js';
import { uploadDir } from '../src/services/upload.service.js';
import { daysOverdue, libraryFine } from '../src/utils/calculations.js';
import { api, bearer, tokenFor } from './helpers.js';

let admin;
let teacher; // Farhana: Maths & Science in Class 6
let student; // Arif: Class 6-A
let parent;
let unassignedTeacher;
let class6;
let class7;
let subjects;
let homeworkFileUrl;
const uploadedFileUrls = [];

const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');

beforeAll(async () => {
  admin = bearer(await tokenFor('SCHOOL_ADMIN'));
  teacher = bearer(await tokenFor('TEACHER'));
  student = bearer(await tokenFor('STUDENT'));
  parent = bearer(await tokenFor('PARENT'));
  const { classes } = (await api().get('/api/classes').set(admin)).body.data;
  class6 = classes.find((c) => c.name === 'Class 6');
  class7 = classes.find((c) => c.name === 'Class 7');
  subjects = Object.fromEntries((await api().get('/api/subjects').set(admin)).body.data.map((s) => [s.code, s]));
  const teachers = (await api().get('/api/teachers').set(admin)).body.data;
  const farhana = teachers.find((t) => t.employeeCode === 'EMP-0001');
  const mahmudul = teachers.find((t) => t.employeeCode === 'EMP-0002');
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
  const superToken = bearer(await tokenFor('SUPER_ADMIN'));
  const schools = (await api().get('/api/schools').set(superToken)).body.data;
  const superAdmin = { ...superToken, 'X-School-Id': schools[0].id };
  const outsiderEmail = `campus-outsider.${Date.now()}@edumanage.test`;
  await api()
    .post('/api/teachers')
    .set(superAdmin)
    .send({ fullName: 'Unassigned Campus Teacher', designation: 'Teacher', phone: '01700000033', email: outsiderEmail, joiningDate: '2025-01-01', account: { password: 'Teach@2026' } });
  unassignedTeacher = bearer(await tokenFor(outsiderEmail, 'Teach@2026'));
});

afterAll(async () => {
  for (const url of uploadedFileUrls) {
    const filename = url.split('/').pop();
    await prisma.$executeRaw`DELETE FROM "uploaded_files" WHERE "filename" = ${filename}`;
    await fs.unlink(path.join(uploadDir(), filename)).catch(() => {});
  }
  await prisma.$disconnect();
});

describe('file uploads', () => {
  it('accepts a real PDF and serves it only to its uploader until shared by a record', async () => {
    const up = await api().post('/api/uploads').set(teacher).attach('file', PDF, { filename: 'worksheet.pdf', contentType: 'application/pdf' });
    expect(up.status).toBe(201);
    uploadedFileUrls.push(up.body.data.url);
    expect(up.body.data.url).toMatch(/^\/api\/files\/[a-f0-9]{32}\.pdf$/);
    expect((await api().get(up.body.data.url)).status).toBe(401);
    homeworkFileUrl = up.body.data.url;
    const owner = await api().get(homeworkFileUrl).set(teacher);
    expect(owner.status).toBe(200);
    expect((await api().get(homeworkFileUrl).set(student)).status).toBe(403);
    expect((await api().get(homeworkFileUrl).set(admin)).status).toBe(200);
    const dl = owner;
    expect(dl.headers['content-disposition']).toMatch(/attachment/);
  });

  it('rejects disallowed types, spoofed content and oversized files', async () => {
    const exe = await api().post('/api/uploads').set(teacher).attach('file', Buffer.from('MZ'), { filename: 'virus.exe', contentType: 'application/octet-stream' });
    expect(exe.status).toBe(400);
    expect(exe.body.error.code).toBe('INVALID_FILE_TYPE');

    const fake = await api().post('/api/uploads').set(teacher).attach('file', Buffer.from('<script>alert(1)</script>'), { filename: 'x.pdf', contentType: 'application/pdf' });
    expect(fake.status).toBe(400);
    expect(fake.body.error.code).toBe('INVALID_FILE_TYPE');

    const big = await api().post('/api/uploads').set(teacher).attach('file', Buffer.concat([PDF, Buffer.alloc(5 * 1024 * 1024)]), { filename: 'big.pdf', contentType: 'application/pdf' });
    expect(big.status).toBe(413);
    expect(big.body.error.code).toBe('FILE_TOO_LARGE');
  });

  it('refuses path traversal and unknown names', async () => {
    expect((await api().get('/api/files/..%2F..%2F.env').set(admin)).status).toBe(404);
    expect((await api().get(`/api/files/${'a'.repeat(32)}.pdf`).set(admin)).status).toBe(404);
  });

  it('only allows our own uploads as attachments', async () => {
    const res = await api()
      .post('/api/notices')
      .set(admin)
      .send({ title: 'Link', description: 'x', attachmentUrl: 'javascript:alert(1)' });
    expect(res.status).toBe(400);
  });
});

describe('homework', () => {
  let assignmentId;

  it('lets a subject teacher set homework for their class', async () => {
    const res = await api()
      .post('/api/assignments')
      .set(teacher)
      .send({ classId: class6.id, subjectId: subjects.MATH.id, title: 'Algebra practice', description: 'Page 12, Q1–10', dueDate: new Date(Date.now() + 3 * 86400000).toISOString(), totalMarks: 10, attachmentUrl: homeworkFileUrl });
    expect(res.status).toBe(201);
    assignmentId = res.body.data.id;
    expect(res.body.data.teacher.fullName).toBe('Farhana Akter');
  });

  it("stops a teacher setting homework for a subject they don't teach", async () => {
    const res = await api()
      .post('/api/assignments')
      .set(teacher)
      .send({ classId: class6.id, subjectId: subjects.ENG.id, title: 'Essay', description: 'x', dueDate: new Date().toISOString() });
    expect(res.status).toBe(403);
  });

  it('accepts one submission from a student in the class, then 409 ALREADY_SUBMITTED', async () => {
    const list = await api().get('/api/assignments').set(student);
    const mine = list.body.data.find((a) => a.id === assignmentId);
    expect(mine.mySubmission).toBeNull();
    expect((await api().get(homeworkFileUrl).set(student)).status).toBe(200);
    expect((await api().get(homeworkFileUrl).set(unassignedTeacher)).status).toBe(403);

    const first = await api().post(`/api/assignments/${assignmentId}/submissions`).set(student).send({ content: 'My answers' });
    expect(first.status).toBe(201);
    expect(first.body.data.isLate).toBe(false);
    const again = await api().post(`/api/assignments/${assignmentId}/submissions`).set(student).send({ content: 'Changed my mind' });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('ALREADY_SUBMITTED');
  });

  it('marks a submission after the deadline as late, and allows resubmission when enabled', async () => {
    const late = await api()
      .post('/api/assignments')
      .set(admin)
      .send({ classId: class6.id, subjectId: subjects.SCI.id, title: 'Overdue', description: 'x', dueDate: new Date(Date.now() - 86400000).toISOString(), allowResubmission: true });
    const first = await api().post(`/api/assignments/${late.body.data.id}/submissions`).set(student).send({ content: 'Sorry, late' });
    expect(first.body.data).toMatchObject({ isLate: true, status: 'LATE' });
    const second = await api().post(`/api/assignments/${late.body.data.id}/submissions`).set(student).send({ content: 'Improved' });
    expect(second.status).toBe(201);
    expect(second.body.data.version).toBe(2);
  });

  it('refuses homework from another class (403 NOT_YOUR_CLASS)', async () => {
    const upload = await api().post('/api/uploads').set(admin).attach('file', PDF, { filename: 'class7-homework.pdf', contentType: 'application/pdf' });
    expect(upload.status).toBe(201);
    uploadedFileUrls.push(upload.body.data.url);
    const other = await api()
      .post('/api/assignments')
      .set(admin)
      .send({ classId: class7.id, subjectId: subjects.ENG.id, teacherId: (await api().get('/api/teachers?search=Mahmudul').set(admin)).body.data[0].id, title: 'Class 7 only', description: 'x', dueDate: new Date(Date.now() + 86400000).toISOString(), attachmentUrl: upload.body.data.url });
    expect(other.status).toBe(201);
    const res = await api().post(`/api/assignments/${other.body.data.id}/submissions`).set(student).send({ content: 'hi' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('NOT_YOUR_CLASS');
    expect((await api().get('/api/assignments').set(student)).body.data.some((a) => a.id === other.body.data.id)).toBe(false);
    expect((await api().get(upload.body.data.url).set(student)).status).toBe(403);
  });

  it('lets the teacher see who submitted and grade within the total marks', async () => {
    const res = await api().get(`/api/assignments/${assignmentId}/submissions`).set(teacher);
    expect(res.status).toBe(200);
    expect(res.body.data.summary.submitted).toBe(1);
    const sub = res.body.data.rows.find((r) => r.submission).submission;
    expect((await api().patch(`/api/submissions/${sub.id}/grade`).set(teacher).send({ marks: 11 })).status).toBe(400);
    const ok = await api().patch(`/api/submissions/${sub.id}/grade`).set(teacher).send({ marks: 9, feedback: 'Good' });
    expect(ok.body.data.status).toBe('GRADED');
  });

  it('shows parents their child’s homework', async () => {
    const childId = (await api().get('/api/portal/students').set(parent)).body.data[0].id;
    const res = await api().get(`/api/assignments?studentId=${childId}`).set(parent);
    expect(res.status).toBe(200);
    expect(res.body.data.some((a) => a.id === assignmentId)).toBe(true);
    expect((await api().get(homeworkFileUrl).set(parent)).status).toBe(200);
  });
});

describe('notices', () => {
  const titles = async (token) => (await api().get('/api/notices?limit=100').set(token)).body.data.map((n) => n.title);

  it('targets the right audience', async () => {
    expect(await titles(parent)).toEqual(expect.arrayContaining(['Parent–teacher meeting', 'Winter vacation', 'Class 6 science fair']));
    expect(await titles(student)).not.toContain('Parent–teacher meeting');
    expect(await titles(student)).toContain('Class 6 science fair');
    expect(await titles(teacher)).toContain('Staff meeting');
    expect(await titles(parent)).not.toContain('Staff meeting');
  });

  it('hides drafts, future and expired notices', async () => {
    await api().post('/api/notices').set(admin).send({ title: 'Future one', description: 'x', publishDate: new Date(Date.now() + 86400000).toISOString() });
    await api().post('/api/notices').set(admin).send({ title: 'Old one', description: 'x', publishDate: new Date(Date.now() - 10 * 86400000).toISOString(), expiryDate: new Date(Date.now() - 86400000).toISOString() });
    const seen = await titles(student);
    expect(seen).not.toContain('Annual sports day (draft)');
    expect(seen).not.toContain('Future one');
    expect(seen).not.toContain('Old one');
  });

  it('does not show Class 7 notices to a Class 6 family', async () => {
    await api().post('/api/notices').set(admin).send({ title: 'Class 7 trip', description: 'x', audience: 'CLASS', classId: class7.id });
    expect(await titles(parent)).not.toContain('Class 7 trip');
  });

  it('tracks read status', async () => {
    const before = (await api().get('/api/notices').set(parent)).body;
    const target = before.data.find((n) => !n.read);
    await api().post(`/api/notices/${target.id}/read`).set(parent);
    const after = (await api().get('/api/notices').set(parent)).body;
    expect(after.meta.unread).toBe(before.meta.unread - 1);
  });

  it('lets teachers post only to their own classes', async () => {
    expect((await api().post('/api/notices').set(teacher).send({ title: 'Everyone', description: 'x', audience: 'ALL' })).status).toBe(403);
    expect((await api().post('/api/notices').set(teacher).send({ title: 'Mine', description: 'x', audience: 'CLASS', classId: class7.id })).status).toBe(403);
    expect((await api().post('/api/notices').set(teacher).send({ title: 'Class 6 test', description: 'x', audience: 'CLASS', classId: class6.id })).status).toBe(201);
    expect((await api().post('/api/notices').set(parent).send({ title: 'x', description: 'x' })).status).toBe(403);
  });

  it('revalidates changed class targets and shares attachments only with the notice audience', async () => {
    const upload = await api().post('/api/uploads').set(teacher).attach('file', PDF, { filename: 'class-notice.pdf', contentType: 'application/pdf' });
    expect(upload.status).toBe(201);
    uploadedFileUrls.push(upload.body.data.url);
    const created = await api().post('/api/notices').set(teacher).send({
      title: 'Class attachment',
      description: 'For Class 6 only',
      audience: 'CLASS',
      classId: class6.id,
      attachmentUrl: upload.body.data.url,
    });
    expect(created.status).toBe(201);

    const changed = await api().patch(`/api/notices/${created.body.data.id}`).set(teacher).send({ classId: class7.id });
    expect(changed.status).toBe(403);
    expect((await api().patch(`/api/notices/${created.body.data.id}`).set(teacher).send({ classId: class6.id })).status).toBe(200);
    expect((await api().get(upload.body.data.url).set(student)).status).toBe(200);
    expect((await api().get(upload.body.data.url).set(parent)).status).toBe(200);
    expect((await api().get(upload.body.data.url).set(unassignedTeacher)).status).toBe(403);

    const privateUpload = await api().post('/api/uploads').set(admin).attach('file', PDF, { filename: 'private-class7.pdf', contentType: 'application/pdf' });
    expect(privateUpload.status).toBe(201);
    uploadedFileUrls.push(privateUpload.body.data.url);
    const class7Notice = await api().post('/api/notices').set(admin).send({
      title: 'Class 7 attachment',
      description: 'For Class 7 only',
      audience: 'CLASS',
      classId: class7.id,
      attachmentUrl: privateUpload.body.data.url,
    });
    expect(class7Notice.status).toBe(201);
    expect((await api().get(privateUpload.body.data.url).set(student)).status).toBe(403);
  });
});

describe('library', () => {
  const studentIdOf = async (name) => (await api().get(`/api/students?search=${name}`).set(admin)).body.data[0].id;

  it('calculates overdue fines per day', () => {
    expect(daysOverdue('2026-01-10', '2026-01-10')).toBe(0);
    expect(daysOverdue('2026-01-10', '2026-01-13')).toBe(3);
    expect(libraryFine('2026-01-10', '2026-01-13', 5)).toBe(15);
    expect(libraryFine('2026-01-10', '2026-01-05', 5)).toBe(0);
  });

  it('issues a book, refuses when no copy is left (409 NO_COPIES_AVAILABLE), and restocks on return', async () => {
    const book = (await api().post('/api/books').set(admin).send({ title: 'Single copy', author: 'Test', totalCopies: 1 })).body.data;
    expect(book.bookCode).toMatch(/^BK-\d{5}$/);
    const a = await studentIdOf('Nadia');
    const b = await studentIdOf('Rakib');

    const issued = await api().post(`/api/books/${book.id}/issue`).set(admin).send({ studentId: a });
    expect(issued.status).toBe(201);
    const none = await api().post(`/api/books/${book.id}/issue`).set(admin).send({ studentId: b });
    expect(none.status).toBe(409);
    expect(none.body.error.code).toBe('NO_COPIES_AVAILABLE');

    const back = await api().post(`/api/books/${book.id}/return`).set(admin).send({ studentId: a });
    expect(back.status).toBe(200);
    expect(back.body.data.status).toBe('RETURNED');
    const after = (await api().get(`/api/books?search=Single copy`).set(admin)).body.data[0];
    expect(after.availableCopies).toBe(1);
  });

  it("refuses to return a book that wasn't issued to the student", async () => {
    const book = (await api().post('/api/books').set(admin).send({ title: 'Never lent', author: 'Test', totalCopies: 2 })).body.data;
    const res = await api().post(`/api/books/${book.id}/return`).set(admin).send({ studentId: await studentIdOf('Imran') });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('NOT_ISSUED_TO_STUDENT');
  });

  it('enforces the per-student borrowing limit', async () => {
    const sid = await studentIdOf('Sumaiya');
    for (let i = 0; i < 3; i += 1) {
      const book = (await api().post('/api/books').set(admin).send({ title: `Limit ${i}`, author: 'Test', totalCopies: 1 })).body.data;
      expect((await api().post(`/api/books/${book.id}/issue`).set(admin).send({ studentId: sid })).status).toBe(201);
    }
    const fourth = (await api().post('/api/books').set(admin).send({ title: 'Limit 3', author: 'Test', totalCopies: 1 })).body.data;
    const res = await api().post(`/api/books/${fourth.id}/issue`).set(admin).send({ studentId: sid });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('BORROW_LIMIT_REACHED');
  });

  it('shows a parent their child’s loans with fines so far', async () => {
    const childId = (await api().get('/api/portal/students').set(parent)).body.data[0].id;
    const res = await api().get(`/api/students/${childId}/library`).set(parent);
    expect(res.status).toBe(200);
    expect(res.body.data.rules.maxBooksPerStudent).toBe(3);
  });
});

describe('transport', () => {
  it('creates a bus and route, assigns students, and enforces bus capacity', async () => {
    const bus = await api().post('/api/buses').set(admin).send({ busNumber: 'mini-1', capacity: 1 });
    expect(bus.status).toBe(201);
    expect(bus.body.data.busNumber).toBe('MINI-1');
    const route = await api()
      .post('/api/transport-routes')
      .set(admin)
      .send({ routeCode: 'r9', name: 'Test route', pickupPoints: ['Stop A', 'Stop B'], busId: bus.body.data.id, monthlyFee: 1000 });
    expect(route.status).toBe(201);

    const students = (await api().get('/api/students?limit=3').set(admin)).body.data;
    const first = await api().post(`/api/transport-routes/${route.body.data.id}/students`).set(admin).send({ studentId: students[1].id, pickupPoint: 'Stop A' });
    expect(first.status).toBe(201);
    const full = await api().post(`/api/transport-routes/${route.body.data.id}/students`).set(admin).send({ studentId: students[2].id });
    expect(full.status).toBe(409);
    expect(full.body.error.code).toBe('BUS_FULL');

    const badStop = await api().post(`/api/transport-routes/${route.body.data.id}/students`).set(admin).send({ studentId: students[1].id, pickupPoint: 'Nowhere' });
    expect(badStop.status).toBe(400);
  });

  it('shows a parent their child’s route', async () => {
    const childId = (await api().get('/api/portal/students').set(parent)).body.data[0].id;
    const res = await api().get(`/api/students/${childId}/transport`).set(parent);
    expect(res.status).toBe(200);
    expect(res.body.data.route.name).toBe('Mirpur – Dhanmondi');
    expect((await api().get('/api/buses').set(parent)).status).toBe(403);
  });

  it('keeps library and transport admin-only for writes', async () => {
    expect((await api().post('/api/books').set(teacher).send({ title: 'x', author: 'y', totalCopies: 1 })).status).toBe(403);
    expect((await api().post('/api/buses').set(teacher).send({ busNumber: 'x', capacity: 1 })).status).toBe(403);
  });
});
