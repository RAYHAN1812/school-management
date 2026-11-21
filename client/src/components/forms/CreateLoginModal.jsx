import { useEffect } from 'react';
import { useForm } from '../../hooks/useForm';
import { isStrongPassword } from '../../utils/password';
import { Alert, Button, Modal } from '../common/ui';
import { PasswordField, TextField } from './fields';

/**
 * Give an existing student or teacher profile a login. The profile's email is
 * the sign-in email; `onCreate(account)` calls the matching API.
 */
export default function CreateLoginModal({ open, person, roleLabel, onCreate, onClose, onDone }) {
  const f = useForm({ username: '', password: '' });
  useEffect(() => {
    if (open) {
      f.setValues({ username: '', password: '' });
      f.setErrors({});
      f.setSubmitError('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const onSubmit = f.submit(
    (v) => {
      const e = {};
      if (v.username && !/^[a-zA-Z0-9._-]{3,30}$/.test(v.username)) e.username = '3–30 letters, numbers, dot, dash or underscore';
      if (!isStrongPassword(v.password)) e.password = 'Password does not meet the requirements';
      return e;
    },
    async (v) => {
      try {
        await onCreate({ password: v.password, ...(v.username ? { username: v.username } : {}) });
        onDone();
      } catch (err) {
        f.handleApiError(err, { USERNAME_ALREADY_EXISTS: 'username' });
      }
    },
  );

  return (
    <Modal
      open={open}
      onClose={f.submitting ? undefined : onClose}
      title={`Create ${roleLabel} login`}
      description={person?.email ? `${person.fullName} will sign in with ${person.email}.` : undefined}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={f.submitting}>
            Cancel
          </Button>
          <Button type="submit" form="create-login-form" loading={f.submitting} disabled={!person?.email}>
            Create login
          </Button>
        </>
      }
    >
      {!person?.email ? (
        <Alert type="info">Add an email address to the profile first. It becomes the sign-in email.</Alert>
      ) : (
        <form id="create-login-form" onSubmit={onSubmit} noValidate className="space-y-4">
          {f.submitError && <Alert type="error">{f.submitError}</Alert>}
          <TextField label="Username" hint="Optional" {...f.bind('username')} />
          <PasswordField label="Temporary password" autoComplete="new-password" showChecks {...f.bind('password')} />
        </form>
      )}
    </Modal>
  );
}
