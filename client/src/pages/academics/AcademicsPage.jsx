import { BookOpen, CalendarRange, Pencil, Plus, School, Users } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Badge, Button, Card, ConfirmDialog, EmptyState, LifecycleBadge, LoadError, PageHeader, Spinner, Tabs } from '../../components/common/ui';
import { useAsync } from '../../hooks/useAsync';
import { useToast } from '../../hooks/useAuth';
import { academicService } from '../../services/school.service';
import { getErrorMessage } from '../../utils/errors';
import { formatDate } from '../../utils/format';
import { ClassModal, SubjectModal, YearModal } from './AcademicModals';

const TABS = [
  { value: 'classes', label: 'Classes & sections' },
  { value: 'subjects', label: 'Subjects' },
  { value: 'years', label: 'Academic years' },
];

export default function AcademicsPage() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.value === params.get('tab')) ? params.get('tab') : 'classes';
  const years = useAsync(() => academicService.listYears(), []);

  return (
    <>
      <PageHeader title="Academics" description="Ratonpur Central School: Play Group to Class 10, including Early Years, Primary and Secondary levels." />
      <Tabs tabs={TABS} value={tab} onChange={(v) => setParams({ tab: v }, { replace: true })} />
      {tab === 'classes' && <ClassesTab years={years} />}
      {tab === 'subjects' && <SubjectsTab />}
      {tab === 'years' && <YearsTab years={years} />}
    </>
  );
}

// ───────────────────────── Classes ─────────────────────────

function ClassesTab({ years }) {
  const toast = useToast();
  const [yearId, setYearId] = useState('');
  const classes = useAsync(() => academicService.listClasses(yearId || undefined), [yearId]);
  const subjects = useAsync(() => academicService.listSubjects(), []);
  const [creating, setCreating] = useState(false);

  const shownYear = classes.data?.academicYear;
  const noActiveYear = classes.error?.response?.data?.error?.code === 'ACADEMIC_YEAR_NOT_FOUND';

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <select
          className="input sm:w-64"
          value={yearId || shownYear?.id || ''}
          onChange={(e) => setYearId(e.target.value)}
          aria-label="Academic year"
        >
          {!shownYear && <option value="">Select academic year</option>}
          {(years.data ?? []).map((y) => (
            <option key={y.id} value={y.id}>
              {y.name} {y.status === 'ACTIVE' ? '(active)' : `(${y.status.toLowerCase()})`}
            </option>
          ))}
        </select>
        <Button onClick={() => setCreating(true)} disabled={!years.data?.length}>
          <Plus className="h-4 w-4" /> New class
        </Button>
      </div>

      {classes.loading && !classes.data ? (
        <Spinner />
      ) : noActiveYear ? (
        <Card>
          <EmptyState
            icon={CalendarRange}
            title="No active academic year"
            description="Create an academic year and mark it active, or pick a year above."
            action={
              <Link to="?tab=years">
                <Button variant="secondary">Go to academic years</Button>
              </Link>
            }
          />
        </Card>
      ) : classes.error ? (
        <LoadError error={classes.error} onRetry={classes.reload} />
      ) : classes.data.classes.length === 0 ? (
        <Card>
          <EmptyState icon={School} title={`No classes in ${shownYear.name} yet`} description="Create the first class to start enrolling students." />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {classes.data.classes.map((c) => {
            const enrolled = c._count.enrollments;
            const pct = Math.min(100, Math.round((enrolled / c.capacity) * 100));
            return (
              <Link key={c.id} to={`/admin/classes/${c.id}`} className="card group block p-5 transition-shadow hover:shadow-md">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-slate-900 group-hover:text-brand-700">{c.name}</h3>
                    <p className="text-xs text-slate-500">
                      {c.sections.length} section{c.sections.length === 1 ? '' : 's'} · {c._count.classSubjects} subjects
                    </p>
                  </div>
                  <Badge className="bg-slate-100 text-slate-700 ring-slate-500/20">
                    <Users className="mr-1 h-3 w-3" />
                    {enrolled}/{c.capacity}
                  </Badge>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
                  <div className={`h-full rounded-full ${pct >= 95 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-brand-500'}`} style={{ width: `${pct}%` }} />
                </div>
                <ul className="mt-4 space-y-1.5">
                  {c.sections.map((s) => (
                    <li key={s.id} className="flex items-center justify-between text-sm">
                      <span className="text-slate-700">
                        Section {s.name}
                        {s.roomNumber && <span className="text-slate-400"> · Room {s.roomNumber}</span>}
                      </span>
                      <span className="truncate pl-2 text-xs text-slate-500">
                        {s._count.enrollments} students · {s.classTeacher?.fullName ?? 'No class teacher'}
                      </span>
                    </li>
                  ))}
                </ul>
              </Link>
            );
          })}
        </div>
      )}

      <ClassModal
        open={creating}
        years={years.data}
        defaultYearId={yearId || shownYear?.id}
        subjects={subjects.data ?? []}
        onClose={() => setCreating(false)}
        onSaved={(c) => {
          setCreating(false);
          toast.success(`${c.name} created.`);
          setYearId(c.academicYearId);
          classes.reload();
        }}
      />
    </>
  );
}

// ───────────────────────── Subjects ─────────────────────────

function SubjectsTab() {
  const toast = useToast();
  const subjects = useAsync(() => academicService.listSubjects(), []);
  const [editing, setEditing] = useState(null); // null | 'new' | subject

  return (
    <Card
      bodyClassName="p-0"
      title="Subjects"
      description="Shared by every class in the school"
      actions={
        <Button size="sm" onClick={() => setEditing('new')}>
          <Plus className="h-4 w-4" /> New subject
        </Button>
      }
    >
      {subjects.loading && !subjects.data ? (
        <Spinner />
      ) : subjects.error ? (
        <div className="p-4">
          <LoadError error={subjects.error} onRetry={subjects.reload} />
        </div>
      ) : subjects.data.length === 0 ? (
        <EmptyState icon={BookOpen} title="No subjects yet" />
      ) : (
        <div className="relative overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              <tr>
                <th scope="col" className="px-5 py-3">Subject</th>
                <th scope="col" className="px-5 py-3">Code</th>
                <th scope="col" className="hidden px-5 py-3 sm:table-cell">Type</th>
                <th scope="col" className="hidden px-5 py-3 md:table-cell">Classes</th>
                <th scope="col" className="hidden px-5 py-3 md:table-cell">Teachers</th>
                <th scope="col" className="px-5 py-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {subjects.data.map((s) => (
                <tr key={s.id}>
                  <td className="px-5 py-3 font-medium text-slate-900">{s.name}</td>
                  <td className="px-5 py-3 font-mono text-xs text-slate-600">{s.code}</td>
                  <td className="hidden px-5 py-3 text-slate-600 sm:table-cell">
                    {[s.isOptional ? 'Optional' : 'Compulsory', s.hasPractical ? 'Practical' : null].filter(Boolean).join(' · ')}
                  </td>
                  <td className="hidden px-5 py-3 text-slate-600 md:table-cell">{s._count.classSubjects}</td>
                  <td className="hidden px-5 py-3 text-slate-600 md:table-cell">{s._count.teachers}</td>
                  <td className="px-5 py-3 text-right">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(s)} aria-label={`Edit ${s.name}`}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <SubjectModal
        open={Boolean(editing)}
        subject={editing === 'new' ? null : editing}
        onClose={() => setEditing(null)}
        onSaved={(s) => {
          toast.success(editing === 'new' ? `${s.name} added.` : `${s.name} updated.`);
          setEditing(null);
          subjects.reload();
        }}
      />
    </Card>
  );
}

// ───────────────────────── Academic years ─────────────────────────

function YearsTab({ years }) {
  const toast = useToast();
  const [editing, setEditing] = useState(null);
  const [activating, setActivating] = useState(null);
  const [busy, setBusy] = useState(false);

  async function activate() {
    setBusy(true);
    try {
      await academicService.updateYear(activating.id, { status: 'ACTIVE' });
      toast.success(`${activating.name} is now the active academic year.`);
      setActivating(null);
      years.reload();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const current = years.data?.find((y) => y.status === 'ACTIVE');

  return (
    <Card
      bodyClassName="p-0"
      title="Academic years"
      description="The active year is used by default across the system"
      actions={
        <Button size="sm" onClick={() => setEditing('new')}>
          <Plus className="h-4 w-4" /> New year
        </Button>
      }
    >
      {years.loading && !years.data ? (
        <Spinner />
      ) : years.error ? (
        <div className="p-4">
          <LoadError error={years.error} onRetry={years.reload} />
        </div>
      ) : years.data.length === 0 ? (
        <EmptyState icon={CalendarRange} title="No academic years yet" />
      ) : (
        <ul className="divide-y divide-slate-100">
          {years.data.map((y) => (
            <li key={y.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-medium text-slate-900">{y.name}</p>
                  <LifecycleBadge status={y.status} />
                </div>
                <p className="text-sm text-slate-500">
                  {formatDate(y.startDate)} – {formatDate(y.endDate)} · {y._count.classes} classes · {y._count.enrollments} enrollments
                </p>
              </div>
              <div className="flex gap-2">
                {y.status !== 'ACTIVE' && (
                  <Button size="sm" variant="secondary" onClick={() => setActivating(y)}>
                    Make active
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => setEditing(y)} aria-label={`Edit ${y.name}`}>
                  <Pencil className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <YearModal
        open={Boolean(editing)}
        year={editing === 'new' ? null : editing}
        onClose={() => setEditing(null)}
        onSaved={(y) => {
          toast.success(editing === 'new' ? `Academic year ${y.name} created.` : `${y.name} updated.`);
          setEditing(null);
          years.reload();
        }}
      />
      <ConfirmDialog
        open={Boolean(activating)}
        title={`Make ${activating?.name} the active year?`}
        message={
          current
            ? `${current.name} will be marked as completed. Lists, dashboards and new admissions will default to ${activating?.name}.`
            : `Lists, dashboards and new admissions will default to ${activating?.name}.`
        }
        confirmLabel="Make active"
        tone="primary"
        loading={busy}
        onConfirm={activate}
        onCancel={() => setActivating(null)}
      />
    </Card>
  );
}
