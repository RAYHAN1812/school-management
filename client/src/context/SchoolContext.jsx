import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { adminService } from '../services/admin.service';
import { setActiveSchoolId } from '../services/api';
import { ROLES } from '../utils/roles';

const SchoolContext = createContext(null);
const STORAGE_KEY = 'sms.activeSchoolId';

function readStored() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * Which school the UI is working on. School users always work on their own
 * school. A super admin picks one (remembered per browser) and every request
 * carries it as X-School-Id.
 */
export function SchoolProvider({ children }) {
  const { user } = useAuth();
  const isSuper = user?.role.key === ROLES.SUPER_ADMIN;
  const [schools, setSchools] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setActiveSchoolId(null);
      setReady(false);
      return undefined;
    }
    if (!isSuper) {
      setActiveSchoolId(null);
      setSchools(user.school ? [user.school] : []);
      setSelectedId(user.schoolId);
      setReady(true);
      return undefined;
    }
    adminService
      .listSchools()
      .then((list) => {
        if (cancelled) return;
        const stored = readStored();
        const pick = list.find((s) => s.id === stored)?.id ?? list[0]?.id ?? null;
        setActiveSchoolId(pick);
        setSchools(list);
        setSelectedId(pick);
      })
      .catch(() => setSchools([]))
      .finally(() => !cancelled && setReady(true));
    return () => {
      cancelled = true;
    };
  }, [user, isSuper]);

  const value = useMemo(
    () => ({
      schools,
      schoolId: selectedId,
      school: schools.find((s) => s.id === selectedId) ?? null,
      canSwitch: isSuper && schools.length > 0,
      ready,
      selectSchool(id) {
        setActiveSchoolId(id);
        setSelectedId(id);
        try {
          localStorage.setItem(STORAGE_KEY, id);
        } catch {
          /* private mode — selection just won't persist */
        }
      },
    }),
    [schools, selectedId, isSuper, ready],
  );

  return <SchoolContext.Provider value={value}>{children}</SchoolContext.Provider>;
}

export function useSchool() {
  const ctx = useContext(SchoolContext);
  if (!ctx) throw new Error('useSchool must be used inside <SchoolProvider>');
  return ctx;
}
