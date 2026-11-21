import { Link } from 'react-router-dom';
import { Button } from '../components/common/ui';
import { useAuth } from '../hooks/useAuth';
import { homePathFor } from '../utils/roles';

function StatusPage({ code, title, message }) {
  const { user } = useAuth();
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
      <p className="text-sm font-semibold text-brand-600">{code}</p>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900">{title}</h1>
      <p className="mt-2 max-w-md text-sm text-slate-500">{message}</p>
      <Link to={user ? homePathFor(user.role.key) : '/login'} className="mt-6">
        <Button>{user ? 'Go to my dashboard' : 'Go to sign in'}</Button>
      </Link>
    </div>
  );
}

export function NotFoundPage() {
  return <StatusPage code="404" title="Page not found" message="The page you're looking for doesn't exist or has moved." />;
}

export function UnauthorizedPage() {
  return (
    <StatusPage code="403" title="Access denied" message="Your account doesn't have permission to view this page." />
  );
}
