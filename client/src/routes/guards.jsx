import { lazy } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { FullPageSpinner } from '../components/common/ui';
import { useAuth } from '../hooks/useAuth';
import { homePathFor } from '../utils/roles';

const SchoolLandingPage = lazy(() => import('../pages/public/SchoolLandingPage'));

/** Requires a signed-in user; optionally restricts to some roles. */
export function ProtectedRoute({ roles }) {
  const { status, user } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <FullPageSpinner />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (roles && !roles.includes(user.role.key)) return <Navigate to="/unauthorized" replace />;
  return <Outlet />;
}

/** Sends a signed-in user to their role's home; anonymous users to /login. */
export function RoleHomeRedirect() {
  const { status, user } = useAuth();
  if (status === 'loading') return <FullPageSpinner />;
  return <Navigate to={user ? homePathFor(user.role.key) : '/login'} replace />;
}

export function PublicHomeRoute() {
  const { status, user } = useAuth();
  if (status === 'loading') return <FullPageSpinner />;
  return user ? <Navigate to={homePathFor(user.role.key)} replace /> : <SchoolLandingPage />;
}

/** Login/forgot pages: wait for the session check so we don't flash the form. */
export function PublicOnlyRoute() {
  const { status } = useAuth();
  if (status === 'loading') return <FullPageSpinner />;
  return <Outlet />;
}
