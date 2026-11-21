/**
 * Idempotent seed: roles, default grading scale, one demo school and one
 * demo account per role (with linked teacher/student/guardian profiles).
 * Safe to run repeatedly — existing records are left as they are.
 *
 * Set a private DEMO_PASSWORD before running this against a demo database.
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { ROLE_DEFINITIONS } from '../src/config/roles.js';
import { subjectResult } from '../src/utils/calculations.js';
import { isStrongPassword } from '../src/utils/password.js';

const prisma = new PrismaClient();

export const DEMO_SCHOOL_CODE = 'GIS';
export const DEMO_ACCOUNTS = {
  SUPER_ADMIN: { email: 'superadmin@edumanage.test', username: 'superadmin', fullName: 'Sadia Rahman' },
  SCHOOL_ADMIN: { email: 'admin@edumanage.test', username: 'schooladmin', fullName: 'Tanvir Hossain' },
  TEACHER: { email: 'teacher@edumanage.test', username: 'teacher', fullName: 'Farhana Akter' },
  STUDENT: { email: 'student@edumanage.test', username: 'student', fullName: 'Arif Chowdhury' },
  PARENT: { email: 'parent@edumanage.test', username: 'parent', fullName: 'Kamal Chowdhury' },
};

const GRADE_SCALE = [
  { grade: 'A+', min: 80, max: 100, gp: 5.0 },
  { grade: 'A', min: 70, max: 79.99, gp: 4.0 },
  { grade: 'A-', min: 60, max: 69.99, gp: 3.5 },
  { grade: 'B', min: 50, max: 59.99, gp: 3.0 },
  { grade: 'C', min: 40, max: 49.99, gp: 2.0 },
  { grade: 'D', min: 33, max: 39.99, gp: 1.0 },
  { grade: 'F', min: 0, max: 32.99, gp: 0.0 },
];

export async function seed(client = prisma) {
  const demoPassword = process.env.DEMO_PASSWORD;
  if (!isStrongPassword(demoPassword ?? '')) {
    throw new Error('Set DEMO_PASSWORD to a strong value before running the demo seed.');
  }

  // Roles
  for (const role of ROLE_DEFINITIONS) {
    await client.role.upsert({
      where: { key: role.key },
      update: { name: role.name, description: role.description, permissions: role.permissions },
      create: role,
    });
  }

  // Demo school
  const school = await client.school.upsert({
    where: { code: DEMO_SCHOOL_CODE },
    update: {
      name: 'Ratonpur Central School',
      address: null,
      phone: null,
      email: null,
    },
    create: {
      name: 'Ratonpur Central School',
      code: DEMO_SCHOOL_CODE,
    },
  });

  for (const g of GRADE_SCALE) {
    await client.gradeScale.upsert({
      where: { schoolId_grade: { schoolId: school.id, grade: g.grade } },
      update: {},
      create: { schoolId: school.id, grade: g.grade, minPercent: g.min, maxPercent: g.max, gradePoint: g.gp },
    });
  }

  // Demo users
  const passwordHash = await bcrypt.hash(demoPassword, 10);
  const users = {};
  for (const [roleKey, acc] of Object.entries(DEMO_ACCOUNTS)) {
    users[roleKey] = await client.user.upsert({
      where: { email: acc.email },
      update: {},
      create: {
        email: acc.email,
        username: acc.username,
        fullName: acc.fullName,
        passwordHash,
        role: { connect: { key: roleKey } },
        ...(roleKey === 'SUPER_ADMIN' ? {} : { school: { connect: { id: school.id } } }),
      },
    });
  }

  // Academic structure needed to give the demo profiles something to show.
  const year = await client.academicYear.upsert({
    where: { schoolId_name: { schoolId: school.id, name: '2026' } },
    update: {},
    create: {
      schoolId: school.id,
      name: '2026',
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-12-31'),
      status: 'ACTIVE',
    },
  });

  const subjects = {};
  for (const s of [
    { code: 'BAN', name: 'Bangla' },
    { code: 'ENG', name: 'English' },
    { code: 'MATH', name: 'Mathematics' },
    { code: 'SCI', name: 'General Science', hasPractical: true },
  ]) {
    subjects[s.code] = await client.subject.upsert({
      where: { schoolId_code: { schoolId: school.id, code: s.code } },
      update: {},
      create: { schoolId: school.id, ...s },
    });
  }

  const teacher = await client.teacher.upsert({
    where: { userId: users.TEACHER.id },
    update: {},
    create: {
      schoolId: school.id,
      userId: users.TEACHER.id,
      employeeCode: 'EMP-0001',
      fullName: DEMO_ACCOUNTS.TEACHER.fullName,
      designation: 'Senior Teacher',
      department: 'Science',
      phone: '+880 1711-111111',
      email: DEMO_ACCOUNTS.TEACHER.email,
      joiningDate: new Date('2020-01-15'),
      employmentType: 'FULL_TIME',
      salary: 45000,
      subjects: { create: [{ subjectId: subjects.MATH.id }, { subjectId: subjects.SCI.id }] },
    },
  });

  const klass = await client.class.upsert({
    where: { schoolId_academicYearId_name: { schoolId: school.id, academicYearId: year.id, name: 'Class 6' } },
    update: {},
    create: { schoolId: school.id, academicYearId: year.id, name: 'Class 6', numericLevel: 6, capacity: 80 },
  });

  const section = await client.section.upsert({
    where: { classId_name: { classId: klass.id, name: 'A' } },
    update: {},
    create: { classId: klass.id, name: 'A', capacity: 40, roomNumber: '201', classTeacherId: teacher.id },
  });

  for (const [name, numericLevel] of [
    ['Play Group', -2],
    ['Nursery', -1],
    ['KG', 0],
    ...Array.from({ length: 5 }, (_, i) => [`Class ${i + 1}`, i + 1]),
    ['Class 9', 9],
    ['Class 10', 10],
  ]) {
    const demoClass = await client.class.upsert({
      where: { schoolId_academicYearId_name: { schoolId: school.id, academicYearId: year.id, name } },
      update: {},
      create: { schoolId: school.id, academicYearId: year.id, name, numericLevel, capacity: 80 },
    });
    await client.section.upsert({
      where: { classId_name: { classId: demoClass.id, name: 'A' } },
      update: {},
      create: { classId: demoClass.id, name: 'A', capacity: 40 },
    });
  }

  for (const code of ['BAN', 'ENG', 'MATH', 'SCI']) {
    await client.classSubject.upsert({
      where: { classId_subjectId: { classId: klass.id, subjectId: subjects[code].id } },
      update: {},
      create: {
        classId: klass.id,
        subjectId: subjects[code].id,
        teacherId: ['MATH', 'SCI'].includes(code) ? teacher.id : null,
      },
    });
  }

  const student = await client.student.upsert({
    where: { userId: users.STUDENT.id },
    update: {},
    create: {
      schoolId: school.id,
      userId: users.STUDENT.id,
      studentCode: 'STU-2026-0001',
      fullName: DEMO_ACCOUNTS.STUDENT.fullName,
      dateOfBirth: new Date('2014-03-12'),
      gender: 'MALE',
      bloodGroup: 'B+',
      presentAddress: 'Mirpur 10, Dhaka',
      permanentAddress: 'Sylhet Sadar, Sylhet',
      phone: '+880 1722-222222',
      admissionDate: new Date('2026-01-05'),
    },
  });
  // Keep the student-code counter ahead of the seeded student.
  await client.idSequence.upsert({
    where: { schoolId_key: { schoolId: school.id, key: 'STUDENT-2026' } },
    update: {},
    create: { schoolId: school.id, key: 'STUDENT-2026', value: 1 },
  });

  await client.enrollment.upsert({
    where: { studentId_academicYearId: { studentId: student.id, academicYearId: year.id } },
    update: {},
    create: {
      schoolId: school.id,
      studentId: student.id,
      academicYearId: year.id,
      classId: klass.id,
      sectionId: section.id,
      rollNumber: 1,
    },
  });

  const guardian = await client.guardian.upsert({
    where: { userId: users.PARENT.id },
    update: {},
    create: {
      schoolId: school.id,
      userId: users.PARENT.id,
      fullName: DEMO_ACCOUNTS.PARENT.fullName,
      phone: '+880 1733-333333',
      email: DEMO_ACCOUNTS.PARENT.email,
      occupation: 'Businessman',
    },
  });

  await client.studentGuardian.upsert({
    where: { studentId_guardianId: { studentId: student.id, guardianId: guardian.id } },
    update: {},
    create: { studentId: student.id, guardianId: guardian.id, relationship: 'Father', isPrimary: true },
  });

  await seedMoreDemoData(client, { school, year, subjects, klass, section, teacher });
  return { school, users };
}

/**
 * A fuller demo: a second section and teacher, Class 7, an upcoming 2027 year
 * (to try promotion), a few more students and one non-teaching staff member.
 * Records without login accounts.
 */
async function seedMoreDemoData(client, { school, year, subjects, klass, section, teacher }) {
  const schoolId = school.id;

  const teacher2 = await client.teacher.upsert({
    where: { schoolId_employeeCode: { schoolId, employeeCode: 'EMP-0002' } },
    update: {},
    create: {
      schoolId,
      employeeCode: 'EMP-0002',
      fullName: 'Mahmudul Hasan',
      designation: 'Assistant Teacher',
      department: 'Languages',
      phone: '+880 1744-444444',
      email: 'mahmudul.hasan@ratonpur.test',
      joiningDate: new Date('2022-07-01'),
      salary: 32000,
      subjects: { create: [{ subjectId: subjects.ENG.id }, { subjectId: subjects.BAN.id }] },
    },
  });

  await client.staff.upsert({
    where: { schoolId_employeeCode: { schoolId, employeeCode: 'EMP-0003' } },
    update: {},
    create: {
      schoolId,
      employeeCode: 'EMP-0003',
      fullName: 'Rafiq Islam',
      designation: 'Accountant',
      department: 'Administration',
      phone: '+880 1755-555555',
      joiningDate: new Date('2019-03-10'),
      salary: 28000,
    },
  });

  // Teacher 2 teaches English and Bangla in Class 6.
  for (const code of ['ENG', 'BAN']) {
    await client.classSubject.update({
      where: { classId_subjectId: { classId: klass.id, subjectId: subjects[code].id } },
      data: { teacherId: teacher2.id },
    });
  }

  const section6B = await client.section.upsert({
    where: { classId_name: { classId: klass.id, name: 'B' } },
    update: {},
    create: { classId: klass.id, name: 'B', capacity: 40, roomNumber: '202', classTeacherId: teacher2.id },
  });

  const class7 = await client.class.upsert({
    where: { schoolId_academicYearId_name: { schoolId, academicYearId: year.id, name: 'Class 7' } },
    update: {},
    create: {
      schoolId,
      academicYearId: year.id,
      name: 'Class 7',
      numericLevel: 7,
      capacity: 80,
      sections: { create: [{ name: 'A', capacity: 40, roomNumber: '301' }] },
      classSubjects: { create: Object.values(subjects).map((s) => ({ subjectId: s.id })) },
    },
  });

  // Upcoming year, so Class 6 can be promoted into 2027's Class 7.
  const year2027 = await client.academicYear.upsert({
    where: { schoolId_name: { schoolId, name: '2027' } },
    update: {},
    create: { schoolId, name: '2027', startDate: new Date('2027-01-01'), endDate: new Date('2027-12-31'), status: 'UPCOMING' },
  });
  await client.class.upsert({
    where: { schoolId_academicYearId_name: { schoolId, academicYearId: year2027.id, name: 'Class 7' } },
    update: {},
    create: {
      schoolId,
      academicYearId: year2027.id,
      name: 'Class 7',
      numericLevel: 7,
      capacity: 80,
      sections: { create: [{ name: 'A', capacity: 40 }, { name: 'B', capacity: 40 }] },
      classSubjects: { create: Object.values(subjects).map((s) => ({ subjectId: s.id })) },
    },
  });

  const more = [
    { code: 'STU-2026-0002', name: 'Nadia Sultana', gender: 'FEMALE', dob: '2014-07-21', sec: section, roll: 2, guardian: ['Shirin Sultana', 'Mother', '+880 1811-000002'] },
    { code: 'STU-2026-0003', name: 'Rakib Hasan', gender: 'MALE', dob: '2014-01-09', sec: section, roll: 3, guardian: ['Habib Hasan', 'Father', '+880 1811-000003'] },
    { code: 'STU-2026-0004', name: 'Tasnim Ahmed', gender: 'FEMALE', dob: '2013-11-30', sec: section, roll: 4, guardian: ['Jamal Ahmed', 'Father', '+880 1811-000004'] },
    { code: 'STU-2026-0005', name: 'Imran Kabir', gender: 'MALE', dob: '2014-05-02', sec: section6B, roll: 1, guardian: ['Ruma Kabir', 'Mother', '+880 1811-000005'] },
    { code: 'STU-2026-0006', name: 'Sumaiya Akter', gender: 'FEMALE', dob: '2014-09-14', sec: section6B, roll: 2, guardian: ['Abdul Karim', 'Father', '+880 1811-000006'] },
    { code: 'STU-2026-0007', name: 'Fahim Rahman', gender: 'MALE', dob: '2014-02-18', sec: section6B, roll: 3, guardian: ['Nasima Rahman', 'Mother', '+880 1811-000007'] },
  ];

  for (const s of more) {
    const exists = await client.student.findUnique({ where: { schoolId_studentCode: { schoolId, studentCode: s.code } } });
    if (exists) continue;
    const [gName, relationship, gPhone] = s.guardian;
    await client.student.create({
      data: {
        schoolId,
        studentCode: s.code,
        fullName: s.name,
        dateOfBirth: new Date(s.dob),
        gender: s.gender,
        presentAddress: 'Dhaka',
        permanentAddress: 'Dhaka',
        phone: gPhone,
        admissionDate: new Date('2026-01-05'),
        enrollments: {
          create: { schoolId, academicYearId: year.id, classId: klass.id, sectionId: s.sec.id, rollNumber: s.roll },
        },
        guardians: {
          create: { relationship, isPrimary: true, guardian: { create: { schoolId, fullName: gName, phone: gPhone } } },
        },
      },
    });
  }

  await seedExams(client, { schoolId, year, subjects, klass, markerEmail: 'teacher@edumanage.test' });
  await seedFinance(client, { schoolId, year, klass });
  await seedCampus(client, { schoolId, klass, section, subjects, teacher });
  await seedTimetableAndAttendance(client, { schoolId, year, subjects, klass, sections: [section, section6B], teachers: { MATH: teacher, SCI: teacher, ENG: teacher2, BAN: teacher2 } });

  // Keep generated IDs ahead of the seeded ones.
  await client.$executeRaw`
    INSERT INTO id_sequences ("schoolId", "key", "value") VALUES (${schoolId}, 'STUDENT-2026', 7), (${schoolId}, 'EMPLOYEE', 3)
    ON CONFLICT ("schoolId", "key") DO UPDATE SET "value" = GREATEST(id_sequences."value", EXCLUDED."value")`;

  return { class7, teacher };
}

/**
 * Sunday–Thursday routine for Class 6 A/B (no teacher or room clashes) and
 * attendance for the last two school weeks, so reports have data to show.
 */
async function seedTimetableAndAttendance(client, { schoolId, year, subjects, klass, sections, teachers }) {
  const periods = [
    [480, 525], // 08:00–08:45
    [525, 570], // 08:45–09:30
    [585, 630], // 09:45–10:30 (after break)
    [630, 675], // 10:30–11:15
  ];
  const plan = { A: ['MATH', 'ENG', 'SCI', 'BAN'], B: ['ENG', 'MATH', 'BAN', 'SCI'] };
  for (const section of sections) {
    if (await client.timetable.count({ where: { sectionId: section.id } })) continue;
    const rows = [];
    for (const day of ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY']) {
      plan[section.name].forEach((code, i) => {
        rows.push({
          schoolId,
          academicYearId: year.id,
          classId: klass.id,
          sectionId: section.id,
          subjectId: subjects[code].id,
          teacherId: teachers[code].id,
          dayOfWeek: day,
          startMinute: periods[i][0],
          endMinute: periods[i][1],
          roomNumber: section.roomNumber,
        });
      });
    }
    await client.timetable.createMany({ data: rows });
  }

  // Attendance: previous 14 days, skipping Friday/Saturday (the weekend in Bangladesh).
  const marker = await client.user.findFirst({ where: { email: 'teacher@edumanage.test' } });
  const enrollments = await client.enrollment.findMany({
    where: { classId: klass.id, status: 'ACTIVE', sectionId: { in: sections.map((s) => s.id) } },
  });
  const today = new Date();
  const rows = [];
  for (let back = 1; back <= 14; back += 1) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - back));
    if ([5, 6].includes(d.getUTCDay()) || d < year.startDate || d > year.endDate) continue;
    enrollments.forEach((e, i) => {
      // Deterministic, mostly-present pattern.
      const n = (i * 7 + back * 3) % 17;
      const status = n === 0 ? 'ABSENT' : n === 5 ? 'LATE' : n === 11 && back % 2 ? 'LEAVE' : 'PRESENT';
      rows.push({ schoolId, studentId: e.studentId, classId: klass.id, sectionId: e.sectionId, date: d, status, markedById: marker.id });
    });
  }
  if (rows.length) await client.attendance.createMany({ data: rows, skipDuplicates: true });
}

/** A published First Term (with marks) and a Midterm awaiting marks, for Class 6. */
async function seedExams(client, { schoolId, year, subjects, klass, markerEmail }) {
  if (await client.exam.count({ where: { classId: klass.id } })) return;
  const marker = await client.user.findFirst({ where: { email: markerEmail } });
  const codes = ['BAN', 'ENG', 'MATH', 'SCI'];
  const scale = (await client.gradeScale.findMany({ where: { schoolId } })).map((g) => ({
    grade: g.grade, minPercent: Number(g.minPercent), maxPercent: Number(g.maxPercent), gradePoint: Number(g.gradePoint),
  }));

  const firstTerm = await client.exam.create({
    data: {
      schoolId,
      academicYearId: year.id,
      classId: klass.id,
      name: 'First Term',
      startDate: new Date('2026-04-12'),
      endDate: new Date('2026-04-20'),
      status: 'PUBLISHED',
      publishedAt: new Date('2026-05-02'),
      publishedById: marker.id,
      subjects: {
        create: codes.map((code, i) => ({
          subjectId: subjects[code].id,
          examDate: new Date(Date.UTC(2026, 3, 12 + i * 2)),
          fullMarks: 100,
          passMarks: 33,
          writtenMarks: 70,
          mcqMarks: 30,
        })),
      },
    },
    include: { subjects: true },
  });

  await client.exam.create({
    data: {
      schoolId,
      academicYearId: year.id,
      classId: klass.id,
      name: 'Midterm',
      startDate: new Date('2026-08-16'),
      endDate: new Date('2026-08-24'),
      status: 'COMPLETED',
      subjects: { create: codes.map((code) => ({ subjectId: subjects[code].id, fullMarks: 100, passMarks: 33 })) },
    },
  });

  const enrollments = await client.enrollment.findMany({ where: { classId: klass.id, status: 'ACTIVE' }, orderBy: { rollNumber: 'asc' } });
  const rows = [];
  enrollments.forEach((e, i) => {
    firstTerm.subjects.forEach((es, j) => {
      // Deterministic spread of scores; one student fails Bangla.
      const score = i === 2 && j === 0 ? 25 : 45 + ((i * 13 + j * 17) % 55);
      const written = Math.round(score * 0.7);
      const mcq = score - written;
      const r = subjectResult({ written, mcq }, es, scale);
      rows.push({
        examSubjectId: es.id,
        studentId: e.studentId,
        written,
        mcq,
        total: r.total,
        percentage: r.percentage,
        grade: r.grade,
        gradePoint: r.gradePoint,
        resultStatus: r.resultStatus,
        enteredById: marker.id,
      });
    });
  });
  await client.mark.createMany({ data: rows });
}

/** Fee types, a fee structure for 2026, and Class 6 invoices/payments for Oct–Nov. */
async function seedFinance(client, { schoolId, year, klass }) {
  const types = {};
  for (const [code, name] of [
    ['ADMISSION', 'Admission fee'],
    ['TUITION', 'Monthly tuition'],
    ['EXAM', 'Examination fee'],
    ['TRANSPORT', 'Transport fee'],
    ['LAB', 'Laboratory fee'],
  ]) {
    types[code] = await client.feeType.upsert({
      where: { schoolId_code: { schoolId, code } },
      update: {},
      create: { schoolId, code, name },
    });
  }
  if (await client.feeStructure.count({ where: { schoolId } })) return;

  const structure = {};
  for (const [code, amount, frequency, classId] of [
    ['ADMISSION', 5000, 'ONE_TIME', null],
    ['TUITION', 2500, 'MONTHLY', null],
    ['EXAM', 800, 'TERM', null],
    ['LAB', 1500, 'YEARLY', klass.id],
  ]) {
    structure[code] = await client.feeStructure.create({
      data: { schoolId, academicYearId: year.id, classId, feeTypeId: types[code].id, amount, frequency, dueDay: 10 },
    });
  }

  const admin = await client.user.findFirst({ where: { email: 'admin@edumanage.test' } });
  const enrollments = await client.enrollment.findMany({ where: { classId: klass.id, status: 'ACTIVE' }, orderBy: { rollNumber: 'asc' } });
  let inv = 0;
  let rcpt = 0;
  for (const [i, e] of enrollments.entries()) {
    const bills = [
      { code: 'TUITION', period: '2026-10', due: '2026-10-10', paid: 2500 },
      // November: some paid, some partly paid, some not yet.
      { code: 'TUITION', period: '2026-11', due: '2026-11-10', paid: i % 3 === 0 ? 0 : i % 3 === 1 ? 2500 : 1000 },
      { code: 'EXAM', period: null, due: '2026-04-05', paid: 800 },
    ];
    for (const b of bills) {
      inv += 1;
      const amount = Number(structure[b.code].amount);
      const invoice = await client.invoice.create({
        data: {
          schoolId,
          invoiceNumber: `INV-2026-${String(inv).padStart(5, '0')}`,
          studentId: e.studentId,
          academicYearId: year.id,
          feeTypeId: types[b.code].id,
          feeStructureId: structure[b.code].id,
          billingPeriod: b.period,
          description: `${types[b.code].name}${b.period ? ` — ${b.period}` : ''}`,
          amount,
          netAmount: amount,
          paidAmount: b.paid,
          dueDate: new Date(b.due),
          status: b.paid === 0 ? 'UNPAID' : b.paid >= amount ? 'PAID' : 'PARTIALLY_PAID',
          createdById: admin.id,
        },
      });
      if (b.paid > 0) {
        rcpt += 1;
        await client.payment.create({
          data: {
            schoolId,
            invoiceId: invoice.id,
            studentId: e.studentId,
            amount: b.paid,
            method: i % 2 ? 'BKASH' : 'CASH',
            transactionRef: i % 2 ? `BK${8000000 + rcpt}` : null,
            receiptNumber: `RCPT-2026-${String(rcpt).padStart(5, '0')}`,
            status: 'SUCCESS',
            paidAt: new Date(new Date(b.due).getTime() - 2 * 86400000),
            receivedById: admin.id,
          },
        });
      }
    }
  }
  await client.$executeRaw`
    INSERT INTO id_sequences ("schoolId", "key", "value") VALUES (${schoolId}, 'INVOICE-2026', ${inv}), (${schoolId}, 'RECEIPT-2026', ${rcpt})
    ON CONFLICT ("schoolId", "key") DO UPDATE SET "value" = GREATEST(id_sequences."value", EXCLUDED."value")`;
}

/** Notices, homework, library books/loans and one bus route. */
async function seedCampus(client, { schoolId, klass, section, subjects, teacher }) {
  if (await client.notice.count({ where: { schoolId } })) return;
  const admin = await client.user.findFirst({ where: { email: 'admin@edumanage.test' } });
  const teacherUser = await client.user.findFirst({ where: { email: 'teacher@edumanage.test' } });
  const day = (offset) => new Date(Date.now() + offset * 86400000);

  await client.notice.createMany({
    data: [
      { schoolId, title: 'Winter vacation', description: 'The school will remain closed from 20 December to 1 January. Classes resume on 2 January.', audience: 'ALL', status: 'PUBLISHED', publishDate: day(-3), createdById: admin.id },
      { schoolId, title: 'Parent–teacher meeting', description: 'Parents of all classes are invited on Saturday at 10:00 in the main hall to discuss First Term results.', audience: 'PARENTS', status: 'PUBLISHED', publishDate: day(-1), expiryDate: day(14), createdById: admin.id },
      { schoolId, title: 'Class 6 science fair', description: 'Class 6 students should bring their science projects on Thursday. Groups of up to three.', audience: 'CLASS', classId: klass.id, status: 'PUBLISHED', publishDate: day(-2), createdById: teacherUser.id },
      { schoolId, title: 'Staff meeting', description: 'All teachers: staff meeting on Sunday after the last period.', audience: 'TEACHERS', status: 'PUBLISHED', publishDate: day(-1), createdById: admin.id },
      { schoolId, title: 'Annual sports day (draft)', description: 'Details to be confirmed.', audience: 'ALL', status: 'DRAFT', publishDate: day(5), createdById: admin.id },
    ],
  });

  const math = await client.assignment.create({
    data: {
      schoolId, classId: klass.id, sectionId: null, subjectId: subjects.MATH.id, teacherId: teacher.id,
      title: 'Fractions worksheet', description: 'Solve questions 1–20 on page 45 of the textbook. Show your working.',
      assignedDate: day(-7), dueDate: day(-2), totalMarks: 20, allowResubmission: false,
    },
  });
  await client.assignment.create({
    data: {
      schoolId, classId: klass.id, sectionId: section.id, subjectId: subjects.SCI.id, teacherId: teacher.id,
      title: 'Plant cell diagram', description: 'Draw and label a plant cell. Upload a photo of your drawing.',
      assignedDate: day(-1), dueDate: day(4), totalMarks: 10, allowResubmission: true,
    },
  });
  const firstStudents = await client.enrollment.findMany({ where: { classId: klass.id, status: 'ACTIVE' }, orderBy: { rollNumber: 'asc' }, take: 3 });
  for (const [i, e] of firstStudents.entries()) {
    await client.submission.create({
      data: {
        assignmentId: math.id, studentId: e.studentId, content: 'Answers attached in class notebook.',
        submittedAt: day(i === 2 ? -1 : -3), isLate: i === 2, status: i === 0 ? 'GRADED' : i === 2 ? 'LATE' : 'SUBMITTED',
        marks: i === 0 ? 18 : null, feedback: i === 0 ? 'Well done!' : null, gradedById: i === 0 ? teacherUser.id : null, gradedAt: i === 0 ? day(-1) : null,
      },
    });
  }

  const books = [
    ['BK-00001', '9789849000011', 'Amar Boi: Bangla Path', 'NCTB', 'Textbook', 5],
    ['BK-00002', '9780141439518', 'Pride and Prejudice', 'Jane Austen', 'Fiction', 2],
    ['BK-00003', '9780439023528', 'The Hunger Games', 'Suzanne Collins', 'Fiction', 3],
    ['BK-00004', '9789849000028', 'Mathematics for Class 6', 'NCTB', 'Textbook', 4],
    ['BK-00005', '9780553380163', 'A Brief History of Time', 'Stephen Hawking', 'Science', 1],
  ];
  const created = [];
  for (const [bookCode, isbn, title, author, category, copies] of books) {
    created.push(await client.book.create({ data: { schoolId, bookCode, isbn, title, author, category, totalCopies: copies, availableCopies: copies } }));
  }
  // Two loans: one on time, one overdue.
  for (const [book, e, issued, due] of [
    [created[1], firstStudents[0], -5, 9],
    [created[4], firstStudents[1], -20, -6],
  ]) {
    await client.bookIssue.create({ data: { schoolId, bookId: book.id, studentId: e.studentId, issuedById: admin.id, issueDate: day(issued), dueDate: day(due), status: 'ISSUED' } });
    await client.book.update({ where: { id: book.id }, data: { availableCopies: { decrement: 1 } } });
  }
  await client.$executeRaw`
    INSERT INTO id_sequences ("schoolId", "key", "value") VALUES (${schoolId}, 'BOOK', 5)
    ON CONFLICT ("schoolId", "key") DO UPDATE SET "value" = GREATEST(id_sequences."value", EXCLUDED."value")`;

  const driver = await client.staff.create({
    data: { schoolId, employeeCode: 'EMP-0004', fullName: 'Jalal Uddin', designation: 'Driver', department: 'Transport', phone: '+880 1766-666666', joiningDate: new Date('2021-02-01') },
  });
  const bus = await client.bus.create({ data: { schoolId, busNumber: 'BUS-1', registrationNumber: 'DHAKA METRO-JA-11-2233', capacity: 30, driverId: driver.id, driverName: driver.fullName, driverPhone: driver.phone } });
  const route = await client.transportRoute.create({
    data: { schoolId, routeCode: 'R1', name: 'Mirpur – Dhanmondi', pickupPoints: ['Mirpur 10', 'Shyamoli', 'Asad Gate'], dropOffPoints: ['School gate'], busId: bus.id, monthlyFee: 1500 },
  });
  await client.transportAssignment.create({ data: { studentId: firstStudents[0].studentId, routeId: route.id, pickupPoint: 'Mirpur 10', startDate: new Date('2026-01-10') } });
  await client.$executeRaw`
    INSERT INTO id_sequences ("schoolId", "key", "value") VALUES (${schoolId}, 'EMPLOYEE', 4)
    ON CONFLICT ("schoolId", "key") DO UPDATE SET "value" = GREATEST(id_sequences."value", EXCLUDED."value")`;
}

// Run directly: `node prisma/seed.js`
const isDirectRun = process.argv[1]?.replace(/\\/g, '/').endsWith('prisma/seed.js');
if (isDirectRun) {
  seed()
    .then(() => {
      console.log('Seed complete. Demo accounts:');
      for (const [role, acc] of Object.entries(DEMO_ACCOUNTS)) console.log(`  ${role.padEnd(13)} ${acc.email}`);
    })
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
