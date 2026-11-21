import { prisma } from '../config/prisma.js';
import { AppError } from '../utils/AppError.js';
import { audit } from '../utils/audit.js';

export function listSchools() {
  return prisma.school.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { users: true, students: true, teachers: true } } },
  });
}

export async function createSchool(data, actor, ctx) {
  const exists = await prisma.school.findUnique({ where: { code: data.code } });
  if (exists) throw AppError.conflict('DUPLICATE_SCHOOL_CODE', 'A school with this code already exists');

  const school = await prisma.school.create({ data });
  await audit({ action: 'SCHOOL_CREATED', entity: 'School', entityId: school.id, actor, schoolId: school.id, ...ctx });
  return school;
}
