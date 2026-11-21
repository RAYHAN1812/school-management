import { BookOpen, CalendarCheck, CheckCircle2, ClipboardList, Clock, NotebookPen } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Alert, Badge, Button, Card, EmptyState, LifecycleBadge, LoadError, PageHeader, Spinner, StatCard } from '../../components/common/ui';
import { useAsync } from '../../hooks/useAsync';
import { useAuth } from '../../hooks/useAuth';
import { SCHOOL } from '../../config/school';
import { dashboardService } from '../../services/admin.service';
import { formatDate } from '../../utils/format';

const nowHHMM = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export default function TeacherDashboard() {
  const { user } = useAuth();
  const { data, error, loading, reload } = useAsync(() => dashboardService.summary(), []);

  if (loading && !data) return <Spinner label="Loading dashboard…" />;
  if (error) return <LoadError error={error} onRetry={reload} />;
  const first = user.fullName.split(' ')[0];

  if (!data.profile) {
    return (
      <>
        <PageHeader title={`Welcome to ${SCHOOL.name}, ${first}`} />
        <Alert type="info" title="Teacher profile not set up yet">
          Your sign-in works, but the school hasn't linked a teacher profile to your account. Ask your school administrator.
        </Alert>
      </>
    );
  }

  const pendingAttendance = data.attendanceTasks.filter((t) => !t.taken);
  const now = nowHHMM();

  return (
    <>
      <PageHeader
        title={`Welcome to ${SCHOOL.name}, ${first}`}
        description={`${data.profile.designation}${data.profile.department ? ` · ${data.profile.department}` : ''} · ${formatDate(data.today.date)}`}
      />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Classes today" value={data.today.periods.length} icon={Clock} tone="brand" />
        <Link to="/teacher/attendance">
          <StatCard label="Attendance to take" value={pendingAttendance.length} icon={CalendarCheck} tone={pendingAttendance.length ? 'amber' : 'emerald'} hint={`${data.attendanceTasks.length - pendingAttendance.length}/${data.attendanceTasks.length} done today`} />
        </Link>
        <Link to="/teacher/homework">
          <StatCard label="To grade" value={data.pendingEvaluations.total} icon={NotebookPen} tone={data.pendingEvaluations.total ? 'amber' : 'slate'} />
        </Link>
        <StatCard label="Subjects" value={data.subjects.length} icon={BookOpen} tone="sky" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card title="Today's timetable" className="xl:col-span-2" bodyClassName="p-0" actions={<Link to="/teacher/timetable" className="text-xs font-medium text-brand-600">Full week</Link>}>
          {data.today.periods.length === 0 ? (
            <EmptyState icon={Clock} title="No classes today" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.today.periods.map((p) => {
                const current = p.startTime <= now && now < p.endTime;
                const done = p.endTime <= now;
                return (
                  <li key={p.id} className={`flex items-center justify-between gap-3 px-5 py-3 ${current ? 'bg-brand-50/60' : ''}`}>
                    <div className="flex items-center gap-4">
                      <span className={`w-24 shrink-0 text-sm tabular-nums ${done ? 'text-slate-400' : 'text-slate-700'}`}>
                        {p.startTime}–{p.endTime}
                      </span>
                      <div>
                        <p className={`font-medium ${done ? 'text-slate-500' : 'text-slate-900'}`}>{p.subject}</p>
                        <p className="text-xs text-slate-500">
                          {p.className}
                          {p.roomNumber ? ` · Room ${p.roomNumber}` : ''}
                        </p>
                      </div>
                    </div>
                    {current && <Badge className="bg-brand-600 text-white ring-brand-600">Now</Badge>}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
        <Card title="Attendance today" bodyClassName="p-0">
          {data.attendanceTasks.length === 0 ? (
            <EmptyState title="No sections assigned" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.attendanceTasks.map((t) => (
                <li key={t.sectionId} className="flex items-center justify-between gap-2 px-5 py-2.5 text-sm">
                  <span className="text-slate-800">{t.label}</span>
                  {t.taken ? (
                    <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
                      <CheckCircle2 className="h-4 w-4" /> Done
                    </span>
                  ) : (
                    <Link to="/teacher/attendance">
                      <Button size="sm" variant="secondary">
                        Take
                      </Button>
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Homework to grade" bodyClassName="p-0" actions={<Link to="/teacher/homework" className="text-xs font-medium text-brand-600">Homework</Link>}>
          {data.pendingEvaluations.assignments.length === 0 ? (
            <EmptyState icon={NotebookPen} title="Nothing waiting to be graded" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.pendingEvaluations.assignments.map((a) => (
                <li key={a.id}>
                  <Link to={`/teacher/homework/${a.id}`} className="flex items-center justify-between gap-2 px-5 py-3 hover:bg-slate-50">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900">{a.title}</p>
                      <p className="text-xs text-slate-500">
                        {a.className} · due {formatDate(a.dueDate)}
                      </p>
                    </div>
                    <Badge className="bg-amber-50 text-amber-800 ring-amber-600/20">{a.pending} to grade</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Exams" bodyClassName="p-0" actions={<Link to="/teacher/exams" className="text-xs font-medium text-brand-600">Marks entry</Link>}>
          {data.upcomingExams.length === 0 ? (
            <EmptyState icon={ClipboardList} title="No exams for your classes" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.upcomingExams.map((e) => (
                <li key={e.id}>
                  <Link to={`/teacher/exams/${e.id}`} className="flex items-center justify-between gap-2 px-5 py-3 hover:bg-slate-50">
                    <div>
                      <p className="text-sm font-medium text-slate-900">{e.name}</p>
                      <p className="text-xs text-slate-500">
                        {e.class.name}
                        {e.startDate ? ` · ${formatDate(e.startDate)}` : ''}
                      </p>
                    </div>
                    <LifecycleBadge status={e.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title="My classes & subjects" className="mt-6">
        <div className="flex flex-wrap gap-2">
          {data.classTeacherOf.map((s) => (
            <Badge key={s.section.id} className="bg-emerald-50 text-emerald-700 ring-emerald-600/20">
              Class teacher · {s.class.name} {s.section.name}
            </Badge>
          ))}
          {data.classes.map((c) => (
            <Badge key={`${c.class.id}-${c.subject.id}`} className="bg-slate-100 text-slate-700 ring-slate-500/20">
              {c.class.name} · {c.subject.name}
            </Badge>
          ))}
        </div>
      </Card>
    </>
  );
}
