import { useAuth } from './useAuth';
import { ADMIN_ROLES, ROLES } from '../utils/roles';

/** URL prefix for the signed-in role's area, so shared pages link correctly. */
export function useArea() {
  const { user } = useAuth();
  const key = user?.role.key;
  if (ADMIN_ROLES.includes(key)) return { base: '/admin', isAdmin: true, isTeacher: false };
  if (key === ROLES.TEACHER) return { base: '/teacher', isAdmin: false, isTeacher: true };
  if (key === ROLES.STUDENT) return { base: '/student', isAdmin: false, isTeacher: false };
  return { base: '/parent', isAdmin: false, isTeacher: false };
}
