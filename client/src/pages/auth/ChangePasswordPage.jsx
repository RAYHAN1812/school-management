import { useState } from 'react';
import { Alert, Button, Card, PageHeader } from '../../components/common/ui';
import { PasswordField } from '../../components/forms/fields';
import { useAuth, useToast } from '../../hooks/useAuth';
import { authService } from '../../services/auth.service';
import { getErrorCode, getErrorMessage, getFieldErrors } from '../../utils/errors';
import { isStrongPassword } from '../../utils/password';

const EMPTY = { currentPassword: '', newPassword: '', confirm: '' };

export default function ChangePasswordPage() {
  const { setUser } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const update = (field) => (e) => {
    setForm((f) => ({ ...f, [field]: e.target.value }));
    setErrors((er) => ({ ...er, [field]: undefined }));
  };

  async function handleSubmit(e) {
    e.preventDefault();
    const next = {};
    if (!form.currentPassword) next.currentPassword = 'Enter your current password';
    if (!isStrongPassword(form.newPassword)) next.newPassword = 'Password does not meet the requirements below';
    else if (form.newPassword === form.currentPassword) next.newPassword = 'Choose a password you have not used here';
    if (form.newPassword !== form.confirm) next.confirm = 'Passwords do not match';
    setErrors(next);
    if (Object.keys(next).length) return;

    setSubmitting(true);
    setSubmitError('');
    try {
      const { user } = await authService.changePassword(form.currentPassword, form.newPassword);
      setUser(user);
      setForm(EMPTY);
      toast.success('Password changed. Other devices have been signed out.');
    } catch (err) {
      if (getErrorCode(err) === 'INVALID_CURRENT_PASSWORD') {
        setErrors({ currentPassword: 'Current password is incorrect' });
      } else {
        const fields = getFieldErrors(err);
        if (Object.keys(fields).length) setErrors(fields);
        else setSubmitError(getErrorMessage(err));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <PageHeader title="Change password" description="Changing your password signs you out on every other device." />
      <Card className="max-w-xl">
        <form onSubmit={handleSubmit} noValidate className="space-y-5">
          {submitError && <Alert type="error">{submitError}</Alert>}
          <PasswordField
            label="Current password"
            autoComplete="current-password"
            value={form.currentPassword}
            onChange={update('currentPassword')}
            error={errors.currentPassword}
            required
          />
          <PasswordField
            label="New password"
            autoComplete="new-password"
            value={form.newPassword}
            onChange={update('newPassword')}
            error={errors.newPassword}
            showChecks
            required
          />
          <PasswordField
            label="Confirm new password"
            autoComplete="new-password"
            value={form.confirm}
            onChange={update('confirm')}
            error={errors.confirm}
            required
          />
          <div className="flex justify-end">
            <Button type="submit" loading={submitting}>
              Update password
            </Button>
          </div>
        </form>
      </Card>
    </>
  );
}
