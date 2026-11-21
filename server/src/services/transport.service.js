import { prisma } from '../config/prisma.js';
import { AppError } from '../utils/AppError.js';
import { audit } from '../utils/audit.js';
import { assertCanViewStudent } from './access.service.js';

const busInclude = { driver: { select: { id: true, fullName: true, phone: true } } };

// ───────────────────────── Buses ─────────────────────────

export async function listBuses(schoolId) {
  const buses = await prisma.bus.findMany({
    where: { schoolId },
    orderBy: { busNumber: 'asc' },
    include: { ...busInclude, routes: { select: { id: true, name: true, _count: { select: { assignments: true } } } } },
  });
  return buses.map((b) => ({ ...b, riders: b.routes.reduce((a, r) => a + r._count.assignments, 0) }));
}

async function validateDriver(schoolId, driverId) {
  if (!driverId) return;
  const driver = await prisma.staff.findFirst({ where: { id: driverId, schoolId } });
  if (!driver) throw AppError.notFound('STAFF_NOT_FOUND', 'Driver not found among staff');
  if (driver.status !== 'ACTIVE') throw AppError.conflict('STAFF_INACTIVE', `${driver.fullName} is not active`);
}

export async function createBus(schoolId, data, actor, ctx) {
  if (await prisma.bus.findUnique({ where: { schoolId_busNumber: { schoolId, busNumber: data.busNumber } } })) {
    throw AppError.conflict('DUPLICATE_BUS', `Bus ${data.busNumber} already exists`);
  }
  await validateDriver(schoolId, data.driverId);
  const bus = await prisma.bus.create({ data: { ...data, schoolId }, include: busInclude });
  await audit({ action: 'BUS_ADDED', entity: 'Bus', entityId: bus.id, actor, schoolId, ...ctx });
  return bus;
}

async function ridersOnBus(busId, exceptStudentId) {
  return prisma.transportAssignment.count({ where: { route: { busId }, ...(exceptStudentId ? { studentId: { not: exceptStudentId } } : {}) } });
}

export async function updateBus(schoolId, id, data, actor, ctx) {
  const bus = await prisma.bus.findFirst({ where: { id, schoolId } });
  if (!bus) throw AppError.notFound('BUS_NOT_FOUND', 'Bus not found');
  if (data.busNumber && data.busNumber !== bus.busNumber && (await prisma.bus.findUnique({ where: { schoolId_busNumber: { schoolId, busNumber: data.busNumber } } }))) {
    throw AppError.conflict('DUPLICATE_BUS', `Bus ${data.busNumber} already exists`);
  }
  if (data.driverId !== undefined) await validateDriver(schoolId, data.driverId);
  if (data.capacity !== undefined) {
    const riders = await ridersOnBus(id);
    if (data.capacity < riders) throw AppError.conflict('CAPACITY_BELOW_RIDERS', `${riders} students already ride this bus`);
  }
  const updated = await prisma.bus.update({ where: { id }, data, include: busInclude });
  await audit({ action: 'BUS_UPDATED', entity: 'Bus', entityId: id, actor, schoolId, ...ctx });
  return updated;
}

// ───────────────────────── Routes ─────────────────────────

export function listRoutes(schoolId) {
  return prisma.transportRoute.findMany({
    where: { schoolId },
    orderBy: { routeCode: 'asc' },
    include: { bus: { include: busInclude }, _count: { select: { assignments: true } } },
  });
}

export async function getRoute(schoolId, id) {
  const route = await prisma.transportRoute.findFirst({
    where: { id, schoolId },
    include: {
      bus: { include: busInclude },
      assignments: {
        orderBy: { student: { fullName: 'asc' } },
        include: {
          student: {
            select: {
              id: true,
              fullName: true,
              studentCode: true,
              phone: true,
              enrollments: { where: { status: 'ACTIVE' }, include: { class: { select: { name: true } }, section: { select: { name: true } } }, take: 1 },
            },
          },
        },
      },
    },
  });
  if (!route) throw AppError.notFound('ROUTE_NOT_FOUND', 'Route not found');
  return route;
}

async function validateBus(schoolId, busId) {
  if (!busId) return;
  if (!(await prisma.bus.findFirst({ where: { id: busId, schoolId } }))) throw AppError.notFound('BUS_NOT_FOUND', 'Bus not found');
}

export async function createRoute(schoolId, data, actor, ctx) {
  if (await prisma.transportRoute.findUnique({ where: { schoolId_routeCode: { schoolId, routeCode: data.routeCode } } })) {
    throw AppError.conflict('DUPLICATE_ROUTE', `Route ${data.routeCode} already exists`);
  }
  await validateBus(schoolId, data.busId);
  const route = await prisma.transportRoute.create({ data: { ...data, schoolId } });
  await audit({ action: 'ROUTE_CREATED', entity: 'TransportRoute', entityId: route.id, actor, schoolId, ...ctx });
  return getRoute(schoolId, route.id);
}

export async function updateRoute(schoolId, id, data, actor, ctx) {
  const route = await prisma.transportRoute.findFirst({ where: { id, schoolId } });
  if (!route) throw AppError.notFound('ROUTE_NOT_FOUND', 'Route not found');
  if (data.routeCode && data.routeCode !== route.routeCode && (await prisma.transportRoute.findUnique({ where: { schoolId_routeCode: { schoolId, routeCode: data.routeCode } } }))) {
    throw AppError.conflict('DUPLICATE_ROUTE', `Route ${data.routeCode} already exists`);
  }
  if (data.busId && data.busId !== route.busId) {
    await validateBus(schoolId, data.busId);
    // Moving the route's riders onto another bus must still fit.
    const bus = await prisma.bus.findUnique({ where: { id: data.busId } });
    const moving = await prisma.transportAssignment.count({ where: { routeId: id } });
    if ((await ridersOnBus(bus.id)) + moving > bus.capacity) throw AppError.conflict('BUS_FULL', `Bus ${bus.busNumber} doesn't have room for this route's riders`);
  }
  await prisma.transportRoute.update({ where: { id }, data });
  await audit({ action: 'ROUTE_UPDATED', entity: 'TransportRoute', entityId: id, actor, schoolId, ...ctx });
  return getRoute(schoolId, id);
}

/** Put a student on a route (moving them if already on another). Respects bus capacity. */
export async function assignStudent(schoolId, routeId, data, actor, ctx) {
  const route = await prisma.transportRoute.findFirst({ where: { id: routeId, schoolId }, include: { bus: true } });
  if (!route) throw AppError.notFound('ROUTE_NOT_FOUND', 'Route not found');
  const student = await prisma.student.findFirst({ where: { id: data.studentId, schoolId, deletedAt: null, status: 'ACTIVE' } });
  if (!student) throw AppError.notFound('STUDENT_NOT_FOUND', 'Active student not found');
  if (data.pickupPoint && !route.pickupPoints.includes(data.pickupPoint)) {
    throw AppError.badRequest('INVALID_PICKUP_POINT', 'Choose one of this route’s pickup points');
  }
  if (route.bus) {
    const riders = await ridersOnBus(route.bus.id, student.id);
    if (riders >= route.bus.capacity) throw AppError.conflict('BUS_FULL', `Bus ${route.bus.busNumber} is full (${riders}/${route.bus.capacity})`);
  }
  const assignment = await prisma.transportAssignment.upsert({
    where: { studentId: student.id },
    update: { routeId, pickupPoint: data.pickupPoint ?? null, startDate: data.startDate ?? new Date(new Date().toISOString().slice(0, 10)) },
    create: { studentId: student.id, routeId, pickupPoint: data.pickupPoint ?? null, startDate: data.startDate ?? new Date(new Date().toISOString().slice(0, 10)) },
  });
  await audit({ action: 'TRANSPORT_ASSIGNED', entity: 'Student', entityId: student.id, actor, schoolId, metadata: { routeId }, ...ctx });
  return assignment;
}

export async function unassignStudent(schoolId, studentId, actor, ctx) {
  const a = await prisma.transportAssignment.findFirst({ where: { studentId, student: { schoolId } } });
  if (!a) throw AppError.notFound('ASSIGNMENT_NOT_FOUND', 'This student is not on a transport route');
  await prisma.transportAssignment.delete({ where: { id: a.id } });
  await audit({ action: 'TRANSPORT_UNASSIGNED', entity: 'Student', entityId: studentId, actor, schoolId, ...ctx });
  return { removed: true };
}

export async function studentTransport(schoolId, studentId, actor) {
  await assertCanViewStudent(actor, schoolId, studentId);
  return prisma.transportAssignment.findUnique({
    where: { studentId },
    include: { route: { include: { bus: { include: busInclude } } } },
  });
}
