import { CheckCheck, ClipboardCheck, Download } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Alert, Button, Card, EmptyState, LoadError, PageHeader, Spinner, StatCard, Tabs } from '../../components/common/ui';
import { useAsync } from '../../hooks/useAsync';
import { useToast } from '../../hooks/useAuth';
import { todayInput } from '../../hooks/useForm';
import { attendanceService } from '../../services/operations.service';
import { getErrorMessage } from '../../utils/errors';

const STATUSES = [
  { value: 'PRESENT', short: 'P', label: 'Present', on: 'bg-emerald-600 text-white ring-emerald-600' },
  { value: 'LATE', short: 'L', label: 'Late', on: 'bg-amber-500 text-white ring-amber-500' },
  { value: 'ABSENT', short: 'A', label: 'Absent', on: 'bg-red-600 text-white ring-red-600' },
  { value: 'LEAVE', short: 'Lv', label: 'Leave', on: 'bg-sky-600 text-white ring-sky-600' },
];

const sectionLabel = (s) => `${s.class.name} · Section ${s.name}`;
const pct = (v) => (v == null ? '—' : `${v}%`);

export default function AttendancePage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'reports' ? 'reports' : 'take';
  const sections = useAsync(() => attendanceService.mySections(), []);

  return (
    <>
      <PageHeader title="Attendance" description="Daily attendance by section, with daily and monthly reports." />
      <Tabs
        tabs={[
          { value: 'take', label: 'Take attendance' },
          { value: 'reports', label: 'Reports' },
        ]}
        value={tab}
        onChange={(v) => setParams({ tab: v }, { replace: true })}
      />
      {sections.loading && !sections.data ? (
        <Spinner />
      ) : sections.error ? (
        <LoadError error={sections.error} onRetry={sections.reload} />
      ) : sections.data.length === 0 ? (
        <Card>
          <EmptyState icon={ClipboardCheck} title="No sections to show" description="You have no classes assigned in the active academic year." />
        </Card>
      ) : tab === 'take' ? (
        <TakeAttendance sections={sections.data} />
      ) : (
        <Reports sections={sections.data} />
      )}
    </>
  );
}

// ───────────────────────── Take attendance ─────────────────────────

function TakeAttendance({ sections }) {
  const toast = useToast();
  const [sectionId, setSectionId] = useState(sections[0].id);
  const [date, setDate] = useState(todayInput());
  const section = sections.find((s) => s.id === sectionId);
  const sheet = useAsync(
    () => attendanceService.sheet({ classId: section.class.id, sectionId, date }),
    [sectionId, date],
  );
  const [marks, setMarks] = useState({});
  const [saving, setSaving] = useState(false);

  // Start from saved statuses; unmarked students default to Present.
  useEffect(() => {
    if (!sheet.data) return;
    setMarks(Object.fromEntries(sheet.data.students.map((s) => [s.studentId, { status: s.status ?? 'PRESENT', remarks: s.remarks ?? '' }])));
  }, [sheet.data]);

  const counts = useMemo(() => {
    const c = { PRESENT: 0, LATE: 0, ABSENT: 0, LEAVE: 0 };
    for (const m of Object.values(marks)) c[m.status] += 1;
    return c;
  }, [marks]);

  const setStatus = (id, status) => setMarks((m) => ({ ...m, [id]: { ...m[id], status } }));
  const setRemarks = (id, remarks) => setMarks((m) => ({ ...m, [id]: { ...m[id], remarks } }));

  async function save() {
    setSaving(true);
    const payload = {
      classId: section.class.id,
      sectionId,
      date,
      records: sheet.data.students.map((s) => ({
        studentId: s.studentId,
        status: marks[s.studentId].status,
        remarks: marks[s.studentId].remarks.trim() || null,
      })),
    };
    try {
      if (sheet.data.taken) {
        const r = await attendanceService.updateDay(payload);
        toast.success(r.updated + r.created ? `Attendance updated (${r.updated + r.created} changed).` : 'No changes to save.');
      } else {
        const r = await attendanceService.record(payload);
        toast.success(`Attendance saved for ${r.saved} students.`);
      }
      sheet.reload();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const students = sheet.data?.students ?? [];

  return (
    <>
      <Card bodyClassName="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex-1">
          <span className="label">Section</span>
          <select className="input" value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {sectionLabel(s)}
              </option>
            ))}
          </select>
        </label>
        <label className="sm:w-48">
          <span className="label">Date</span>
          <input type="date" className="input" value={date} max={todayInput()} onChange={(e) => e.target.value && setDate(e.target.value)} />
        </label>
      </Card>

      {sheet.loading && !sheet.data ? (
        <Spinner />
      ) : sheet.error ? (
        <div className="mt-4">
          <LoadError error={sheet.error} onRetry={sheet.reload} />
        </div>
      ) : students.length === 0 ? (
        <Card className="mt-4">
          <EmptyState title="No active students in this section" />
        </Card>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="Present" value={counts.PRESENT} tone="emerald" />
            <StatCard label="Late" value={counts.LATE} tone="amber" />
            <StatCard label="Absent" value={counts.ABSENT} tone="slate" />
            <StatCard label="Leave" value={counts.LEAVE} tone="sky" />
          </div>

          {sheet.data.taken ? (
            <Alert type="info" className="mt-4">
              Attendance for this day was already taken. Changes you save will update it.
            </Alert>
          ) : (
            <Alert type="info" className="mt-4">
              Not taken yet. Everyone starts as present — change the exceptions, then save.
            </Alert>
          )}

          <Card
            className="mt-4"
            bodyClassName="p-0"
            title={`${sectionLabel(section)} — ${students.length} students`}
            actions={
              <Button size="sm" variant="secondary" onClick={() => setMarks((m) => Object.fromEntries(Object.keys(m).map((k) => [k, { ...m[k], status: 'PRESENT' }])))}>
                <CheckCheck className="h-4 w-4" /> All present
              </Button>
            }
          >
            <ul className={`divide-y divide-slate-100 ${sheet.loading ? 'opacity-60' : ''}`}>
              {students.map((s) => {
                const mark = marks[s.studentId];
                if (!mark) return null;
                return (
                  <li key={s.studentId} className="flex flex-col gap-2 px-5 py-3 md:flex-row md:items-center md:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="w-8 shrink-0 text-right text-sm tabular-nums text-slate-400">{s.rollNumber}</span>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-slate-900">{s.fullName}</p>
                        <p className="font-mono text-xs text-slate-400">{s.studentCode}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 pl-11 md:pl-0">
                      <div className="flex gap-1" role="radiogroup" aria-label={`Attendance for ${s.fullName}`}>
                        {STATUSES.map((st) => (
                          <button
                            key={st.value}
                            type="button"
                            role="radio"
                            aria-checked={mark.status === st.value}
                            title={st.label}
                            onClick={() => setStatus(s.studentId, st.value)}
                            className={`h-9 min-w-[2.5rem] rounded-md px-2 text-sm font-semibold ring-1 transition-colors ${
                              mark.status === st.value ? st.on : 'bg-white text-slate-600 ring-slate-300 hover:bg-slate-50'
                            }`}
                          >
                            {st.short}
                          </button>
                        ))}
                      </div>
                      {mark.status !== 'PRESENT' && (
                        <input
                          className="input h-9 w-full py-1 md:w-44"
                          placeholder="Remarks (optional)"
                          value={mark.remarks}
                          maxLength={200}
                          onChange={(e) => setRemarks(s.studentId, e.target.value)}
                          aria-label={`Remarks for ${s.fullName}`}
                        />
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-3">
              <p className="text-xs text-slate-500">P = Present · L = Late (counts as present) · A = Absent · Lv = Leave</p>
              <Button onClick={save} loading={saving}>
                {sheet.data.taken ? 'Update attendance' : 'Save attendance'}
              </Button>
            </div>
          </Card>
        </>
      )}
    </>
  );
}

// ───────────────────────── Reports ─────────────────────────

function Reports({ sections }) {
  const toast = useToast();
  const classes = useMemo(() => {
    const map = new Map();
    for (const s of sections) map.set(s.class.id, s.class);
    return [...map.values()];
  }, [sections]);
  const [type, setType] = useState('monthly');
  const [classId, setClassId] = useState(classes[0].id);
  const classSections = sections.filter((s) => s.class.id === classId);
  const [sectionId, setSectionId] = useState(classSections[0]?.id ?? '');
  const [date, setDate] = useState(todayInput());
  const [month, setMonth] = useState(todayInput().slice(0, 7));
  const [exporting, setExporting] = useState(false);

  // Daily reports can cover the whole class only if the user has every section.
  const allSectionsOfClass = sections.filter((s) => s.class.id === classId).length;
  const query = { type, classId, sectionId: type === 'monthly' || sectionId ? sectionId : undefined, ...(type === 'daily' ? { date } : { month }) };
  const report = useAsync(() => attendanceService.report(query), [type, classId, sectionId, date, month]);

  async function exportCsv() {
    setExporting(true);
    try {
      await attendanceService.exportReport(query);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Export failed'));
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <Card bodyClassName="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
        <label>
          <span className="label">Report</span>
          <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="monthly">Monthly (per student)</option>
            <option value="daily">Daily (per section)</option>
          </select>
        </label>
        <label>
          <span className="label">Class</span>
          <select
            className="input"
            value={classId}
            onChange={(e) => {
              setClassId(e.target.value);
              setSectionId(sections.find((s) => s.class.id === e.target.value)?.id ?? '');
            }}
          >
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="label">Section</span>
          <select className="input" value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
            {type === 'daily' && allSectionsOfClass > 1 && <option value="">All sections</option>}
            {classSections.map((s) => (
              <option key={s.id} value={s.id}>
                Section {s.name}
              </option>
            ))}
          </select>
        </label>
        {type === 'daily' ? (
          <label>
            <span className="label">Date</span>
            <input type="date" className="input" value={date} max={todayInput()} onChange={(e) => e.target.value && setDate(e.target.value)} />
          </label>
        ) : (
          <label>
            <span className="label">Month</span>
            <input type="month" className="input" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
          </label>
        )}
        <Button variant="secondary" onClick={exportCsv} loading={exporting} disabled={!report.data}>
          <Download className="h-4 w-4" /> Export CSV
        </Button>
      </Card>

      <div className="mt-4">
        {report.loading && !report.data ? (
          <Spinner />
        ) : report.error ? (
          <LoadError error={report.error} onRetry={report.reload} />
        ) : report.data.type === 'monthly' ? (
          <MonthlyTable data={report.data} />
        ) : (
          <DailyTable data={report.data} />
        )}
      </div>
    </>
  );
}

function MonthlyTable({ data }) {
  if (data.schoolDays === 0) {
    return (
      <Card>
        <EmptyState icon={ClipboardCheck} title="No attendance recorded this month" />
      </Card>
    );
  }
  return (
    <Card
      bodyClassName="p-0"
      title={`${data.class.name} · Section ${data.section.name} — ${data.month}`}
      description={`${data.schoolDays} school day${data.schoolDays === 1 ? '' : 's'} · class average ${pct(data.averagePercentage)}`}
    >
      <div className="relative overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
            <tr>
              <th scope="col" className="px-5 py-3">Roll</th>
              <th scope="col" className="px-3 py-3">Student</th>
              <th scope="col" className="px-3 py-3 text-right">Present</th>
              <th scope="col" className="px-3 py-3 text-right">Late</th>
              <th scope="col" className="px-3 py-3 text-right">Absent</th>
              <th scope="col" className="px-3 py-3 text-right">Leave</th>
              <th scope="col" className="px-5 py-3 text-right">Attendance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.students.map((s) => (
              <tr key={s.studentId}>
                <td className="px-5 py-2.5 tabular-nums text-slate-500">{s.rollNumber}</td>
                <td className="px-3 py-2.5 font-medium text-slate-900">{s.fullName}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{s.present}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{s.late}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{s.absent}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{s.leave}</td>
                <td className="px-5 py-2.5 text-right">
                  <span
                    className={`font-semibold tabular-nums ${
                      s.percentage == null ? 'text-slate-400' : s.percentage < 75 ? 'text-red-600' : s.percentage < 90 ? 'text-amber-600' : 'text-emerald-700'
                    }`}
                  >
                    {pct(s.percentage)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
        Attendance % = (present + late) ÷ days marked × 100. Below 75% is shown in red.
      </p>
    </Card>
  );
}

function DailyTable({ data }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Marked" value={`${data.totals.marked}/${data.totals.enrolled}`} tone="brand" />
        <StatCard label="Present + late" value={data.totals.present + data.totals.late} tone="emerald" />
        <StatCard label="Absent" value={data.totals.absent} tone="slate" />
        <StatCard label="Attendance" value={pct(data.totals.percentage)} tone="sky" />
      </div>
      {data.sections.map((s) => (
        <Card key={s.section.id} title={`Section ${s.section.name}`} description={`${s.marked} of ${s.enrolled} marked · ${pct(s.percentage)}`}>
          {s.marked === 0 ? (
            <p className="text-sm text-amber-700">Attendance not taken for this section on {data.date}.</p>
          ) : s.notPresent.length === 0 ? (
            <p className="text-sm text-emerald-700">Everyone attended.</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {s.notPresent.map((n) => (
                <li key={n.studentId} className="flex justify-between py-2">
                  <span>
                    <span className="tabular-nums text-slate-400">{n.rollNumber}.</span> {n.fullName}
                  </span>
                  <span className={n.status === 'ABSENT' ? 'text-red-600' : 'text-sky-700'}>{n.status === 'ABSENT' ? 'Absent' : 'On leave'}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ))}
    </div>
  );
}
