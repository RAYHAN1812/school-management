import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/config/prisma.js';
import { api, bearer, tokenFor, uniqueEmail } from './helpers.js';

// A fixed past date inside the 2026 academic year that the seed never fills.
const DAY = '2026-10-05';

let admin;
let superAdmin;
let teacher; // Farhana: Maths/Science in Class 6, class teacher of 6-A
let class6;
let class7;
let sectionA;
let sectionB;
let subjects;
let teachers;

beforeAll(async () => {
  admin = bearer(await tokenFor('SCHOOL_ADMIN'));
  const superToken = bearer(await tokenFor('SUPER_ADMIN'));
  const { data: schools } = (await api().get('/api/schools').set(superToken)).body;
  superAdmin = { ...superToken, 'X-School-Id': schools[0].id };
  teacher = bearer(await tokenFor('TEACHER'));
  const { classes } = (await api().get('/api/classes').set(admin)).body.data;
  class6 = classes.find((c) => c.name === 'Class 6');
  class7 = classes.find((c) => c.name === 'Class 7');
  sectionA = class6.sections.find((s) => s.name === 'A');
  sectionB = class6.sections.find((s) => s.name === 'B');
  subjects = Object.fromEntries((await api().get('/api/subjects').set(admin)).body.data.map((s) => [s.code, s]));
  teachers = (await api().get('/api/teachers?status=ACTIVE').set(admin)).body.data;
});

afterAll(() => prisma.$disconnect());

async function sheet(token, section = sectionA, date = DAY) {
  return api().get(`/api/attendance/sheet?classId=${class6.id}&sectionId=${section.id}&date=${date}`).set(token);
}

describe('attendance', () => {
  it('returns an unmarked sheet with the section roster in roll order', async () => {
    const res = await sheet(teacher);
    expect(res.status).toBe(200);
    expect(res.body.data.taken).toBe(false);
    const rolls = res.body.data.students.map((s) => s.rollNumber);
    expect(rolls).toEqual([...rolls].sort((a, b) => a - b));
    expect(res.body.data.students.every((s) => s.status === null)).toBe(true);
  });

  it('saves attendance, then rejects a duplicate with 409 ATTENDANCE_ALREADY_EXISTS', async () => {
    const roster = (await sheet(teacher)).body.data.students;
    const records = roster.map((s, i) => ({ studentId: s.studentId, status: i === 0 ? 'ABSENT' : 'PRESENT' }));
    const body = { classId: class6.id, sectionId: sectionA.id, date: DAY, records };

    const first = await api().post('/api/attendance').set(teacher).send(body);
    expect(first.status).toBe(201);
    expect(first.body.data.saved).toBe(roster.length);

    const dup = await api().post('/api/attendance').set(teacher).send(body);
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('ATTENDANCE_ALREADY_EXISTS');

    const after = await sheet(teacher);
    expect(after.body.data.taken).toBe(true);
    expect(after.body.data.students[0].status).toBe('ABSENT');
  });

  it('updates a day that was already taken', async () => {
    const roster = (await sheet(teacher)).body.data.students;
    const res = await api()
      .put('/api/attendance')
      .set(teacher)
      .send({ classId: class6.id, sectionId: sectionA.id, date: DAY, records: [{ studentId: roster[0].studentId, status: 'LATE', remarks: 'Bus delay' }] });
    expect(res.status).toBe(200);
    expect(res.body.data.updated).toBe(1);

    const one = await api().patch(`/api/attendance/${roster[1].attendanceId}`).set(teacher).send({ status: 'LEAVE' });
    expect(one.status).toBe(200);
    expect(one.body.data.status).toBe('LEAVE');
  });

  it('rejects students who are not in the section', async () => {
    const otherSection = (await sheet(admin, sectionB)).body.data.students;
    const res = await api()
      .post('/api/attendance')
      .set(superAdmin)
      .send({ classId: class6.id, sectionId: sectionA.id, date: '2026-10-06', records: [{ studentId: otherSection[0].studentId, status: 'PRESENT' }] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('STUDENT_NOT_IN_SECTION');
  });

  it('rejects future dates and dates outside the academic year', async () => {
    const roster = (await sheet(admin)).body.data.students;
    const records = [{ studentId: roster[0].studentId, status: 'PRESENT' }];
    const future = await api().post('/api/attendance').set(admin).send({ classId: class6.id, sectionId: sectionA.id, date: '2099-01-01', records });
    expect(future.status).toBe(400);
    const outside = await api().post('/api/attendance').set(admin).send({ classId: class6.id, sectionId: sectionA.id, date: '2025-06-01', records });
    expect(outside.status).toBe(400);
    expect(outside.body.error.code).toBe('DATE_OUTSIDE_ACADEMIC_YEAR');
  });

  it('stops teachers marking classes they do not teach, and students/parents entirely', async () => {
    const email = uniqueEmail('other');
    await api()
      .post('/api/teachers')
      .set(superAdmin)
      .send({ fullName: 'Other Teacher', designation: 'T', phone: '01700000020', email, joiningDate: '2025-01-01', account: { password: 'Teach@2026' } });
    const outsider = bearer(await tokenFor(email, 'Teach@2026'));
    expect((await sheet(outsider)).status).toBe(403);
    expect((await sheet(bearer(await tokenFor('STUDENT')))).status).toBe(403);
    expect((await sheet(bearer(await tokenFor('PARENT')))).status).toBe(403);
  });

  it('produces a daily report with counts and who was absent', async () => {
    const res = await api().get(`/api/attendance/reports?type=daily&classId=${class6.id}&date=${DAY}`).set(admin);
    expect(res.status).toBe(200);
    const a = res.body.data.sections.find((s) => s.section.name === 'A');
    expect(a.late).toBe(1);
    expect(a.leave).toBe(1);
    expect(a.notPresent.map((n) => n.status)).toEqual(['LEAVE']);
  });

  it('produces a monthly report with attendance percentages and a CSV download', async () => {
    const res = await api()
      .get(`/api/attendance/reports?type=monthly&classId=${class6.id}&sectionId=${sectionA.id}&month=2026-10`)
      .set(teacher);
    expect(res.status).toBe(200);
    expect(res.body.data.schoolDays).toBe(1);
    const late = res.body.data.students.find((s) => s.late === 1);
    expect(late.percentage).toBe(100); // late still counts as present
    const leave = res.body.data.students.find((s) => s.leave === 1);
    expect(leave.percentage).toBe(0);

    const csv = await api()
      .get(`/api/attendance/reports?type=monthly&classId=${class6.id}&sectionId=${sectionA.id}&month=2026-10&format=csv`)
      .set(teacher);
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    expect(csv.text).toMatch(/"Attendance %"/);
  });

  it('lets a parent see only their own child’s attendance', async () => {
    const parent = bearer(await tokenFor('PARENT'));
    const dash = await api().get('/api/dashboard/summary').set(parent);
    const childId = dash.body.data.children[0].id;
    const mine = await api().get(`/api/students/${childId}/attendance`).set(parent);
    expect(mine.status).toBe(200);
    expect(mine.body.data.summary.total).toBeGreaterThan(0);

    const roster = (await sheet(admin, sectionB)).body.data.students;
    const other = await api().get(`/api/students/${roster[0].studentId}/attendance`).set(parent);
    expect(other.status).toBe(403);
    expect(other.body.error.code).toBe('FORBIDDEN');
  });
});

describe('timetable', () => {
  const farhana = () => teachers.find((t) => t.employeeCode === 'EMP-0001');
  const mahmudul = () => teachers.find((t) => t.employeeCode === 'EMP-0002');
  const entry = (overrides) => ({
    classId: class6.id,
    sectionId: sectionA.id,
    subjectId: subjects.MATH.id,
    teacherId: farhana().id,
    dayOfWeek: 'SATURDAY',
    startTime: '12:00',
    endTime: '12:45',
    ...overrides,
  });

  it('creates a period and defaults the room to the section’s room', async () => {
    const res = await api().post('/api/timetables').set(admin).send(entry());
    expect(res.status).toBe(201);
    expect(res.body.data.startTime).toBe('12:00');
    expect(res.body.data.roomNumber).toBe('201');
  });

  it('allows a back-to-back period', async () => {
    const res = await api().post('/api/timetables').set(admin).send(entry({ subjectId: subjects.SCI.id, startTime: '12:45', endTime: '13:30' }));
    expect(res.status).toBe(201);
  });

  it('rejects two subjects in the same section at the same time (409 TIMETABLE_CONFLICT)', async () => {
    const res = await api()
      .post('/api/timetables')
      .set(admin)
      .send(entry({ subjectId: subjects.ENG.id, teacherId: mahmudul().id, startTime: '12:30', endTime: '13:00' }));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('TIMETABLE_CONFLICT');
    expect(res.body.error.details.conflicts[0].type).toBe('SECTION');
  });

  it('rejects a teacher teaching two classes at once', async () => {
    const res = await api()
      .post('/api/timetables')
      .set(admin)
      .send(entry({ sectionId: sectionB.id, roomNumber: '999', startTime: '12:15', endTime: '12:30' }));
    expect(res.status).toBe(409);
    expect(res.body.error.details.conflicts.map((c) => c.type)).toContain('TEACHER');
  });

  it('rejects one room for two classes at once', async () => {
    const res = await api()
      .post('/api/timetables')
      .set(admin)
      .send(entry({ classId: class7.id, sectionId: class7.sections[0].id, teacherId: mahmudul().id, subjectId: subjects.ENG.id, roomNumber: '201' }));
    expect(res.status).toBe(409);
    expect(res.body.error.details.conflicts.map((c) => c.type)).toContain('ROOM');
  });

  it('rejects a subject the class does not study, and end before start', async () => {
    const ict = await api().post('/api/subjects').set(admin).send({ name: 'Robotics', code: 'ROBO' });
    const notTaught = await api().post('/api/timetables').set(admin).send(entry({ subjectId: ict.body.data.id, dayOfWeek: 'FRIDAY' }));
    expect(notTaught.status).toBe(400);
    expect(notTaught.body.error.code).toBe('SUBJECT_NOT_IN_CLASS');

    const backwards = await api().post('/api/timetables').set(admin).send(entry({ dayOfWeek: 'FRIDAY', startTime: '10:00', endTime: '09:00' }));
    expect(backwards.status).toBe(400);
  });

  it('checks conflicts on update too, but not against the entry itself', async () => {
    const list = (await api().get(`/api/timetables?sectionId=${sectionA.id}&dayOfWeek=SATURDAY`).set(admin)).body.data;
    const [first, second] = list;
    const same = await api().patch(`/api/timetables/${first.id}`).set(admin).send({ roomNumber: '201' });
    expect(same.status).toBe(200);
    const clash = await api().patch(`/api/timetables/${second.id}`).set(admin).send({ startTime: '12:30' });
    expect(clash.status).toBe(409);
    expect((await api().delete(`/api/timetables/${second.id}`).set(admin)).status).toBe(200);
  });

  it('gives teachers, students and parents their own routine', async () => {
    const mine = await api().get('/api/timetables/me').set(teacher);
    expect(mine.status).toBe(200);
    expect(mine.body.data.entries.every((e) => e.teacher.employeeCode === 'EMP-0001')).toBe(true);
    expect(mine.body.data.entries.length).toBeGreaterThan(0);

    const student = await api().get('/api/timetables/me').set(bearer(await tokenFor('STUDENT')));
    expect(student.body.data.entries.every((e) => e.section.name === 'A')).toBe(true);

    const parent = bearer(await tokenFor('PARENT'));
    const childId = (await api().get('/api/dashboard/summary').set(parent)).body.data.children[0].id;
    expect((await api().get(`/api/timetables/me?studentId=${childId}`).set(parent)).status).toBe(200);
    // Teachers/admins only for the full listing.
    expect((await api().get('/api/timetables').set(parent)).status).toBe(403);
  });

  it('limits teacher timetable listing to their own teaching entries', async () => {
    const class7Detail = (await api().get(`/api/classes/${class7.id}`).set(admin)).body.data;
    const assigned = class7Detail.classSubjects[0];
    const otherEntry = await prisma.timetable.create({
      data: {
        schoolId: class7.schoolId,
        academicYearId: class7.academicYearId,
        classId: class7.id,
        sectionId: class7.sections[0].id,
        subjectId: assigned.subjectId,
        teacherId: mahmudul().id,
        dayOfWeek: 'MONDAY',
        startMinute: 480,
        endMinute: 525,
        roomNumber: '992',
      },
    });
    expect((await api().get(`/api/timetables?teacherId=${mahmudul().id}`).set(admin)).body.data.some((row) => row.id === otherEntry.id)).toBe(true);

    const teacherRows = await api().get(`/api/timetables?teacherId=${mahmudul().id}`).set(teacher);
    expect(teacherRows.status).toBe(200);
    expect(teacherRows.body.data.some((row) => row.id === otherEntry.id)).toBe(false);
    expect(teacherRows.body.data.every((row) => row.teacher.employeeCode === 'EMP-0001')).toBe(true);
  });

  it('is managed by admins only', async () => {
    const res = await api().post('/api/timetables').set(teacher).send(entry({ dayOfWeek: 'FRIDAY' }));
    expect(res.status).toBe(403);
  });
});
