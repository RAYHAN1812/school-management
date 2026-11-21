import { ArrowLeft, Pencil } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import CreateLoginModal from '../../components/forms/CreateLoginModal';
import { useToast } from '../../hooks/useAuth';
import { Badge, Button, Card, Detail, LifecycleBadge, LoadError, Spinner, StatCard } from '../../components/common/ui';
import { useAsync } from '../../hooks/useAsync';
import { teacherService } from '../../services/school.service';
import { formatDate, formatMoney, initials, titleCase } from '../../utils/format';
import ProfileAvatar from '../../components/common/ProfileAvatar';

export default function TeacherProfilePage() {
  const { id } = useParams();
  const teacher = useAsync(() => teacherService.get(id), [id]);
  const toast = useToast();
  const [loginOpen, setLoginOpen] = useState(false);

  if (teacher.loading && !teacher.data) return <Spinner />;
  if (teacher.error) return <LoadError error={teacher.error} onRetry={teacher.reload} />;
  const t = teacher.data;

  // Workload in the active year; older years are history.
  const activeClasses = t.classSubjects.filter((cs) => cs.class.academicYear.status === 'ACTIVE');
  const activeSections = t.sectionsAsClassTchr.filter((s) => s.class.academicYear.status === 'ACTIVE');

  return (
    <>
      <Link to="/admin/teachers" className="mb-3 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> Teachers & staff
      </Link>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <ProfileAvatar userId={t.user?.id} name={t.fullName} size="lg" />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">{t.fullName}</h1>
              <LifecycleBadge status={t.status} />
            </div>
            <p className="text-sm text-slate-500">
              <span className="font-mono">{t.employeeCode}</span> · {t.designation}
              {t.department ? `, ${t.department}` : ''}
            </p>
          </div>
        </div>
        <Link to={`/admin/teachers/${t.id}/edit`}>
          <Button variant="secondary">
            <Pencil className="h-4 w-4" /> Edit
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Classes this year" value={activeClasses.length} tone="sky" />
        <StatCard label="Class teacher of" value={activeSections.length} tone="emerald" />
        <StatCard label="Subjects qualified" value={t.subjects.length} tone="amber" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card title="Teaching this year" bodyClassName="p-0">
            {activeClasses.length === 0 && activeSections.length === 0 ? (
              <p className="px-5 py-4 text-sm text-slate-500">No classes assigned. Assign subjects per class under Academics.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {activeSections.map((s) => (
                  <li key={s.id} className="flex items-center justify-between px-5 py-2.5 text-sm">
                    <Link to={`/admin/classes/${s.class.id}`} className="font-medium text-slate-800 hover:text-brand-700">
                      {s.class.name} — Section {s.name}
                    </Link>
                    <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-600/20">Class teacher</Badge>
                  </li>
                ))}
                {activeClasses.map((cs) => (
                  <li key={cs.id} className="flex items-center justify-between px-5 py-2.5 text-sm">
                    <Link to={`/admin/classes/${cs.class.id}`} className="font-medium text-slate-800 hover:text-brand-700">
                      {cs.class.name}
                    </Link>
                    <Badge className="bg-amber-50 text-amber-800 ring-amber-600/20">{cs.subject.name}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Details">
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Detail label="Phone" value={t.phone} />
              <Detail label="Email" value={t.email} />
              <Detail label="Qualification" value={t.qualification} />
              <Detail label="Joining date" value={formatDate(t.joiningDate)} />
              <Detail label="Employment type" value={titleCase(t.employmentType)} />
              {'salary' in t && <Detail label="Monthly salary" value={formatMoney(t.salary)} />}
              <Detail label="Address" value={t.address} className="sm:col-span-2 lg:col-span-3" />
            </dl>
          </Card>
        </div>
        <div className="space-y-6">
          <Card title="Qualified subjects">
            {t.subjects.length === 0 ? (
              <p className="text-sm text-slate-500">None recorded.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {t.subjects.map(({ subject }) => (
                  <Badge key={subject.id} className="bg-amber-50 text-amber-800 ring-amber-600/20">
                    {subject.name}
                  </Badge>
                ))}
              </div>
            )}
          </Card>
          <Card title="Login account">
            {t.user ? (
              <dl className="space-y-3">
                <Detail label="Signs in as" value={t.user.username ? `${t.user.email} · @${t.user.username}` : t.user.email} />
                <Detail label="Account" value={titleCase(t.user.status)} />
                <Detail label="Last sign-in" value={t.user.lastLoginAt ? formatDate(t.user.lastLoginAt) : 'Never'} />
              </dl>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-slate-500">This teacher can't sign in yet.</p>
                <Button size="sm" variant="secondary" onClick={() => setLoginOpen(true)}>
                  Create login
                </Button>
              </div>
            )}
          </Card>
        </div>
      </div>
      <CreateLoginModal
        open={loginOpen}
        person={t}
        roleLabel="teacher"
        onCreate={(account) => teacherService.createLogin(t.id, account)}
        onClose={() => setLoginOpen(false)}
        onDone={() => {
          setLoginOpen(false);
          toast.success('Teacher login created.');
          teacher.reload();
        }}
      />
    </>
  );
}
