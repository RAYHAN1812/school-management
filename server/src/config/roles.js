// Single source of truth for roles and what each one may do.
// Route guards use role keys; the permission strings are stored in the
// `roles` table (seeded) so they can later drive fine-grained checks.

export const ROLES = Object.freeze({
  SUPER_ADMIN: 'SUPER_ADMIN',
  SCHOOL_ADMIN: 'SCHOOL_ADMIN',
  TEACHER: 'TEACHER',
  STUDENT: 'STUDENT',
  PARENT: 'PARENT',
});

export const ADMIN_ROLES = [ROLES.SUPER_ADMIN, ROLES.SCHOOL_ADMIN];

export const ROLE_DEFINITIONS = [
  {
    key: ROLES.SUPER_ADMIN,
    name: 'Super Admin',
    description: 'Complete system management across all schools',
    permissions: ['*'],
  },
  {
    key: ROLES.SCHOOL_ADMIN,
    name: 'School Admin',
    description: 'Manages daily school operations',
    permissions: [
      'users:manage',
      'students:manage',
      'teachers:manage',
      'academics:manage',
      'attendance:manage',
      'exams:manage',
      'finance:manage',
      'notices:manage',
      'library:manage',
      'transport:manage',
      'reports:view',
      'audit:view',
    ],
  },
  {
    key: ROLES.TEACHER,
    name: 'Teacher',
    description: 'Attendance, exams, marks and classes',
    permissions: [
      'attendance:record',
      'exams:marks',
      'assignments:manage',
      'notices:create',
      'timetable:view',
      'students:view-assigned',
    ],
  },
  {
    key: ROLES.STUDENT,
    name: 'Student',
    description: 'Views own attendance, results and routine',
    permissions: ['self:view', 'assignments:submit', 'notices:view', 'timetable:view'],
  },
  {
    key: ROLES.PARENT,
    name: 'Parent / Guardian',
    description: 'Monitors linked children: fees, results, attendance',
    permissions: ['children:view', 'fees:view', 'notices:view'],
  },
];

// Which roles a given creator role may create through /auth/register.
export const CREATABLE_ROLES = Object.freeze({
  [ROLES.SUPER_ADMIN]: Object.values(ROLES),
  [ROLES.SCHOOL_ADMIN]: [ROLES.TEACHER, ROLES.STUDENT, ROLES.PARENT],
});
