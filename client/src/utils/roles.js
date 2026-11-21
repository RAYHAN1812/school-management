export const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  SCHOOL_ADMIN: 'SCHOOL_ADMIN',
  TEACHER: 'TEACHER',
  STUDENT: 'STUDENT',
  PARENT: 'PARENT',
};

export const ADMIN_ROLES = [ROLES.SUPER_ADMIN, ROLES.SCHOOL_ADMIN];

export const ROLE_LABELS = {
  SUPER_ADMIN: 'Super Admin',
  SCHOOL_ADMIN: 'School Admin',
  TEACHER: 'Teacher',
  STUDENT: 'Student',
  PARENT: 'Parent',
};

export const ROLE_BADGE = {
  SUPER_ADMIN: 'bg-purple-50 text-purple-700 ring-purple-600/20',
  SCHOOL_ADMIN: 'bg-brand-50 text-brand-700 ring-brand-600/20',
  TEACHER: 'bg-amber-50 text-amber-800 ring-amber-600/20',
  STUDENT: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  PARENT: 'bg-sky-50 text-sky-700 ring-sky-600/20',
};

// Roles a creator may assign — mirrors the server's CREATABLE_ROLES.
export const CREATABLE_ROLES = {
  SUPER_ADMIN: Object.values(ROLES),
  SCHOOL_ADMIN: [ROLES.TEACHER, ROLES.STUDENT, ROLES.PARENT],
};

/** Landing page after login, per role. */
export function homePathFor(roleKey) {
  switch (roleKey) {
    case ROLES.SUPER_ADMIN:
    case ROLES.SCHOOL_ADMIN:
      return '/admin';
    case ROLES.TEACHER:
      return '/teacher';
    case ROLES.STUDENT:
      return '/student';
    case ROLES.PARENT:
      return '/parent';
    default:
      return '/login';
  }
}
