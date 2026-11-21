import { Briefcase, Pencil, Plus, Search, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Alert, Badge, Button, Card, EmptyState, LifecycleBadge, LoadError, Modal, PageHeader, Pagination, Spinner, Tabs } from '../../components/common/ui';
import { SelectField, TextAreaField, TextField } from '../../components/forms/fields';
import { useAsync, useDebounced } from '../../hooks/useAsync';
import { useToast } from '../../hooks/useAuth';
import { isEmail, isPhone, todayInput, useForm } from '../../hooks/useForm';
import { staffService, teacherService } from '../../services/school.service';
import { formatDate, formatMoney, toDateInput } from '../../utils/format';
import ProfileAvatar from '../../components/common/ProfileAvatar';

export const EMPLOYMENT_TYPES = [
  { value: 'FULL_TIME', label: 'Full time' },
  { value: 'PART_TIME', label: 'Part time' },
  { value: 'CONTRACT', label: 'Contract' },
];
export const EMPLOYMENT_STATUSES = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'ON_LEAVE', label: 'On leave' },
  { value: 'INACTIVE', label: 'Inactive' },
  { value: 'RESIGNED', label: 'Resigned' },
];

export default function TeachersPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'staff' ? 'staff' : 'teachers';
  return (
    <>
      <PageHeader title="Teachers & staff" description="Employee records, subject assignments and workload." />
      <Tabs
        tabs={[
          { value: 'teachers', label: 'Teachers' },
          { value: 'staff', label: 'Non-teaching staff' },
        ]}
        value={tab}
        onChange={(v) => setParams({ tab: v }, { replace: true })}
      />
      {tab === 'teachers' ? <TeachersTab /> : <StaffTab />}
    </>
  );
}

function Filters({ search, setSearch, status, setStatus, setPage, placeholder }) {
  return (
    <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          className="input pl-9"
          placeholder={placeholder}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          aria-label="Search"
        />
      </div>
      <select
        className="input sm:w-40"
        value={status}
        onChange={(e) => {
          setStatus(e.target.value);
          setPage(1);
        }}
        aria-label="Filter by status"
      >
        <option value="">Any status</option>
        {EMPLOYMENT_STATUSES.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function TeachersTab() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const debounced = useDebounced(search);
  const list = useAsync(() => teacherService.list({ search: debounced, status, page, limit: 15 }), [debounced, status, page]);
  const items = list.data?.items ?? [];

  return (
    <Card
      bodyClassName="p-0"
      title="Teachers"
      actions={
        <Link to="/admin/teachers/new">
          <Button size="sm">
            <Plus className="h-4 w-4" /> Add teacher
          </Button>
        </Link>
      }
    >
      <Filters search={search} setSearch={setSearch} status={status} setStatus={setStatus} setPage={setPage} placeholder="Search by name, employee ID, email or phone" />
      {list.error ? (
        <div className="p-4">
          <LoadError error={list.error} onRetry={list.reload} />
        </div>
      ) : list.loading && !list.data ? (
        <Spinner />
      ) : items.length === 0 ? (
        <EmptyState icon={Users} title="No teachers found" />
      ) : (
        <>
          <div className={`relative overflow-x-auto ${list.loading ? 'opacity-60' : ''}`}>
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-5 py-3">Teacher</th>
                  <th scope="col" className="hidden px-5 py-3 md:table-cell">Subjects</th>
                  <th scope="col" className="hidden px-5 py-3 sm:table-cell" title="Subject-class assignments this year">Workload</th>
                  <th scope="col" className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((t) => (
                  <tr key={t.id} onClick={() => navigate(`/admin/teachers/${t.id}`)} className="cursor-pointer hover:bg-slate-50">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <ProfileAvatar userId={t.user?.id} name={t.fullName} size="sm" />
                        <div>
                          <Link to={`/admin/teachers/${t.id}`} onClick={(e) => e.stopPropagation()} className="font-medium text-slate-900 hover:text-brand-700">
                            {t.fullName}
                          </Link>
                          <p className="text-xs text-slate-500">
                            <span className="font-mono">{t.employeeCode}</span> · {t.designation}
                            {t.department ? `, ${t.department}` : ''}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="hidden px-5 py-3 md:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {t.subjects.length === 0 ? (
                          <span className="text-slate-400">—</span>
                        ) : (
                          t.subjects.map(({ subject }) => (
                            <Badge key={subject.id} className="bg-amber-50 text-amber-800 ring-amber-600/20">
                              {subject.name}
                            </Badge>
                          ))
                        )}
                      </div>
                    </td>
                    <td className="hidden px-5 py-3 text-slate-600 sm:table-cell">
                      {t._count.classSubjects} classes
                      {t._count.sectionsAsClassTchr > 0 && <span className="block text-xs text-slate-400">Class teacher × {t._count.sectionsAsClassTchr}</span>}
                    </td>
                    <td className="px-5 py-3">
                      <LifecycleBadge status={t.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination meta={list.data.meta} onPageChange={setPage} />
        </>
      )}
    </Card>
  );
}

function StaffTab() {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null);
  const debounced = useDebounced(search);
  const list = useAsync(() => staffService.list({ search: debounced, status, page, limit: 15 }), [debounced, status, page]);
  const items = list.data?.items ?? [];

  return (
    <Card
      bodyClassName="p-0"
      title="Non-teaching staff"
      description="Office, accounts, transport, security and support staff"
      actions={
        <Button size="sm" onClick={() => setEditing('new')}>
          <Plus className="h-4 w-4" /> Add staff
        </Button>
      }
    >
      <Filters search={search} setSearch={setSearch} status={status} setStatus={setStatus} setPage={setPage} placeholder="Search by name, employee ID or phone" />
      {list.error ? (
        <div className="p-4">
          <LoadError error={list.error} onRetry={list.reload} />
        </div>
      ) : list.loading && !list.data ? (
        <Spinner />
      ) : items.length === 0 ? (
        <EmptyState icon={Briefcase} title="No staff found" />
      ) : (
        <>
          <ul className={`divide-y divide-slate-100 ${list.loading ? 'opacity-60' : ''}`}>
            {items.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="font-medium text-slate-900">{s.fullName}</p>
                  <p className="text-xs text-slate-500">
                    <span className="font-mono">{s.employeeCode}</span> · {s.designation}
                    {s.department ? `, ${s.department}` : ''} · {s.phone}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="hidden text-sm text-slate-600 sm:inline">{formatMoney(s.salary)}</span>
                  <LifecycleBadge status={s.status} />
                  <Button size="sm" variant="ghost" onClick={() => setEditing(s)} aria-label={`Edit ${s.fullName}`}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          <Pagination meta={list.data.meta} onPageChange={setPage} />
        </>
      )}
      <StaffModal
        open={Boolean(editing)}
        staff={editing === 'new' ? null : editing}
        onClose={() => setEditing(null)}
        onSaved={(s) => {
          toast.success(editing === 'new' ? `${s.fullName} added (${s.employeeCode}).` : `${s.fullName} updated.`);
          setEditing(null);
          list.reload();
        }}
      />
    </Card>
  );
}

function StaffModal({ open, staff, onClose, onSaved }) {
  const empty = {
    employeeCode: '', fullName: '', designation: '', department: '', phone: '', email: '', address: '',
    joiningDate: todayInput(), employmentType: 'FULL_TIME', status: 'ACTIVE', salary: '',
  };
  const f = useForm(empty);
  useEffect(() => {
    if (!open) return;
    f.setValues(
      staff
        ? {
            employeeCode: staff.employeeCode, fullName: staff.fullName, designation: staff.designation,
            department: staff.department ?? '', phone: staff.phone, email: staff.email ?? '', address: staff.address ?? '',
            joiningDate: toDateInput(staff.joiningDate), employmentType: staff.employmentType, status: staff.status,
            salary: staff.salary ?? '',
          }
        : empty,
    );
    f.setErrors({});
    f.setSubmitError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, staff]);

  const onSubmit = f.submit(
    (v) => {
      const e = {};
      if (v.fullName.trim().length < 2) e.fullName = 'Enter the full name';
      if (!v.designation.trim()) e.designation = 'Enter the designation';
      if (!isPhone(v.phone)) e.phone = 'Enter a valid phone number';
      if (v.email && !isEmail(v.email)) e.email = 'Enter a valid email address';
      if (!v.joiningDate) e.joiningDate = 'Enter the joining date';
      if (v.salary !== '' && (Number.isNaN(Number(v.salary)) || Number(v.salary) < 0)) e.salary = 'Enter a valid amount';
      return e;
    },
    async (v) => {
      const payload = {
        fullName: v.fullName.trim(),
        designation: v.designation.trim(),
        department: v.department.trim() || null,
        phone: v.phone.trim(),
        email: v.email.trim() || null,
        address: v.address.trim() || null,
        joiningDate: v.joiningDate,
        employmentType: v.employmentType,
        salary: v.salary === '' ? null : Number(v.salary),
        ...(v.employeeCode.trim() ? { employeeCode: v.employeeCode.trim() } : {}),
        ...(staff ? { status: v.status } : {}),
      };
      try {
        onSaved(staff ? await staffService.update(staff.id, payload) : await staffService.create(payload));
      } catch (err) {
        f.handleApiError(err, { DUPLICATE_EMPLOYEE_ID: 'employeeCode' });
      }
    },
  );

  return (
    <Modal
      open={open}
      onClose={f.submitting ? undefined : onClose}
      title={staff ? `Edit ${staff.fullName}` : 'Add staff member'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={f.submitting}>
            Cancel
          </Button>
          <Button type="submit" form="staff-form" loading={f.submitting}>
            {staff ? 'Save changes' : 'Add staff'}
          </Button>
        </>
      }
    >
      <form id="staff-form" onSubmit={onSubmit} noValidate className="space-y-4">
        {f.submitError && <Alert type="error">{f.submitError}</Alert>}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField label="Full name" required {...f.bind('fullName')} />
          <TextField label="Employee ID" placeholder={staff ? undefined : 'Generated automatically'} {...f.bind('employeeCode')} />
          <TextField label="Designation" placeholder="Accountant" required {...f.bind('designation')} />
          <TextField label="Department" {...f.bind('department')} />
          <TextField label="Phone" type="tel" required {...f.bind('phone')} />
          <TextField label="Email" type="email" {...f.bind('email')} />
          <TextField label="Joining date" type="date" max={todayInput()} required {...f.bind('joiningDate')} />
          <SelectField label="Employment type" options={EMPLOYMENT_TYPES} {...f.bind('employmentType')} />
          <TextField label="Monthly salary (৳)" type="number" min="0" step="0.01" hint="Visible to administrators only" {...f.bind('salary')} />
          {staff && <SelectField label="Status" options={EMPLOYMENT_STATUSES} {...f.bind('status')} />}
        </div>
        <TextAreaField label="Address" rows={2} {...f.bind('address')} />
        {staff && <p className="text-xs text-slate-400">Joined {formatDate(staff.joiningDate)}</p>}
      </form>
    </Modal>
  );
}
