import { useEffect, useState } from 'react';
import { Alert, Button, Modal } from '../../components/common/ui';
import { PasswordField, SelectField, TextField } from '../../components/forms/fields';
import { useAuth } from '../../hooks/useAuth';
import { adminService } from '../../services/admin.service';
import { authService } from '../../services/auth.service';
import { getErrorCode, getErrorMessage, getFieldErrors } from '../../utils/errors';
import { isStrongPassword } from '../../utils/password';
import { CREATABLE_ROLES, ROLE_LABELS, ROLES } from '../../utils/roles';

const EMPTY = { fullName: '', email: '', username: '', phone: '', role: '', schoolId: '', password: '' };

function validate(form, needsSchool) {
  const e = {};
  if (form.fullName.trim().length < 2) e.fullName = 'Enter the full name';
  if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) e.email = 'Enter a valid email address';
  if (form.username && !/^[a-zA-Z0-9._-]{3,30}$/.test(form.username.trim()))
    e.username = '3–30 characters: letters, numbers, dot, dash or underscore';
  if (form.phone && !/^\+?[0-9\s-]{7,20}$/.test(form.phone.trim())) e.phone = 'Enter a valid phone number';
  if (!form.role) e.role = 'Choose a role';
  if (needsSchool && !form.schoolId) e.schoolId = 'Choose a school';
  if (!isStrongPassword(form.password)) e.password = 'Password does not meet the requirements below';
  return e;
}

export default function CreateUserModal({ open, onClose, onCreated }) {
  const { user } = useAuth();
  const isSuper = user.role.key === ROLES.SUPER_ADMIN;
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [schools, setSchools] = useState([]);

  useEffect(() => {
    if (!open) return;
    setForm(EMPTY);
    setErrors({});
    setSubmitError('');
    if (isSuper) adminService.listSchools().then(setSchools).catch(() => setSchools([]));
  }, [open, isSuper]);

  const needsSchool = isSuper && form.role && form.role !== ROLES.SUPER_ADMIN;
  const roleOptions = (CREATABLE_ROLES[user.role.key] ?? []).map((r) => ({ value: r, label: ROLE_LABELS[r] }));

  const update = (field) => (e) => {
    setForm((f) => ({ ...f, [field]: e.target.value }));
    setErrors((er) => ({ ...er, [field]: undefined }));
  };

  async function handleSubmit(e) {
    e.preventDefault();
    const found = validate(form, needsSchool);
    setErrors(found);
    if (Object.keys(found).length) return;

    setSubmitting(true);
    setSubmitError('');
    try {
      const { user: created } = await authService.register({
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        username: form.username.trim() || undefined,
        phone: form.phone.trim() || undefined,
        role: form.role,
        password: form.password,
        ...(needsSchool ? { schoolId: form.schoolId } : {}),
      });
      onCreated(created);
    } catch (err) {
      const code = getErrorCode(err);
      if (code === 'EMAIL_ALREADY_EXISTS') setErrors({ email: 'An account with this email already exists' });
      else if (code === 'USERNAME_ALREADY_EXISTS') setErrors({ username: 'This username is already taken' });
      else {
        const fields = getFieldErrors(err);
        if (Object.keys(fields).length) setErrors(fields);
        else setSubmitError(getErrorMessage(err));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={submitting ? undefined : onClose}
      title="Create account"
      description="The person signs in with this email (or username) and the password you set. Ask them to change it after first sign-in."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" form="create-user-form" loading={submitting}>
            Create account
          </Button>
        </>
      }
    >
      <form id="create-user-form" onSubmit={handleSubmit} noValidate className="space-y-4">
        {submitError && <Alert type="error">{submitError}</Alert>}
        <TextField label="Full name" value={form.fullName} onChange={update('fullName')} error={errors.fullName} required autoFocus />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField label="Email" type="email" value={form.email} onChange={update('email')} error={errors.email} required />
          <TextField
            label="Username"
            value={form.username}
            onChange={update('username')}
            error={errors.username}
            hint="Optional"
          />
          <TextField label="Phone" type="tel" value={form.phone} onChange={update('phone')} error={errors.phone} hint="Optional" />
          <SelectField
            label="Role"
            value={form.role}
            onChange={update('role')}
            error={errors.role}
            options={roleOptions}
            placeholder="Select a role"
            required
          />
        </div>
        {needsSchool && (
          <SelectField
            label="School"
            value={form.schoolId}
            onChange={update('schoolId')}
            error={errors.schoolId}
            options={schools.map((s) => ({ value: s.id, label: `${s.name} (${s.code})` }))}
            placeholder="Select a school"
            required
          />
        )}
        <PasswordField
          label="Temporary password"
          autoComplete="new-password"
          value={form.password}
          onChange={update('password')}
          error={errors.password}
          showChecks
          required
        />
      </form>
    </Modal>
  );
}
