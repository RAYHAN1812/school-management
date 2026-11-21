import { Award, CalendarCheck, CheckCircle2, ClipboardList, CreditCard, Mail, Phone, Wallet, XCircle } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Alert, Badge, Button, Card, EmptyState, LifecycleBadge, LoadError, PageHeader, Spinner, StatCard } from '../../components/common/ui';
import ProfileAvatar from '../../components/common/ProfileAvatar';
import WeeklyTimetable, { todayEnum } from '../../components/common/WeeklyTimetable';
import { useArea } from '../../hooks/useArea';
import { useAsync } from '../../hooks/useAsync';
import { useAuth, useToast } from '../../hooks/useAuth';
import { SCHOOL } from '../../config/school';
import { examService } from '../../services/exam.service';
import { METHOD_LABELS, financeService } from '../../services/finance.service';
import { attendanceService, timetableService } from '../../services/operations.service';
import { homeworkService, libraryService, noticeService, transportService } from '../../services/campus.service';
import { portalService } from '../../services/portal.service';
import { getErrorMessage } from '../../utils/errors';
import { formatDate, formatMoney } from '../../utils/format';
import { ROLES } from '../../utils/roles';
import PortalShell from './PortalShell';

const pct = (v) => (v == null ? '—' : `${v}%`);
const STATUS_STYLE = {
  PRESENT: 'bg-emerald-100 text-emerald-800',
  LATE: 'bg-amber-100 text-amber-800',
  ABSENT: 'bg-red-100 text-red-700',
  LEAVE: 'bg-sky-100 text-sky-800',
};
const STATUS_LABEL = { PRESENT: 'Present', LATE: 'Late', ABSENT: 'Absent', LEAVE: 'Leave' };

// ───────────────────────── Home ─────────────────────────

export function PortalHome() {
  const { user } = useAuth();
  const { base } = useArea();
  const isParent = user.role.key === ROLES.PARENT;
  return (
    <PortalShell
      title={`Welcome to ${SCHOOL.name}, ${user.fullName.split(' ')[0]}`}
      description={isParent ? 'How your child is doing at school.' : 'Your attendance, results and classes.'}
    >
      {(child, { withChild }) => <Overview key={child.id} child={child} base={base} isParent={isParent} withChild={withChild} />}
    </PortalShell>
  );
}

function Overview({ child, base, isParent, withChild }) {
  const o = useAsync(() => portalService.overview(child.id), [child.id]);
  if (o.loading && !o.data) return <Spinner />;
  if (o.error) return <LoadError error={o.error} onRetry={o.reload} />;
  const d = o.data;

  return (
    <>
      <div className="card mb-6 flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
        <ProfileAvatar userId={d.student.user?.id} name={d.student.fullName} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="text-lg font-semibold text-slate-900">{d.student.fullName}</p>
          <p className="text-sm text-slate-500">
            <span className="font-mono">{d.student.studentCode}</span>
            {d.enrollment && ` · ${d.enrollment.class.name}, Section ${d.enrollment.section.name} · Roll ${d.enrollment.rollNumber}`}
            {d.academicYear && ` · ${d.academicYear.name}`}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Link to={withChild(`${base}/attendance`)}>
          <StatCard label="Attendance this year" value={pct(d.attendance.percentage)} icon={CalendarCheck} tone={d.attendance.percentage != null && d.attendance.percentage < 75 ? 'amber' : 'emerald'} hint={`${d.attendance.absent} absent · ${d.attendance.late} late`} />
        </Link>
        <Link to={withChild(`${base}/results`)}>
          <StatCard
            label={d.latestResult ? `GPA · ${d.latestResult.exam.name}` : 'Latest result'}
            value={d.latestResult ? (d.latestResult.gpa ?? 0).toFixed(2) : '—'}
            icon={Award}
            tone="brand"
            hint={d.latestResult ? `${d.latestResult.result === 'PASS' ? 'Passed' : 'Failed'} · position ${d.latestResult.position ?? '—'} of ${d.latestResult.outOf}` : 'No published results yet'}
          />
        </Link>
        {isParent ? (
          <Link to={withChild(`${base}/fees`)}>
            <StatCard
              label="Fees outstanding"
              value={formatMoney(d.fees.outstanding)}
              icon={Wallet}
              tone={d.fees.overdue ? 'amber' : 'slate'}
              hint={d.fees.overdue ? `${d.fees.overdue} overdue invoice${d.fees.overdue > 1 ? 's' : ''}` : d.fees.openInvoices ? `${d.fees.openInvoices} open invoice(s)` : 'All paid'}
            />
          </Link>
        ) : (
          <StatCard label="Published results" value={d.resultsCount} icon={ClipboardList} tone="sky" />
        )}
        <StatCard label="Upcoming exams" value={d.upcomingExams.length} icon={ClipboardList} tone="purple" hint={d.upcomingExams[0] ? `${d.upcomingExams[0].name}${d.upcomingExams[0].startDate ? ` · ${formatDate(d.upcomingExams[0].startDate)}` : ''}` : undefined} />
      </div>

      {isParent && d.fees.overdue > 0 && (
        <Alert type="error" className="mt-6" title="Fees overdue" action={<Link to={withChild(`${base}/fees`)}><Button size="sm">View fees</Button></Link>}>
          {formatMoney(d.fees.outstanding)} is outstanding. The earliest invoice was due {formatDate(d.fees.nextDue.dueDate)}.
        </Alert>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card title="Recent attendance" actions={<Link to={withChild(`${base}/attendance`)} className="text-xs font-medium text-brand-600">All attendance</Link>}>
          {d.attendance.recent.length === 0 ? (
            <p className="text-sm text-slate-500">No attendance recorded yet.</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {d.attendance.recent.map((r) => (
                <li key={r.date} className={`rounded-md px-2.5 py-1.5 text-xs font-medium ${STATUS_STYLE[r.status]}`} title={r.remarks ?? undefined}>
                  {formatDate(r.date).slice(0, 6)} · {STATUS_LABEL[r.status]}
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title={isParent ? 'Contact teachers' : 'Your teachers'} bodyClassName="p-0">
          {d.teachers.length === 0 ? (
            <p className="px-5 py-4 text-sm text-slate-500">No teachers assigned yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {d.teachers.map((t) => (
                <li key={t.id} className="flex flex-col gap-1 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium text-slate-900">{t.fullName}</p>
                    <p className="text-xs text-slate-500">{t.roles.join(' · ')}</p>
                  </div>
                  {isParent && (
                    <div className="flex gap-3 text-sm">
                      <a href={`tel:${t.phone.replace(/\s/g, '')}`} className="inline-flex items-center gap-1 text-brand-600 hover:text-brand-700">
                        <Phone className="h-3.5 w-3.5" /> {t.phone}
                      </a>
                      <a href={`mailto:${t.email}`} className="inline-flex items-center gap-1 text-brand-600 hover:text-brand-700">
                        <Mail className="h-3.5 w-3.5" /> Email
                      </a>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <TodayPanel studentId={d.student.id} isParent={isParent} base={base} withChild={withChild} />
      <TransportCard studentId={d.student.id} />
    </>
  );
}

/** Today's classes, homework still to hand in, and the newest notices. */
function TodayPanel({ studentId, isParent, base, withChild }) {
  const routine = useAsync(() => timetableService.mine(isParent ? studentId : undefined), [studentId]);
  const homework = useAsync(() => homeworkService.list({ when: 'upcoming', ...(isParent ? { studentId } : {}) }), [studentId]);
  const notices = useAsync(() => noticeService.list({ limit: 3 }), []);
  const today = todayEnum();
  const periods = (routine.data?.entries ?? []).filter((e) => e.dayOfWeek === today).sort((a, b) => a.startMinute - b.startMinute);
  const due = (homework.data ?? []).filter((a) => !a.mySubmission);

  return (
    <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
      <Card title="Today's classes" bodyClassName="p-0" actions={<Link to={withChild(`${base}/timetable`)} className="text-xs font-medium text-brand-600">Week</Link>}>
        {periods.length === 0 ? (
          <p className="px-5 py-4 text-sm text-slate-500">No classes today.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {periods.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                <span className="w-24 shrink-0 tabular-nums text-slate-500">
                  {p.startTime}–{p.endTime}
                </span>
                <span className="font-medium text-slate-900">{p.subject.name}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="Homework due" bodyClassName="p-0" actions={<Link to={withChild(`${base}/homework`)} className="text-xs font-medium text-brand-600">All</Link>}>
        {due.length === 0 ? (
          <p className="px-5 py-4 text-sm text-slate-500">Nothing due. 🎉</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {due.slice(0, 4).map((a) => (
              <li key={a.id} className="px-5 py-2.5">
                <p className="text-sm font-medium text-slate-900">{a.title}</p>
                <p className="text-xs text-slate-500">
                  {a.subject.name} · due {formatDate(a.dueDate)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="Notices" bodyClassName="p-0" actions={<Link to={`${base}/notices`} className="text-xs font-medium text-brand-600">All</Link>}>
        {(notices.data?.items ?? []).length === 0 ? (
          <p className="px-5 py-4 text-sm text-slate-500">No notices.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {notices.data.items.map((n) => (
              <li key={n.id} className="px-5 py-2.5">
                <p className={`text-sm text-slate-900 ${n.read ? '' : 'font-semibold'}`}>{n.title}</p>
                <p className="text-xs text-slate-500">{formatDate(n.publishDate)}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

/** Bus route card (only shown when the student uses school transport). */
function TransportCard({ studentId }) {
  const t = useAsync(() => transportService.studentTransport(studentId), [studentId]);
  if (!t.data) return null;
  const { route, pickupPoint } = t.data;
  const driver = route.bus?.driver ?? (route.bus?.driverName ? { fullName: route.bus.driverName, phone: route.bus.driverPhone } : null);
  return (
    <Card title="School bus" className="mt-6">
      <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs text-slate-500">Route</dt>
          <dd className="font-medium text-slate-900">
            {route.routeCode} · {route.name}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Pickup point</dt>
          <dd className="font-medium text-slate-900">{pickupPoint ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Bus</dt>
          <dd className="font-medium text-slate-900">{route.bus?.busNumber ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Driver</dt>
          <dd className="font-medium text-slate-900">
            {driver ? (
              <>
                {driver.fullName}
                {driver.phone && (
                  <a href={`tel:${driver.phone.replace(/\s/g, '')}`} className="ml-2 text-brand-600">
                    {driver.phone}
                  </a>
                )}
              </>
            ) : (
              '—'
            )}
          </dd>
        </div>
      </dl>
    </Card>
  );
}

// ───────────────────────── Library ─────────────────────────

export function PortalLibrary() {
  return <PortalShell title="Library">{(child) => <LibraryView key={child.id} studentId={child.id} />}</PortalShell>;
}

function LibraryView({ studentId }) {
  const l = useAsync(() => libraryService.studentLibrary(studentId), [studentId]);
  if (l.loading && !l.data) return <Spinner />;
  if (l.error) return <LoadError error={l.error} onRetry={l.reload} />;
  const { rules, issues } = l.data;
  const open = issues.filter((i) => i.status === 'ISSUED');
  return (
    <>
      <Alert type="info" className="mb-4">
        Up to {rules.maxBooksPerStudent} books for {rules.loanDays} days. Late returns cost {formatMoney(rules.finePerDay)} per day.
      </Alert>
      <Card title={`On loan (${open.length})`} bodyClassName="p-0">
        {issues.length === 0 ? (
          <EmptyState title="No library history yet" />
        ) : (
          <ul className="divide-y divide-slate-100">
            {issues.map((i) => (
              <li key={i.id} className="flex flex-col gap-1 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium text-slate-900">{i.book.title}</p>
                  <p className="text-xs text-slate-500">
                    {i.book.author} · borrowed {formatDate(i.issueDate)} · due {formatDate(i.dueDate)}
                    {i.returnDate ? ` · returned ${formatDate(i.returnDate)}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {i.overdueDays > 0 && i.status === 'ISSUED' && <span className="text-xs font-medium text-red-600">Overdue · fine {formatMoney(i.fineDue)}</span>}
                  <LifecycleBadge status={i.status} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

// ───────────────────────── Attendance ─────────────────────────

export function PortalAttendance() {
  return <PortalShell title="Attendance">{(child) => <AttendanceView key={child.id} studentId={child.id} />}</PortalShell>;
}

function AttendanceView({ studentId }) {
  const a = useAsync(() => attendanceService.studentSummary(studentId), [studentId]);
  if (a.loading && !a.data) return <Spinner />;
  if (a.error) return <LoadError error={a.error} onRetry={a.reload} />;
  const { summary, byMonth, records } = a.data;
  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard label="Attendance" value={pct(summary.percentage)} tone={summary.percentage != null && summary.percentage < 75 ? 'amber' : 'emerald'} />
        <StatCard label="Present" value={summary.present} tone="emerald" />
        <StatCard label="Late" value={summary.late} tone="amber" />
        <StatCard label="Absent" value={summary.absent} tone="slate" />
        <StatCard label="Leave" value={summary.leave} tone="sky" />
      </div>
      {summary.percentage != null && summary.percentage < 75 && (
        <Alert type="error" className="mt-4">
          Attendance is below 75%. Please contact the class teacher.
        </Alert>
      )}
      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card title="By month" bodyClassName="p-0">
          {byMonth.length === 0 ? (
            <p className="px-5 py-4 text-sm text-slate-500">No records yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {byMonth.map((m) => (
                <li key={m.month} className="flex items-center justify-between px-5 py-2.5 text-sm">
                  <span className="text-slate-700">{new Date(`${m.month}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</span>
                  <span className="tabular-nums text-slate-500">
                    {m.present + m.late}/{m.total} days · <span className="font-semibold text-slate-900">{pct(m.percentage)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Day by day" className="xl:col-span-2">
          {records.length === 0 ? (
            <EmptyState icon={CalendarCheck} title="No attendance recorded yet" />
          ) : (
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {records.map((r) => (
                <li key={r.id} className={`rounded-md px-3 py-2 text-sm ${STATUS_STYLE[r.status]}`}>
                  <p className="font-medium">{formatDate(r.date)}</p>
                  <p className="text-xs">
                    {STATUS_LABEL[r.status]}
                    {r.remarks ? ` · ${r.remarks}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

// ───────────────────────── Results ─────────────────────────

export function PortalResults() {
  const { base } = useArea();
  return <PortalShell title="Results">{(child) => <ResultsView key={child.id} studentId={child.id} base={base} />}</PortalShell>;
}

function ResultsView({ studentId, base }) {
  const r = useAsync(() => examService.studentResults(studentId), [studentId]);
  if (r.loading && !r.data) return <Spinner />;
  if (r.error) return <LoadError error={r.error} onRetry={r.reload} />;
  if (r.data.length === 0) {
    return (
      <Card>
        <EmptyState icon={Award} title="No published results yet" description="Results appear here as soon as the school publishes them." />
      </Card>
    );
  }
  return (
    <div className="space-y-4">
      {r.data.map((res) => (
        <Card
          key={res.exam.id}
          title={`${res.exam.name} · ${res.exam.class.name}`}
          description={`Academic year ${res.exam.academicYear.name}`}
          actions={
            <Link to={`${base}/results/${res.exam.id}/${studentId}`}>
              <Button size="sm" variant="secondary">
                Report card
              </Button>
            </Link>
          }
        >
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              ['GPA', (res.gpa ?? 0).toFixed(2)],
              ['Grade', res.grade ?? '—'],
              ['Result', res.result === 'PASS' ? 'Passed' : res.result === 'FAIL' ? 'Failed' : 'Incomplete'],
              ['Position', res.position ? `${res.position} of ${res.outOf}` : '—'],
            ].map(([k, v]) => (
              <div key={k}>
                <p className="text-xs text-slate-500">{k}</p>
                <p className={`text-xl font-bold ${k === 'Result' && res.result === 'FAIL' ? 'text-red-600' : 'text-slate-900'}`}>{v}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {res.subjects.map((s) => (
              <Badge key={s.subjectId} className={s.resultStatus === 'PASS' ? 'bg-slate-100 text-slate-700 ring-slate-500/20' : 'bg-red-50 text-red-700 ring-red-600/20'}>
                {s.name}: {s.isAbsent ? 'Absent' : `${s.total} · ${s.grade}`}
              </Badge>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

// ───────────────────────── Fees (parents) ─────────────────────────

export function PortalFees() {
  return <PortalShell title="Fees & payments">{(child) => <FeesView key={child.id} studentId={child.id} />}</PortalShell>;
}

function FeesView({ studentId }) {
  const { base } = useArea();
  const toast = useToast();
  const fees = useAsync(() => financeService.studentFees(studentId), [studentId]);
  const [paying, setPaying] = useState(null);

  if (fees.loading && !fees.data) return <Spinner />;
  if (fees.error) return <LoadError error={fees.error} onRetry={fees.reload} />;
  const { summary, invoices, payments, onlinePaymentsEnabled } = fees.data;
  const open = invoices.filter((i) => ['UNPAID', 'PARTIALLY_PAID'].includes(i.status));

  async function payOnline(inv) {
    setPaying(inv.id);
    try {
      const { gatewayUrl } = await financeService.payOnline(inv.id);
      window.location.assign(gatewayUrl);
    } catch (err) {
      toast.error(getErrorMessage(err));
      setPaying(null);
    }
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Total billed" value={formatMoney(summary.billed)} tone="brand" />
        <StatCard label="Paid" value={formatMoney(summary.paid)} tone="emerald" />
        <StatCard label="Outstanding" value={formatMoney(summary.outstanding)} tone={summary.outstanding > 0 ? 'amber' : 'slate'} />
      </div>

      <Card className="mt-6" title="Due now" bodyClassName="p-0">
        {open.length === 0 ? (
          <p className="flex items-center gap-2 px-5 py-4 text-sm text-emerald-700">
            <CheckCircle2 className="h-4 w-4" /> Nothing outstanding. Thank you!
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {open.map((inv) => (
              <li key={inv.id} className="flex flex-col gap-3 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium text-slate-900">{inv.description ?? inv.feeType.name}</p>
                  <p className="text-xs text-slate-500">
                    <span className="font-mono">{inv.invoiceNumber}</span> · due {formatDate(inv.dueDate)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <LifecycleBadge status={inv.status} />
                  <span className="font-semibold tabular-nums">{formatMoney(inv.outstanding)}</span>
                  {onlinePaymentsEnabled && (
                    <Button size="sm" onClick={() => payOnline(inv)} loading={paying === inv.id}>
                      <CreditCard className="h-4 w-4" /> Pay online
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {open.length > 0 && !onlinePaymentsEnabled && (
          <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">Pay at the school office, or by bKash/Nagad and share the transaction ID with the office.</p>
        )}
      </Card>

      <Card className="mt-6" title="Payment history" bodyClassName="p-0">
        {payments.length === 0 ? (
          <p className="px-5 py-4 text-sm text-slate-500">No payments yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {payments.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                <div>
                  <p className="font-medium text-slate-900">
                    {p.invoice.feeType.name}
                    {p.invoice.billingPeriod ? ` · ${p.invoice.billingPeriod}` : ''}
                  </p>
                  <p className="text-xs text-slate-500">
                    {formatDate(p.paidAt)} · {METHOD_LABELS[p.method]}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold tabular-nums">{formatMoney(p.amount)}</span>
                  <Link to={`${base}/receipts/${p.id}`} className="text-xs font-medium text-brand-600 hover:text-brand-700">
                    Receipt
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

// ───────────────────────── Routine ─────────────────────────

export function PortalRoutine() {
  return (
    <PortalShell title="Class routine">
      {(child) => <RoutineView key={child.id} studentId={child.id} />}
    </PortalShell>
  );
}

function RoutineView({ studentId }) {
  const { user } = useAuth();
  // Students get their own routine; parents pass the child.
  const t = useAsync(() => timetableService.mine(user.role.key === ROLES.PARENT ? studentId : undefined), [studentId]);
  if (t.loading && !t.data) return <Spinner />;
  if (t.error) return <LoadError error={t.error} onRetry={t.reload} />;
  return <WeeklyTimetable entries={t.data.entries} show="teacher" emptyText="No routine published yet." />;
}

// ───────────────────────── Payment result ─────────────────────────

export function PaymentResultPage() {
  const [params] = useSearchParams();
  const { base } = useArea();
  const ok = params.get('status') === 'SUCCESS';
  return (
    <>
      <PageHeader title="Payment" />
      <Card>
        <div className="flex flex-col items-center py-8 text-center">
          {ok ? <CheckCircle2 className="h-12 w-12 text-emerald-600" /> : <XCircle className="h-12 w-12 text-red-600" />}
          <h2 className="mt-3 text-lg font-semibold text-slate-900">{ok ? 'Payment successful' : 'Payment not completed'}</h2>
          <p className="mt-1 max-w-sm text-sm text-slate-500">
            {ok
              ? 'Your payment was confirmed with the payment gateway and the invoice has been updated.'
              : 'No money was taken for this attempt, or the gateway could not confirm it. You can try again or pay at the school office.'}
          </p>
          <Link to={`${base}/fees`} className="mt-5">
            <Button>Back to fees</Button>
          </Link>
        </div>
      </Card>
    </>
  );
}
