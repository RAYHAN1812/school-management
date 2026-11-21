import { Prisma } from '@prisma/client';

/**
 * Atomically increment and return a per-school counter. A single
 * INSERT … ON CONFLICT statement is race-free, unlike read-then-write.
 */
export async function nextSequence(tx, schoolId, key) {
  const rows = await tx.$queryRaw(
    Prisma.sql`INSERT INTO id_sequences ("schoolId", "key", "value") VALUES (${schoolId}, ${key}, 1)
               ON CONFLICT ("schoolId", "key") DO UPDATE SET "value" = id_sequences."value" + 1
               RETURNING "value"`,
  );
  return Number(rows[0].value);
}

const pad = (n, width = 4) => String(n).padStart(width, '0');

/** STU-<admission year>-0001, skipping codes already used (e.g. imported manually). */
export async function generateStudentCode(tx, schoolId, admissionDate) {
  const year = new Date(admissionDate).getUTCFullYear();
  for (;;) {
    const code = `STU-${year}-${pad(await nextSequence(tx, schoolId, `STUDENT-${year}`))}`;
    const taken = await tx.student.findUnique({ where: { schoolId_studentCode: { schoolId, studentCode: code } } });
    if (!taken) return code;
  }
}

/** EMP-0001 — one series shared by teachers and non-teaching staff. */
export async function generateEmployeeCode(tx, schoolId) {
  for (;;) {
    const code = `EMP-${pad(await nextSequence(tx, schoolId, 'EMPLOYEE'))}`;
    if (!(await isEmployeeCodeTaken(tx, schoolId, code))) return code;
  }
}

export async function isEmployeeCodeTaken(tx, schoolId, employeeCode, { exceptTeacherId, exceptStaffId } = {}) {
  const [teacher, staff] = await Promise.all([
    tx.teacher.findFirst({ where: { schoolId, employeeCode, ...(exceptTeacherId ? { id: { not: exceptTeacherId } } : {}) } }),
    tx.staff.findFirst({ where: { schoolId, employeeCode, ...(exceptStaffId ? { id: { not: exceptStaffId } } : {}) } }),
  ]);
  return Boolean(teacher || staff);
}
