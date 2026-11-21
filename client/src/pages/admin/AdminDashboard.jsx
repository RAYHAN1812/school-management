import { Activity, Building2, CalendarCheck, ClipboardList, GraduationCap, Megaphone, School, UserPlus, Users, Wallet } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Badge, Button, Card, EmptyState, LifecycleBadge, LoadError, PageHeader, Spinner, StatCard } from '../../components/common/ui';
import { useAsync } from '../../hooks/useAsync';
import { useAuth } from '../../hooks/useAuth';
import { dashboardService } from '../../services/admin.service';
import { formatDate, formatMoney, humanizeAction, timeAgo } from '../../utils/format';
import { ROLE_BADGE, ROLE_LABELS, ROLES } from '../../utils/roles';
import { SCHOOL } from '../../config/school';

const shortMonth = (m) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' });
const shortDay = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' });
const compactMoney = (v) => (v >= 100000 ? `৳${(v / 100000).toFixed(1)}L` : v >= 1000 ? `৳${Math.round(v / 1000)}k` : `৳${v}`);

export default function AdminDashboard() {
  const { user } = useAuth();
  const { data, error, loading, reload } = useAsync(() => dashboardService.summary(), []);
  const isSuper = user.role.key === ROLES.SUPER_ADMIN;

  if (loading && !data) return <Spinner label="Loading dashboard…" />;
  if (error) return <LoadError error={error} onRetry={reload} title="Couldn't load the dashboard" />;

  const { stats, todayAttendance: ta, fees, attendanceTrend, collectionTrend, upcomingExams, recentAdmissions, latestNotices, usersByRole, recentActivity } = data;

  return (
    <>
      <PageHeader
        title={`Welcome to ${SCHOOL.name}, ${user.fullName.split(' ')[0]}`}
        description={isSuper && data.scope === 'all-schools' ? `${SCHOOL.name} · ${SCHOOL.nameBn} · Play Group to Class 10` : `Overview of ${SCHOOL.name} · ${formatDate(ta.date)} · Play Group to Class 10`}
        actions={
          <Link to="/admin/reports">
            <Button variant="secondary">Reports</Button>
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        {isSuper && stats.totalSchools != null && <StatCard label="Schools" value={stats.totalSchools} icon={Building2} tone="purple" />}
        <Link to="/admin/students">
          <StatCard label="Students" value={stats.totalStudents} icon={GraduationCap} tone="emerald" />
        </Link>
        <Link to="/admin/teachers">
          <StatCard label="Teachers" value={stats.totalTeachers} icon={Users} tone="amber" />
        </Link>
        <Link to="/admin/academics">
          <StatCard label="Active classes" value={stats.activeClasses} icon={School} tone="sky" />
        </Link>
        <Link to="/admin/attendance?tab=reports">
          <StatCard
            label="Attendance today"
            value={ta.percentage == null ? '—' : `${ta.percentage}%`}
            icon={CalendarCheck}
            tone={ta.percentage != null && ta.percentage < 80 ? 'amber' : 'emerald'}
            hint={`${ta.sectionsTaken}/${ta.sectionsTotal} sections taken`}
          />
        </Link>
        <Link to="/admin/finance">
          <StatCard label="Fees outstanding" value={formatMoney(fees.outstanding)} icon={Wallet} tone="amber" hint={`${fees.openInvoices} open invoices`} />
        </Link>
        <Link to="/admin/finance?tab=reports">
          <StatCard label="Collected this month" value={formatMoney(fees.collectedThisMonth)} icon={Wallet} tone="emerald" />
        </Link>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card title="Attendance trend" description="% present (incl. late) on recent school days">
          {attendanceTrend.length === 0 ? (
            <EmptyState icon={CalendarCheck} title="No attendance recorded yet" />
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={attendanceTrend} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="date" tickFormatter={shortDay} tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} unit="%" />
                  <Tooltip labelFormatter={(d) => formatDate(d)} formatter={(v) => [`${v}%`, 'Present']} />
                  <Line type="monotone" dataKey="percentage" stroke="#059669" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
        <Card title="Fee collection" description="Last six months">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={collectionTrend} margin={{ top: 8, right: 12, left: -6, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="month" tickFormatter={shortMonth} tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                <YAxis tickFormatter={compactMoney} tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                <Tooltip labelFormatter={shortMonth} formatter={(v) => [formatMoney(v), 'Collected']} cursor={{ fill: '#f1f5f9' }} />
                <Bar dataKey="amount" fill="#2149ed" radius={[6, 6, 0, 0]} maxBarSize={44} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card title="Upcoming exams" bodyClassName="p-0" actions={<Link to="/admin/exams" className="text-xs font-medium text-brand-600">All exams</Link>}>
          {upcomingExams.length === 0 ? (
            <EmptyState icon={ClipboardList} title="No exams scheduled" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {upcomingExams.map((e) => (
                <li key={e.id}>
                  <Link to={`/admin/exams/${e.id}`} className="flex items-center justify-between gap-2 px-5 py-3 hover:bg-slate-50">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900">{e.name}</p>
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
        <Card title="Recent admissions" bodyClassName="p-0" actions={<Link to="/admin/students/new" className="text-xs font-medium text-brand-600">Admit</Link>}>
          {recentAdmissions.length === 0 ? (
            <EmptyState icon={UserPlus} title="No students yet" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {recentAdmissions.map((s) => (
                <li key={s.id}>
                  <Link to={`/admin/students/${s.id}`} className="flex items-center justify-between gap-2 px-5 py-3 hover:bg-slate-50">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900">{s.fullName}</p>
                      <p className="text-xs text-slate-500">
                        {s.studentCode}
                        {s.enrollments[0] ? ` · ${s.enrollments[0].class.name}-${s.enrollments[0].section.name}` : ''}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-slate-400">{formatDate(s.admissionDate)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Latest notices" bodyClassName="p-0" actions={<Link to="/admin/notices" className="text-xs font-medium text-brand-600">Notices</Link>}>
          {latestNotices.length === 0 ? (
            <EmptyState icon={Megaphone} title="No notices published" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {latestNotices.map((n) => (
                <li key={n.id} className="px-5 py-3">
                  <p className="truncate text-sm font-medium text-slate-900">{n.title}</p>
                  <p className="text-xs text-slate-500">
                    {n.audience.charAt(0) + n.audience.slice(1).toLowerCase()} · {timeAgo(n.publishDate)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card title="Accounts by role" className="xl:col-span-1">
          <ul className="space-y-2">
            {usersByRole.map((r) => (
              <li key={r.role} className="flex items-center justify-between text-sm">
                <Badge className={ROLE_BADGE[r.role]}>{ROLE_LABELS[r.role]}</Badge>
                <span className="font-semibold tabular-nums">{r.count}</span>
              </li>
            ))}
          </ul>
          <Link to="/admin/users" className="mt-4 inline-block text-xs font-medium text-brand-600">
            Manage accounts
          </Link>
        </Card>
        <Card
          title="Recent activity"
          description="From the audit log"
          className="xl:col-span-2"
          bodyClassName="p-0"
          actions={<Link to="/admin/audit-logs" className="text-xs font-medium text-brand-600">View all</Link>}
        >
          {recentActivity.length === 0 ? (
            <EmptyState icon={Activity} title="No activity yet" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {recentActivity.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-slate-800">{humanizeAction(a.action)}</p>
                    <p className="truncate text-xs text-slate-500">{a.user?.fullName ?? 'System'}</p>
                  </div>
                  <span className="shrink-0 text-xs text-slate-400">{timeAgo(a.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
