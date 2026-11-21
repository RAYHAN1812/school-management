import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Alert, Button } from '../../components/common/ui';
import { PasswordField } from '../../components/forms/fields';
import AuthLayout from '../../components/layout/AuthLayout';
import { useAuth } from '../../hooks/useAuth';
import { authService } from '../../services/auth.service';
import { getErrorMessage, getFieldErrors } from '../../utils/errors';
import { isStrongPassword } from '../../utils/password';

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const tokenLooksValid = /^[a-f0-9]{64}$/.test(token);

  async function handleSubmit(e) {
    e.preventDefault();
    const next = {};
    if (!isStrongPassword(password)) next.password = 'Password does not meet the requirements below';
    if (password !== confirm) next.confirm = 'Passwords do not match';
    setErrors(next);
    if (Object.keys(next).length) return;

    setSubmitting(true);
    setSubmitError('');
    try {
      await authService.resetPassword(token, password);
      setUser(null); // any existing session was revoked server-side
      navigate('/login', { replace: true, state: { passwordReset: true } });
    } catch (err) {
      const fields = getFieldErrors(err);
      if (fields.password) setErrors({ password: fields.password });
      else setSubmitError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout title="Choose a new password" subtitle="This will sign you out of every other device.">
      {!tokenLooksValid ? (
        <Alert type="error" title="Invalid reset link">
          This link is incomplete or malformed.{' '}
          <Link to="/forgot-password" className="font-medium underline">
            Request a new one
          </Link>
          .
        </Alert>
      ) : (
        <form onSubmit={handleSubmit} noValidate className="space-y-5">
          {submitError && (
            <Alert type="error">
              {submitError}{' '}
              <Link to="/forgot-password" className="font-medium underline">
                Request a new link
              </Link>
            </Alert>
          )}
          <PasswordField
            label="New password"
            autoComplete="new-password"
            autoFocus
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setErrors((er) => ({ ...er, password: undefined }));
            }}
            error={errors.password}
            showChecks
          />
          <PasswordField
            label="Confirm new password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => {
              setConfirm(e.target.value);
              setErrors((er) => ({ ...er, confirm: undefined }));
            }}
            error={errors.confirm}
          />
          <Button type="submit" className="w-full" loading={submitting}>
            Reset password
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
