import { ArrowLeft, ArrowRightLeft, Pencil, Plus, Trash2, UserX } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Alert,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Detail,
  LifecycleBadge,
  LoadError,
  Modal,
  PageHeader,
  Spinner,
} from '../../components/common/ui';
import CreateLoginModal from '../../components/forms/CreateLoginModal';
import { PasswordField, SelectField, TextField } from '../../components/forms/fields';
import { useAsync } from '../../hooks/useAsync';
import { useToast } from '../../hooks/useAuth';
import { isEmail, isPhone, useForm } from '../../hooks/useForm';
import { useClasses } from '../../hooks/useLookups';
import { studentService } from '../../services/school.service';
import { getErrorMessage } from '../../utils/errors';
import { formatDate, initials, titleCase } from '../../utils/format';
import { isStrongPassword } from '../../utils/password';
import ProfileAvatar from '../../components/common/ProfileAvatar';

export default function StudentProfilePage({ readOnly = false, basePath = '/admin/students' }) {
  const { id } = useParams();
  const toast = useToast();
  const student = useAsync(() => studentService.get(id), [id]);
  const [transferOpen, setTransferOpen] = useState(false);
  const [guardianOpen, setGuardianOpen] = useState(false);
  const [removing, setRemoving] = useState(null);
  const [statusChange, setStatusChange] = useState(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  if (student.loading && !student.data) return <Spinner />;
  if (student.error) {
    const code = student.error.response?.data?.error?.code;
    return (
      <LoadError
        error={student.error}
        onRetry={code === 'FORBIDDEN' || code === 'STUDENT_NOT_FOUND' ? undefined : student.reload}
        title={code === 'FORBIDDEN' ? 'Not one of your students' : 'Couldn’t load this student'}
      />
    );
  }

  const s = student.data;
  const current = s.enrollments.find((e) => e.academicYear.status === 'ACTIVE' && e.status === 'ACTIVE');
  const isActive = s.status === 'ACTIVE';

  async function run(action, message) {
    setBusy(true);
    try {
      await action();
      toast.success(message);
      student.reload();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
      setRemoving(null);
      setStatusChange(null);
    }
  }

  return (
    <>
      <Link to={basePath} className="mb-3 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> {readOnly ? 'My students' : 'Students'}
      </Link>

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <ProfileAvatar userId={s.user?.id} name={s.fullName} size="lg" />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">{s.fullName}</h1>
              <LifecycleBadge status={s.status} />
            </div>
            <p className="text-sm text-slate-500">
              <span className="font-mono">{s.studentCode}</span>
              {current && ` · ${current.class.name}, Section ${current.section.name} · Roll ${current.rollNumber}`}
            </p>
          </div>
        </div>
        {!readOnly && (
          <div className="flex flex-wrap gap-2">
            <Link to={`${basePath}/${s.id}/edit`}>
              <Button variant="secondary">
                <Pencil className="h-4 w-4" /> Edit
              </Button>
            </Link>
            {isActive && (
              <Button variant="secondary" onClick={() => setTransferOpen(true)}>
                <ArrowRightLeft className="h-4 w-4" /> {current ? 'Transfer' : 'Assign class'}
              </Button>
            )}
            {isActive ? (
              <Button variant="secondary" onClick={() => setStatusChange('INACTIVE')}>
                <UserX className="h-4 w-4" /> Deactivate
              </Button>
            ) : (
              <Button onClick={() => setStatusChange('ACTIVE')}>Reactivate</Button>
            )}
          </div>
        )}
      </div>

      {!isActive && (
        <Alert type="info" className="mb-6">
          This student is {s.status.toLowerCase()} and does not appear in active class lists.
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card title="Personal & contact">
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Detail label="Date of birth" value={formatDate(s.dateOfBirth)} />
              <Detail label="Gender" value={titleCase(s.gender)} />
              <Detail label="Blood group" value={s.bloodGroup} />
              <Detail label="Phone" value={s.phone} />
              <Detail label="Email" value={s.email} />
              <Detail label="Admission date" value={formatDate(s.admissionDate)} />
              <Detail label="Previous school" value={s.previousSchool} />
              <Detail label="Present address" value={s.presentAddress} className="sm:col-span-2 lg:col-span-1" />
              <Detail label="Permanent address" value={s.permanentAddress} className="sm:col-span-2 lg:col-span-1" />
            </dl>
          </Card>

          <Card title="Enrollment history" bodyClassName="p-0">
            {s.enrollments.length === 0 ? (
              <p className="px-5 py-4 text-sm text-slate-500">Not enrolled in any class.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {s.enrollments.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                    <span className="text-slate-800">
                      <span className="font-medium">{e.academicYear.name}</span> · {e.class.name}, Section {e.section.name} · Roll {e.rollNumber}
                    </span>
                    <LifecycleBadge status={e.status} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card
            title="Guardians"
            bodyClassName="p-0"
            actions={
              !readOnly && (
                <Button size="sm" variant="secondary" onClick={() => setGuardianOpen(true)}>
                  <Plus className="h-4 w-4" /> Add
                </Button>
              )
            }
          >
            <ul className="divide-y divide-slate-100">
              {s.guardians.map(({ guardian: g, relationship, isPrimary }) => (
                <li key={g.id} className="flex items-start justify-between gap-3 px-5 py-3">
                  <div className="min-w-0 text-sm">
                    <p className="font-medium text-slate-900">
                      {g.fullName}{' '}
                      {isPrimary && <Badge className="ml-1 bg-brand-50 text-brand-700 ring-brand-600/20">Primary</Badge>}
                    </p>
                    <p className="text-slate-500">{relationship}</p>
                    <p className="text-slate-600">{g.phone}</p>
                    {g.email && <p className="truncate text-slate-600">{g.email}</p>}
                    {g.user && <p className="mt-1 text-xs text-emerald-700">Has a parent login</p>}
                  </div>
                  {!readOnly && s.guardians.length > 1 && (
                    <Button size="sm" variant="ghost" onClick={() => setRemoving(g)} aria-label={`Remove ${g.fullName}`}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </Card>

          <Card title="Login account">
            {s.user ? (
              <dl className="space-y-3">
                <Detail label="Signs in as" value={s.user.username ? `${s.user.email} · @${s.user.username}` : s.user.email} />
                <Detail label="Account" value={titleCase(s.user.status)} />
                <Detail label="Last sign-in" value={s.user.lastLoginAt ? formatDate(s.user.lastLoginAt) : 'Never'} />
              </dl>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-slate-500">This student can't sign in yet.</p>
                {!readOnly && (
                  <Button size="sm" variant="secondary" onClick={() => setLoginOpen(true)}>
                    Create login
                  </Button>
                )}
              </div>
            )}
          </Card>
        </div>
      </div>

      {!readOnly && (
        <>
          <TransferModal
            open={transferOpen}
            student={s}
            current={current}
            onClose={() => setTransferOpen(false)}
            onDone={() => {
              setTransferOpen(false);
              toast.success(current ? 'Student transferred.' : 'Student assigned to class.');
              student.reload();
            }}
          />
          <CreateLoginModal
            open={loginOpen}
            person={s}
            roleLabel="student"
            onCreate={(account) => studentService.createLogin(s.id, account)}
            onClose={() => setLoginOpen(false)}
            onDone={() => {
              setLoginOpen(false);
              toast.success('Student login created.');
              student.reload();
            }}
          />
          <AddGuardianModal
            open={guardianOpen}
            studentId={s.id}
            onClose={() => setGuardianOpen(false)}
            onDone={() => {
              setGuardianOpen(false);
              toast.success('Guardian added.');
              student.reload();
            }}
          />
          <ConfirmDialog
            open={Boolean(removing)}
            title="Remove guardian?"
            message={`${removing?.fullName} will no longer be linked to ${s.fullName}.${removing?.user ? ' Their parent login will no longer show this child.' : ''}`}
            confirmLabel="Remove"
            loading={busy}
            onConfirm={() => run(() => studentService.removeGuardian(s.id, removing.id), 'Guardian removed.')}
            onCancel={() => setRemoving(null)}
          />
          <ConfirmDialog
            open={Boolean(statusChange)}
            title={statusChange === 'INACTIVE' ? 'Deactivate student?' : 'Reactivate student?'}
            message={
              statusChange === 'INACTIVE'
                ? `${s.fullName} will be removed from active class lists${s.user ? ' and their login will be disabled' : ''}. Records are kept and you can reactivate later.`
                : `${s.fullName} will appear in active class lists again${s.user ? ' and their login will be re-enabled' : ''}.`
            }
            confirmLabel={statusChange === 'INACTIVE' ? 'Deactivate' : 'Reactivate'}
            tone={statusChange === 'INACTIVE' ? 'danger' : 'primary'}
            loading={busy}
            onConfirm={() =>
              run(
                () => (statusChange === 'INACTIVE' ? studentService.deactivate(s.id) : studentService.update(s.id, { status: 'ACTIVE' })),
                statusChange === 'INACTIVE' ? 'Student deactivated.' : 'Student reactivated.',
              )
            }
            onCancel={() => setStatusChange(null)}
          />
        </>
      )}
    </>
  );
}

function TransferModal({ open, student, current, onClose, onDone }) {
  const classes = useClasses();
  const f = useForm({ classId: '', sectionId: '', rollNumber: '' });
  useEffect(() => {
    if (open) {
      f.setValues({ classId: current?.class.id ?? '', sectionId: '', rollNumber: '' });
      f.setErrors({});
      f.setSubmitError('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const klass = classes.data?.classes.find((c) => c.id === f.values.classId);
  const sections = useMemo(
    () => (klass?.sections ?? []).filter((sec) => sec.id !== current?.section.id),
    [klass, current],
  );

  const onSubmit = f.submit(
    (v) => {
      const e = {};
      if (!v.classId) e.classId = 'Choose a class';
      if (!v.sectionId) e.sectionId = 'Choose a section';
      if (v.rollNumber && (!Number.isInteger(Number(v.rollNumber)) || Number(v.rollNumber) < 1)) e.rollNumber = 'Enter a whole number';
      return e;
    },
    async (v) => {
      try {
        await studentService.setEnrollment(student.id, {
          classId: v.classId,
          sectionId: v.sectionId,
          ...(v.rollNumber ? { rollNumber: Number(v.rollNumber) } : {}),
        });
        onDone();
      } catch (err) {
        f.handleApiError(err, {
          DUPLICATE_ROLL_NUMBER: 'rollNumber',
          CLASS_CAPACITY_EXCEEDED: 'sectionId',
          SECTION_CAPACITY_EXCEEDED: 'sectionId',
        });
      }
    },
  );

  return (
    <Modal
      open={open}
      onClose={f.submitting ? undefined : onClose}
      title={current ? `Transfer ${student.fullName}` : `Assign ${student.fullName} to a class`}
      description={
        current
          ? `Currently in ${current.class.name}, Section ${current.section.name} (roll ${current.rollNumber}) for ${current.academicYear.name}.`
          : `Places the student in a class for ${classes.data?.academicYear.name ?? 'the active year'}.`
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={f.submitting}>
            Cancel
          </Button>
          <Button type="submit" form="transfer-form" loading={f.submitting}>
            {current ? 'Transfer' : 'Assign'}
          </Button>
        </>
      }
    >
      <form id="transfer-form" onSubmit={onSubmit} noValidate className="space-y-4">
        {f.submitError && <Alert type="error">{f.submitError}</Alert>}
        <SelectField
          label="Class"
          placeholder="Select class"
          options={(classes.data?.classes ?? []).map((c) => ({ value: c.id, label: c.name }))}
          {...f.bind('classId')}
          onChange={(e) => {
            f.setValue('classId', e.target.value);
            f.setValue('sectionId', '');
          }}
        />
        <SelectField
          label="Section"
          placeholder={klass && sections.length === 0 ? 'No other section in this class' : 'Select section'}
          options={sections.map((sec) => ({
            value: sec.id,
            label: `Section ${sec.name} (${sec._count.enrollments}${sec.capacity ? `/${sec.capacity}` : ''})`,
          }))}
          disabled={!klass}
          {...f.bind('sectionId')}
        />
        <TextField label="Roll number" type="number" min="1" hint="Blank = next available in the new section" {...f.bind('rollNumber')} />
      </form>
    </Modal>
  );
}

function AddGuardianModal({ open, studentId, onClose, onDone }) {
  const empty = { mode: 'new', guardianId: '', search: '', fullName: '', relationship: 'Mother', phone: '', email: '', occupation: '', isPrimary: false, createLogin: false, password: '' };
  const f = useForm(empty);
  const [matches, setMatches] = useState([]);

  useEffect(() => {
    if (open) {
      f.setValues(empty);
      f.setErrors({});
      f.setSubmitError('');
      setMatches([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (f.values.mode !== 'existing' || f.values.search.trim().length < 2) {
      setMatches([]);
      return undefined;
    }
    const t = setTimeout(() => {
      studentService.searchGuardians(f.values.search.trim()).then(setMatches).catch(() => setMatches([]));
    }, 300);
    return () => clearTimeout(t);
  }, [f.values.search, f.values.mode]);

  const onSubmit = f.submit(
    (v) => {
      const e = {};
      if (v.mode === 'existing') {
        if (!v.guardianId) e.guardianId = 'Choose a guardian';
      } else {
        if (v.fullName.trim().length < 2) e.fullName = 'Enter the name';
        if (!isPhone(v.phone)) e.phone = 'Enter a valid phone number';
        if (v.email && !isEmail(v.email)) e.email = 'Enter a valid email address';
        if (v.createLogin && !v.email) e.email = 'An email is needed for a parent login';
      }
      if (!v.relationship.trim()) e.relationship = 'Enter the relationship';
      if (v.createLogin && !isStrongPassword(v.password)) e.password = 'Password does not meet the requirements';
      return e;
    },
    async (v) => {
      try {
        await studentService.addGuardian(studentId, {
          relationship: v.relationship.trim(),
          isPrimary: v.isPrimary,
          ...(v.mode === 'existing'
            ? { guardianId: v.guardianId }
            : {
                guardian: {
                  fullName: v.fullName.trim(),
                  phone: v.phone.trim(),
                  email: v.email.trim() || null,
                  occupation: v.occupation.trim() || null,
                },
              }),
          ...(v.createLogin ? { account: { password: v.password } } : {}),
        });
        onDone();
      } catch (err) {
        f.handleApiError(err);
      }
    },
  );

  const chosen = matches.find((m) => m.id === f.values.guardianId);

  return (
    <Modal
      open={open}
      onClose={f.submitting ? undefined : onClose}
      title="Add guardian"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={f.submitting}>
            Cancel
          </Button>
          <Button type="submit" form="guardian-form" loading={f.submitting}>
            Add guardian
          </Button>
        </>
      }
    >
      <form id="guardian-form" onSubmit={onSubmit} noValidate className="space-y-4">
        {f.submitError && <Alert type="error">{f.submitError}</Alert>}
        <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1 text-sm" role="radiogroup" aria-label="Guardian type">
          {[
            ['new', 'New person'],
            ['existing', 'Existing guardian (sibling)'],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={f.values.mode === value}
              onClick={() => f.setValue('mode', value)}
              className={`rounded-md px-3 py-1.5 font-medium ${f.values.mode === value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}
            >
              {label}
            </button>
          ))}
        </div>

        {f.values.mode === 'existing' ? (
          <>
            <TextField label="Search guardians" placeholder="Name, phone or email" {...f.bind('search')} />
            {matches.length > 0 && (
              <ul className="max-h-48 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
                {matches.map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => f.setValue('guardianId', m.id)}
                      className={`w-full px-3 py-2 text-left text-sm hover:bg-slate-50 ${f.values.guardianId === m.id ? 'bg-brand-50' : ''}`}
                    >
                      <span className="font-medium text-slate-900">{m.fullName}</span> · {m.phone}
                      {m.students.length > 0 && (
                        <span className="block text-xs text-slate-500">Guardian of {m.students.map((x) => x.student.fullName).join(', ')}</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {f.errors.guardianId && <p className="text-xs text-red-600">{f.errors.guardianId}</p>}
            {chosen && <Alert type="info">Selected: {chosen.fullName}</Alert>}
          </>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TextField label="Full name" required {...f.bind('fullName')} />
            <TextField label="Phone" type="tel" required {...f.bind('phone')} />
            <TextField label="Email" type="email" {...f.bind('email')} />
            <TextField label="Occupation" {...f.bind('occupation')} />
          </div>
        )}

        <TextField label="Relationship to student" required {...f.bind('relationship')} />
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300 text-brand-600"
            checked={f.values.isPrimary}
            onChange={(e) => f.setValue('isPrimary', e.target.checked)}
          />
          Make primary contact
        </label>
        {(f.values.mode === 'new' || (chosen && !chosen.user)) && (
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-brand-600"
              checked={f.values.createLogin}
              onChange={(e) => f.setValue('createLogin', e.target.checked)}
            />
            Create a parent login
          </label>
        )}
        {f.values.createLogin && <PasswordField label="Temporary password" autoComplete="new-password" showChecks {...f.bind('password')} />}
      </form>
    </Modal>
  );
}
