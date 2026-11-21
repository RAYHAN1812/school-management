import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Button } from '../../components/common/ui';
import { TextField } from '../../components/forms/fields';
import AuthLayout from '../../components/layout/AuthLayout';
import { authService } from '../../services/auth.service';
import { getErrorMessage } from '../../utils/errors';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [result, setResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError('Enter a valid email address');
      return;
    }
    setSubmitting(true);
    setSubmitError('');
    try {
      setResult(await authService.forgotPassword(email.trim()));
    } catch (err) {
      setSubmitError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout title="Reset your password" subtitle="Enter your account email and we'll send you a reset link.">
      {result ? (
        <div className="space-y-4">
          <Alert type="success">{result.message}</Alert>
          {result.devResetUrl && (
            <Alert type="info" title="Development mode">
              No email service is configured yet, so here is the link that would have been emailed:{' '}
              <a href={result.devResetUrl} className="break-all font-medium underline">
                Open reset link
              </a>
            </Alert>
          )}
        </div>
      ) : (
        <form onSubmit={handleSubmit} noValidate className="space-y-5">
          {submitError && <Alert type="error">{submitError}</Alert>}
          <TextField
            label="Email"
            type="email"
            autoComplete="email"
            autoFocus
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError('');
            }}
            error={error}
          />
          <Button type="submit" className="w-full" loading={submitting}>
            Send reset link
          </Button>
        </form>
      )}
      <Link to="/login" className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" /> Back to sign in
      </Link>
    </AuthLayout>
  );
}
