import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Alert, Button, Card, LoadError, PageHeader, Spinner } from '../../components/common/ui';
import { CheckboxField, FormSection, PasswordField, SelectField, TextAreaField, TextField } from '../../components/forms/fields';
import { useAsync } from '../../hooks/useAsync';
import { useToast } from '../../hooks/useAuth';
import { isEmail, isPhone, todayInput, useForm } from '../../hooks/useForm';
import { useClasses } from '../../hooks/useLookups';
import { studentService } from '../../services/school.service';
import { toDateInput } from '../../utils/format';
import { isStrongPassword } from '../../utils/password';

const GENDERS = [
  { value: 'MALE', label: 'Male' },
  { value: 'FEMALE', label: 'Female' },
  { value: 'OTHER', label: 'Other' },
];
const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((g) => ({ value: g, label: g }));
const RELATIONSHIPS = ['Father', 'Mother', 'Grandfather', 'Grandmother', 'Uncle', 'Aunt', 'Brother', 'Sister', 'Legal guardian'];

const emptyGuardian = () => ({ fullName: '', relationship: 'Father', phone: '', email: '', occupation: '', createLogin: false, password: '' });

const EMPTY = {
  studentCode: '',
  fullName: '',
  dateOfBirth: '',
  gender: '',
  bloodGroup: '',
  phone: '',
  email: '',
  presentAddress: '',
  permanentAddress: '',
  sameAddress: true,
  admissionDate: todayInput(),
  previousSchool: '',
  classId: '',
  sectionId: '',
  rollNumber: '',
  createLogin: false,
  password: '',
};

function validate(v, guardians, isEdit) {
  const e = {};
  if (v.fullName.trim().length < 2) e.fullName = 'Enter the full name';
  if (!v.dateOfBirth) e.dateOfBirth = 'Enter the date of birth';
  else if (v.dateOfBirth >= todayInput()) e.dateOfBirth = 'Date of birth must be in the past';
  if (!v.gender) e.gender = 'Choose a gender';
  if (!isPhone(v.phone)) e.phone = 'Enter a valid phone number';
  if (v.email && !isEmail(v.email)) e.email = 'Enter a valid email address';
  if (!v.presentAddress.trim()) e.presentAddress = 'Enter the present address';
  if (!v.sameAddress && !v.permanentAddress.trim()) e.permanentAddress = 'Enter the permanent address';
  if (!v.admissionDate) e.admissionDate = 'Enter the admission date';
  else if (v.admissionDate > todayInput()) e.admissionDate = 'Admission date cannot be in the future';
  if (v.studentCode && !/^[A-Za-z0-9-]{3,30}$/.test(v.studentCode.trim())) e.studentCode = '3–30 letters, numbers or dashes';
  if (isEdit) return e;

  if (!v.classId) e.classId = 'Choose a class';
  if (!v.sectionId) e.sectionId = 'Choose a section';
  if (v.rollNumber && (!Number.isInteger(Number(v.rollNumber)) || Number(v.rollNumber) < 1)) e.rollNumber = 'Enter a whole number';
  if (v.createLogin) {
    if (!v.email) e.email = 'An email is needed for a login account';
    if (!isStrongPassword(v.password)) e.password = 'Password does not meet the requirements';
  }
  guardians.forEach((g, i) => {
    if (g.fullName.trim().length < 2) e[`g${i}.fullName`] = 'Enter the guardian’s name';
    if (!isPhone(g.phone)) e[`g${i}.phone`] = 'Enter a valid phone number';
    if (g.email && !isEmail(g.email)) e[`g${i}.email`] = 'Enter a valid email address';
    if (g.createLogin) {
      if (!g.email) e[`g${i}.email`] = 'An email is needed for a parent login';
      if (!isStrongPassword(g.password)) e[`g${i}.password`] = 'Password does not meet the requirements';
    }
  });
  return e;
}

/** Admission form (create) and profile editor (edit). */
export default function StudentFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const toast = useToast();
  const f = useForm(EMPTY);
  const [guardians, setGuardians] = useState([emptyGuardian()]);
  const classes = useClasses();
  const existing = useAsync(() => (isEdit ? studentService.get(id) : Promise.resolve(null)), [id]);

  useEffect(() => {
    const s = existing.data;
    if (!s) return;
    f.setValues({
      ...EMPTY,
      studentCode: s.studentCode,
      fullName: s.fullName,
      dateOfBirth: toDateInput(s.dateOfBirth),
      gender: s.gender,
      bloodGroup: s.bloodGroup ?? '',
      phone: s.phone,
      email: s.email ?? '',
      presentAddress: s.presentAddress,
      permanentAddress: s.permanentAddress,
      sameAddress: s.presentAddress === s.permanentAddress,
      admissionDate: toDateInput(s.admissionDate),
      previousSchool: s.previousSchool ?? '',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing.data]);

  const classOptions = (classes.data?.classes ?? []).map((c) => ({ value: c.id, label: c.name }));
  const selectedClass = classes.data?.classes.find((c) => c.id === f.values.classId);
  const sectionOptions = useMemo(
    () =>
      (selectedClass?.sections ?? []).map((s) => ({
        value: s.id,
        label: `Section ${s.name} (${s._count.enrollments}${s.capacity ? `/${s.capacity}` : ''} students)`,
      })),
    [selectedClass],
  );

  const setGuardian = (i, field, value) => {
    setGuardians((list) => list.map((g, idx) => (idx === i ? { ...g, [field]: value } : g)));
    f.setErrors((e) => ({ ...e, [`g${i}.${field}`]: undefined }));
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    const v = f.values;
    const found = validate(v, guardians, isEdit);
    f.setErrors(found);
    if (Object.keys(found).length) {
      f.setSubmitError('Please fix the highlighted fields.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    f.setSubmitError('');

    const profile = {
      fullName: v.fullName.trim(),
      dateOfBirth: v.dateOfBirth,
      gender: v.gender,
      bloodGroup: v.bloodGroup || null,
      phone: v.phone.trim(),
      email: v.email.trim() || null,
      presentAddress: v.presentAddress.trim(),
      permanentAddress: (v.sameAddress ? v.presentAddress : v.permanentAddress).trim(),
      admissionDate: v.admissionDate,
      previousSchool: v.previousSchool.trim() || null,
    };

    try {
      let saved;
      if (isEdit) {
        saved = await studentService.update(id, { ...profile, ...(v.studentCode ? { studentCode: v.studentCode.trim() } : {}) });
        toast.success('Student profile updated.');
      } else {
        saved = await studentService.create({
          ...profile,
          ...(v.studentCode.trim() ? { studentCode: v.studentCode.trim() } : {}),
          enrollment: { classId: v.classId, sectionId: v.sectionId, ...(v.rollNumber ? { rollNumber: Number(v.rollNumber) } : {}) },
          guardians: guardians.map((g, i) => ({
            relationship: g.relationship,
            isPrimary: i === 0,
            guardian: {
              fullName: g.fullName.trim(),
              phone: g.phone.trim(),
              email: g.email.trim() || null,
              occupation: g.occupation.trim() || null,
            },
            ...(g.createLogin ? { account: { password: g.password } } : {}),
          })),
          ...(v.createLogin ? { account: { password: v.password } } : {}),
        });
        toast.success(`${saved.fullName} admitted with ID ${saved.studentCode}.`);
      }
      navigate(`/admin/students/${saved.id}`, { replace: true });
    } catch (err) {
      // Map nested server field names (guardians.0.guardian.phone) onto this form's keys.
      f.handleApiError(err, {
        DUPLICATE_STUDENT_ID: 'studentCode',
        DUPLICATE_ROLL_NUMBER: 'rollNumber',
        CLASS_NOT_FOUND: 'classId',
        SECTION_NOT_FOUND: 'sectionId',
        CLASS_CAPACITY_EXCEEDED: 'sectionId',
        SECTION_CAPACITY_EXCEEDED: 'sectionId',
      });
      f.setErrors((errs) => {
        const mapped = { ...errs };
        for (const [key, msg] of Object.entries(errs)) {
          const m = /^guardians\.(\d+)\.guardian\.(\w+)$/.exec(key);
          if (m) mapped[`g${m[1]}.${m[2]}`] = msg;
          if (key === 'enrollment.classId') mapped.classId = msg;
          if (key === 'enrollment.sectionId') mapped.sectionId = msg;
        }
        return mapped;
      });
      if (err.response?.data?.error?.code === 'EMAIL_ALREADY_EXISTS') f.setSubmitError(err.response.data.error.message);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const [saving, setSaving] = useState(false);
  const handleSubmit = async (e) => {
    setSaving(true);
    try {
      await onSubmit(e);
    } finally {
      setSaving(false);
    }
  };

  if (isEdit && existing.loading) return <Spinner />;
  if (isEdit && existing.error) return <LoadError error={existing.error} onRetry={existing.reload} />;

  const back = isEdit ? `/admin/students/${id}` : '/admin/students';
  const v = f.values;

  return (
    <>
      <Link to={back} className="mb-3 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> {isEdit ? 'Back to profile' : 'Students'}
      </Link>
      <PageHeader
        title={isEdit ? `Edit ${existing.data?.fullName}` : 'Admit a student'}
        description={isEdit ? 'Class placement is changed from the profile page (Transfer).' : 'The student ID is generated automatically.'}
      />

      <form onSubmit={handleSubmit} noValidate>
        <Card>
          {f.submitError && (
            <Alert type="error" className="mb-6">
              {f.submitError}
            </Alert>
          )}

          <FormSection title="Personal details">
            <TextField label="Full name" required autoComplete="off" {...f.bind('fullName')} />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <TextField label="Date of birth" type="date" max={todayInput()} required {...f.bind('dateOfBirth')} />
              <SelectField label="Gender" required placeholder="Select" options={GENDERS} {...f.bind('gender')} />
              <SelectField label="Blood group" placeholder="Unknown" options={BLOOD_GROUPS} {...f.bind('bloodGroup')} />
            </div>
          </FormSection>

          <FormSection title="Contact">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <TextField label="Phone" type="tel" required {...f.bind('phone')} />
              <TextField label="Email" type="email" hint="Optional" {...f.bind('email')} />
            </div>
            <TextAreaField label="Present address" rows={2} required {...f.bind('presentAddress')} />
            <CheckboxField
              label="Permanent address is the same"
              checked={v.sameAddress}
              onChange={(on) => f.setValue('sameAddress', on)}
            />
            {!v.sameAddress && <TextAreaField label="Permanent address" rows={2} required {...f.bind('permanentAddress')} />}
          </FormSection>

          <FormSection title="Admission" description={isEdit ? undefined : 'Placement in the current academic year.'}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <TextField label="Admission date" type="date" max={todayInput()} required {...f.bind('admissionDate')} />
              <TextField
                label="Student ID"
                placeholder={isEdit ? undefined : 'Generated automatically'}
                hint={isEdit ? undefined : 'Only fill this when importing an existing ID'}
                {...f.bind('studentCode')}
              />
            </div>
            <TextField label="Previous school" hint="Optional" {...f.bind('previousSchool')} />
            {!isEdit && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <SelectField
                  label="Class"
                  required
                  placeholder={classes.loading ? 'Loading…' : 'Select class'}
                  options={classOptions}
                  {...f.bind('classId')}
                  onChange={(e) => {
                    f.setValue('classId', e.target.value);
                    f.setValue('sectionId', '');
                  }}
                />
                <SelectField
                  label="Section"
                  required
                  placeholder="Select section"
                  options={sectionOptions}
                  disabled={!v.classId}
                  {...f.bind('sectionId')}
                />
                <TextField label="Roll number" type="number" min="1" hint="Blank = next available" {...f.bind('rollNumber')} />
              </div>
            )}
            {!isEdit && classes.error && <LoadError error={classes.error} message="Couldn't load classes. Is there an active academic year?" />}
          </FormSection>

          {!isEdit && (
            <FormSection title="Guardians" description="The first guardian is the primary contact. Parents with a login can follow their child's progress.">
              {guardians.map((g, i) => (
                <div key={i} className="rounded-lg border border-slate-200 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-sm font-medium text-slate-800">{i === 0 ? 'Primary guardian' : `Guardian ${i + 1}`}</p>
                    {i > 0 && (
                      <Button size="sm" variant="ghost" onClick={() => setGuardians((list) => list.filter((_, idx) => idx !== i))} aria-label="Remove guardian">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <TextField label="Full name" required value={g.fullName} onChange={(e) => setGuardian(i, 'fullName', e.target.value)} error={f.errors[`g${i}.fullName`]} />
                    <SelectField
                      label="Relationship"
                      value={g.relationship}
                      onChange={(e) => setGuardian(i, 'relationship', e.target.value)}
                      options={RELATIONSHIPS.map((r) => ({ value: r, label: r }))}
                    />
                    <TextField label="Phone" type="tel" required value={g.phone} onChange={(e) => setGuardian(i, 'phone', e.target.value)} error={f.errors[`g${i}.phone`]} />
                    <TextField label="Email" type="email" value={g.email} onChange={(e) => setGuardian(i, 'email', e.target.value)} error={f.errors[`g${i}.email`]} />
                    <TextField label="Occupation" value={g.occupation} onChange={(e) => setGuardian(i, 'occupation', e.target.value)} />
                  </div>
                  <div className="mt-4 space-y-3">
                    <CheckboxField
                      label="Create a parent login"
                      description="Signs in with the email above."
                      checked={g.createLogin}
                      onChange={(on) => setGuardian(i, 'createLogin', on)}
                    />
                    {g.createLogin && (
                      <PasswordField
                        label="Temporary password"
                        autoComplete="new-password"
                        value={g.password}
                        onChange={(e) => setGuardian(i, 'password', e.target.value)}
                        error={f.errors[`g${i}.password`]}
                        showChecks
                      />
                    )}
                  </div>
                </div>
              ))}
              {guardians.length < 4 && (
                <Button variant="secondary" size="sm" onClick={() => setGuardians((list) => [...list, { ...emptyGuardian(), relationship: 'Mother' }])}>
                  <Plus className="h-4 w-4" /> Add another guardian
                </Button>
              )}
            </FormSection>
          )}

          {!isEdit && (
            <FormSection title="Student login" description="Optional. Older students can sign in to see their results and routine.">
              <CheckboxField
                label="Create a student login"
                description="Signs in with the student's email address."
                checked={v.createLogin}
                onChange={(on) => f.setValue('createLogin', on)}
              />
              {v.createLogin && <PasswordField label="Temporary password" autoComplete="new-password" showChecks {...f.bind('password')} />}
            </FormSection>
          )}

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-5">
            <Link to={back}>
              <Button variant="secondary">Cancel</Button>
            </Link>
            <Button type="submit" loading={saving}>
              {isEdit ? 'Save changes' : 'Admit student'}
            </Button>
          </div>
        </Card>
      </form>
    </>
  );
}
