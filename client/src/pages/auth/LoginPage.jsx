import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Alert, Button } from '../../components/common/ui';
import { PasswordField, TextField } from '../../components/forms/fields';
import AuthLayout from '../../components/layout/AuthLayout';
import { useAuth } from '../../hooks/useAuth';
import { getErrorMessage } from '../../utils/errors';
import { homePathFor } from '../../utils/roles';
import { SCHOOL } from '../../config/school';

export default function LoginPage() {
  const { login, isAuthenticated, user, sessionExpired, clearSessionExpired } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ identifier: '', password: '' });
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (isAuthenticated && user) return <Navigate to={homePathFor(user.role.key)} replace />;

  const update = (field) => (e) => {
    setForm((f) => ({ ...f, [field]: e.target.value }));
    setErrors((er) => ({ ...er, [field]: undefined }));
  };

  async function handleSubmit(e) {
    e.preventDefault();
    const next = {};
    if (!form.identifier.trim()) next.identifier = 'Enter your email or username';
    if (!form.password) next.password = 'Enter your password';
    setErrors(next);
    if (Object.keys(next).length) return;

    setSubmitting(true);
    setSubmitError('');
    try {
      const loggedIn = await login(form.identifier.trim(), form.password);
      clearSessionExpired();
      const home = homePathFor(loggedIn.role.key);
      // Return to the page they were trying to open, if it belongs to their area.
      const from = location.state?.from;
      navigate(from && from.startsWith(home) ? from : home, { replace: true });
    } catch (err) {
      setSubmitError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout title="Sign in" subtitle={`Welcome back to ${SCHOOL.name}. Sign in with the account your school gave you.`}>
      {sessionExpired && !submitError && (
        <Alert type="info" className="mb-5">
          Your session has ended. Please sign in again.
        </Alert>
      )}
      {location.state?.passwordReset && (
        <Alert type="success" className="mb-5">
          Password updated. Sign in with your new password.
        </Alert>
      )}
      {submitError && (
        <Alert type="error" className="mb-5">
          {submitError}
        </Alert>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        <TextField
          label="Email or username"
          name="identifier"
          autoComplete="username"
          autoFocus
          value={form.identifier}
          onChange={update('identifier')}
          error={errors.identifier}
        />
        <div>
          <PasswordField
            label="Password"
            name="password"
            autoComplete="current-password"
            value={form.password}
            onChange={update('password')}
            error={errors.password}
          />
          <div className="mt-2 text-right">
            <Link to="/forgot-password" className="text-sm font-medium text-brand-600 hover:text-brand-700">
              Forgot password?
            </Link>
          </div>
        </div>
        <Button type="submit" className="w-full" loading={submitting}>
          Sign in
        </Button>
      </form>

    </AuthLayout>
  );
}
