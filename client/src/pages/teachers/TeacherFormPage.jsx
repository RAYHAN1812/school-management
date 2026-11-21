import { ArrowLeft } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Alert, Button, Card, LoadError, PageHeader, Spinner } from '../../components/common/ui';
import { CheckboxField, FormSection, PasswordField, SelectField, TextAreaField, TextField } from '../../components/forms/fields';
import { useAsync } from '../../hooks/useAsync';
import { useToast } from '../../hooks/useAuth';
import { isEmail, isPhone, todayInput, useForm } from '../../hooks/useForm';
import { useSubjects } from '../../hooks/useLookups';
import { teacherService } from '../../services/school.service';
import { toDateInput } from '../../utils/format';
import { isStrongPassword } from '../../utils/password';
import { EMPLOYMENT_STATUSES, EMPLOYMENT_TYPES } from './TeachersPage';

const EMPTY = {
  employeeCode: '', fullName: '', designation: '', department: '', phone: '', email: '', address: '', qualification: '',
  joiningDate: todayInput(), employmentType: 'FULL_TIME', status: 'ACTIVE', salary: '', subjectIds: [],
  createLogin: false, username: '', password: '',
};

export default function TeacherFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const toast = useToast();
  const f = useForm(EMPTY);
  const subjects = useSubjects();
  const existing = useAsync(() => (isEdit ? teacherService.get(id) : Promise.resolve(null)), [id]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const t = existing.data;
    if (!t) return;
    f.setValues({
      ...EMPTY,
      employeeCode: t.employeeCode,
      fullName: t.fullName,
      designation: t.designation,
      department: t.department ?? '',
      phone: t.phone,
      email: t.email,
      address: t.address ?? '',
      qualification: t.qualification ?? '',
      joiningDate: toDateInput(t.joiningDate),
      employmentType: t.employmentType,
      status: t.status,
      salary: t.salary ?? '',
      subjectIds: t.subjects.map((s) => s.subject.id),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing.data]);

  const validate = (v) => {
    const e = {};
    if (v.fullName.trim().length < 2) e.fullName = 'Enter the full name';
    if (!v.designation.trim()) e.designation = 'Enter the designation';
    if (!isPhone(v.phone)) e.phone = 'Enter a valid phone number';
    if (!isEmail(v.email)) e.email = 'Enter a valid email address';
    if (!v.joiningDate) e.joiningDate = 'Enter the joining date';
    else if (v.joiningDate > todayInput()) e.joiningDate = 'Joining date cannot be in the future';
    if (v.salary !== '' && (Number.isNaN(Number(v.salary)) || Number(v.salary) < 0)) e.salary = 'Enter a valid amount';
    if (v.employeeCode && !/^[A-Za-z0-9-]{3,20}$/.test(v.employeeCode.trim())) e.employeeCode = '3–20 letters, numbers or dashes';
    if (!isEdit && v.createLogin) {
      if (!isStrongPassword(v.password)) e.password = 'Password does not meet the requirements';
      if (v.username && !/^[a-zA-Z0-9._-]{3,30}$/.test(v.username)) e.username = '3–30 letters, numbers, dot, dash or underscore';
    }
    return e;
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    const v = f.values;
    const found = validate(v);
    f.setErrors(found);
    if (Object.keys(found).length) {
      f.setSubmitError('Please fix the highlighted fields.');
      return;
    }
    f.setSubmitError('');
    setSaving(true);
    const payload = {
      fullName: v.fullName.trim(),
      designation: v.designation.trim(),
      department: v.department.trim() || null,
      phone: v.phone.trim(),
      email: v.email.trim(),
      address: v.address.trim() || null,
      qualification: v.qualification.trim() || null,
      joiningDate: v.joiningDate,
      employmentType: v.employmentType,
      salary: v.salary === '' ? null : Number(v.salary),
      subjectIds: v.subjectIds,
      ...(v.employeeCode.trim() ? { employeeCode: v.employeeCode.trim() } : {}),
      ...(isEdit ? { status: v.status } : {}),
      ...(!isEdit && v.createLogin ? { account: { password: v.password, ...(v.username ? { username: v.username } : {}) } } : {}),
    };
    try {
      const saved = isEdit ? await teacherService.update(id, payload) : await teacherService.create(payload);
      toast.success(isEdit ? 'Teacher updated.' : `${saved.fullName} added (${saved.employeeCode}).`);
      navigate(`/admin/teachers/${saved.id}`, { replace: true });
    } catch (err) {
      f.handleApiError(err, {
        DUPLICATE_EMPLOYEE_ID: 'employeeCode',
        EMAIL_ALREADY_EXISTS: 'email',
        USERNAME_ALREADY_EXISTS: 'username',
      });
    } finally {
      setSaving(false);
    }
  };

  if (isEdit && existing.loading) return <Spinner />;
  if (isEdit && existing.error) return <LoadError error={existing.error} onRetry={existing.reload} />;

  const back = isEdit ? `/admin/teachers/${id}` : '/admin/teachers';
  const v = f.values;
  const toggleSubject = (sid, on) => f.setValue('subjectIds', on ? [...v.subjectIds, sid] : v.subjectIds.filter((x) => x !== sid));

  return (
    <>
      <Link to={back} className="mb-3 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> {isEdit ? 'Back to profile' : 'Teachers & staff'}
      </Link>
      <PageHeader title={isEdit ? `Edit ${existing.data?.fullName}` : 'Add teacher'} />
      <form onSubmit={onSubmit} noValidate>
        <Card>
          {f.submitError && (
            <Alert type="error" className="mb-6">
              {f.submitError}
            </Alert>
          )}
          <FormSection title="Profile">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <TextField label="Full name" required {...f.bind('fullName')} />
              <TextField label="Employee ID" placeholder={isEdit ? undefined : 'Generated automatically'} {...f.bind('employeeCode')} />
              <TextField label="Designation" placeholder="Senior Teacher" required {...f.bind('designation')} />
              <TextField label="Department" placeholder="Science" {...f.bind('department')} />
              <TextField label="Qualification" placeholder="M.Sc. in Mathematics" {...f.bind('qualification')} />
            </div>
          </FormSection>
          <FormSection title="Contact">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <TextField label="Phone" type="tel" required {...f.bind('phone')} />
              <TextField label="Email" type="email" required {...f.bind('email')} />
            </div>
            <TextAreaField label="Address" rows={2} {...f.bind('address')} />
          </FormSection>
          <FormSection title="Employment" description="Salary is only visible to administrators.">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <TextField label="Joining date" type="date" max={todayInput()} required {...f.bind('joiningDate')} />
              <SelectField label="Employment type" options={EMPLOYMENT_TYPES} {...f.bind('employmentType')} />
              <TextField label="Monthly salary (৳)" type="number" min="0" step="0.01" {...f.bind('salary')} />
              {isEdit && (
                <SelectField
                  label="Status"
                  options={EMPLOYMENT_STATUSES}
                  hint="Inactive or resigned teachers can't sign in or get new classes."
                  {...f.bind('status')}
                />
              )}
            </div>
          </FormSection>
          <FormSection title="Subjects" description="Subjects this teacher is qualified to teach. Class assignments are made per class under Academics.">
            {subjects.loading ? (
              <Spinner />
            ) : (subjects.data ?? []).length === 0 ? (
              <Alert type="info">No subjects yet — add them under Academics → Subjects.</Alert>
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {subjects.data.map((s) => (
                  <CheckboxField key={s.id} label={`${s.name} (${s.code})`} checked={v.subjectIds.includes(s.id)} onChange={(on) => toggleSubject(s.id, on)} />
                ))}
              </div>
            )}
          </FormSection>
          {!isEdit && (
            <FormSection title="Login account" description="Lets the teacher sign in to take attendance and enter marks.">
              <CheckboxField
                label="Create a teacher login"
                description="Signs in with the email above."
                checked={v.createLogin}
                onChange={(on) => f.setValue('createLogin', on)}
              />
              {v.createLogin && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <TextField label="Username" hint="Optional" {...f.bind('username')} />
                  <div className="sm:col-span-2">
                    <PasswordField label="Temporary password" autoComplete="new-password" showChecks {...f.bind('password')} />
                  </div>
                </div>
              )}
            </FormSection>
          )}
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-5">
            <Link to={back}>
              <Button variant="secondary">Cancel</Button>
            </Link>
            <Button type="submit" loading={saving}>
              {isEdit ? 'Save changes' : 'Add teacher'}
            </Button>
          </div>
        </Card>
      </form>
    </>
  );
}
