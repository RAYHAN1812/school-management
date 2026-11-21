import { FileBarChart, FileSpreadsheet, FileText, Sheet } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, EmptyState, LoadError, PageHeader, Spinner } from '../../components/common/ui';
import { useAsync } from '../../hooks/useAsync';
import { useToast } from '../../hooks/useAuth';
import { todayInput } from '../../hooks/useForm';
import { useClasses } from '../../hooks/useLookups';
import { reportService } from '../../services/admin.service';
import { downloadFile } from '../../services/api';
import { examService } from '../../services/exam.service';
import { getErrorMessage } from '../../utils/errors';
import { formatDate, formatMoney } from '../../utils/format';

// Which filters each report takes.
const PARAMS = {
  admissions: ['from', 'to'],
  'class-students': ['classId', 'sectionId?'],
  attendance: ['classId', 'sectionId', 'month'],
  exam: ['examId', 'sectionId?'],
  'fee-collection': ['from', 'to'],
  outstanding: ['classId?'],
  'teacher-workload': [],
  library: [],
};

const DESCRIPTIONS = {
  admissions: 'Students admitted in a date range, with class and guardian contact.',
  'class-students': 'Roster for a class or section, ordered by roll.',
  attendance: 'Monthly attendance per student with percentages.',
  exam: 'Merit list with subject marks, GPA and result.',
  'fee-collection': 'Every payment received in a period, totals by method.',
  outstanding: 'Unpaid and partly paid invoices with days overdue.',
  'teacher-workload': 'Subjects, classes, weekly periods and homework per teacher.',
  library: 'Books on loan, overdue days and fines so far.',
};

function cell(value, format) {
  if (value == null || value === '') return '—';
  if (format === 'money') return formatMoney(value);
  if (format === 'date') return formatDate(value);
  if (format === 'percent') return `${value}%`;
  return String(value);
}

export default function ReportsPage() {
  const toast = useToast();
  const types = useAsync(() => reportService.types(), []);
  const classes = useClasses();
  const [type, setType] = useState('');
  const [params, setParams] = useState({ from: `${todayInput().slice(0, 4)}-01-01`, to: todayInput(), month: todayInput().slice(0, 7), classId: '', sectionId: '', examId: '' });
  const [report, setReport] = useState(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState('');
  const exams = useAsync(() => (PARAMS[type]?.includes('examId') ? examService.list({}) : Promise.resolve([])), [type]);

  useEffect(() => {
    if (!type && types.data?.length) setType(types.data[0].key);
  }, [types.data, type]);

  const needed = PARAMS[type] ?? [];
  const has = (p) => needed.includes(p) || needed.includes(`${p}?`);
  // For the exam report, sections come from the chosen exam's class.
  const examClassId = (exams.data ?? []).find((e) => e.id === params.examId)?.class.id;
  const klass = classes.data?.classes.find((c) => c.id === (params.classId || examClassId));
  const query = useMemo(() => Object.fromEntries(needed.map((p) => p.replace('?', '')).map((p) => [p, params[p]])), [needed, params]);
  const missing = needed.filter((p) => !p.endsWith('?') && !params[p]);

  const set = (k) => (e) => {
    setParams((p) => ({ ...p, [k]: e.target.value, ...(k === 'classId' ? { sectionId: '' } : {}) }));
    setReport(null);
  };

  async function run() {
    setRunning(true);
    setError('');
    try {
      setReport(await reportService.run(type, query));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setRunning(false);
    }
  }

  async function exportAs(format) {
    setExporting(format);
    try {
      await downloadFile(`/reports/${type}`, { ...query, format }, `${type}.${format}`);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Export failed'));
    } finally {
      setExporting('');
    }
  }

  if (types.loading && !types.data) return <Spinner />;
  if (types.error) return <LoadError error={types.error} onRetry={types.reload} />;

  return (
    <>
      <PageHeader title="Reports" description="Preview any report, then download it as Excel, PDF or CSV." />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card bodyClassName="p-0" title="Report">
          <ul className="divide-y divide-slate-100">
            {types.data.map((t) => (
              <li key={t.key}>
                <button
                  type="button"
                  onClick={() => {
                    setType(t.key);
                    setReport(null);
                    setError('');
                  }}
                  className={`w-full px-5 py-3 text-left hover:bg-slate-50 ${type === t.key ? 'bg-brand-50/70' : ''}`}
                >
                  <p className={`text-sm font-medium ${type === t.key ? 'text-brand-700' : 'text-slate-900'}`}>{t.title}</p>
                  <p className="text-xs text-slate-500">{DESCRIPTIONS[t.key]}</p>
                </button>
              </li>
            ))}
          </ul>
        </Card>

        <div className="space-y-4 lg:col-span-2">
          <Card title="Filters" bodyClassName="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {needed.length === 0 && <p className="text-sm text-slate-500 sm:col-span-3">This report has no filters.</p>}
            {has('from') && (
              <label>
                <span className="label">From</span>
                <input type="date" className="input" value={params.from} onChange={set('from')} />
              </label>
            )}
            {has('to') && (
              <label>
                <span className="label">To</span>
                <input type="date" className="input" value={params.to} onChange={set('to')} />
              </label>
            )}
            {has('examId') && (
              <label className="sm:col-span-2">
                <span className="label">Exam</span>
                <select className="input" value={params.examId} onChange={set('examId')}>
                  <option value="">Select exam</option>
                  {(exams.data ?? []).map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name} · {e.class.name} ({e.status.toLowerCase()})
                    </option>
                  ))}
                </select>
              </label>
            )}
            {has('classId') && (
              <label>
                <span className="label">Class{needed.includes('classId?') ? ' (optional)' : ''}</span>
                <select className="input" value={params.classId} onChange={set('classId')}>
                  <option value="">{needed.includes('classId?') ? 'All classes' : 'Select class'}</option>
                  {(classes.data?.classes ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {has('sectionId') && (
              <label>
                <span className="label">Section{needed.includes('sectionId?') ? ' (optional)' : ''}</span>
                <select className="input" value={params.sectionId} onChange={set('sectionId')} disabled={!klass}>
                  <option value="">{needed.includes('sectionId?') ? 'All sections' : 'Select section'}</option>
                  {(klass?.sections ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      Section {s.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {has('month') && (
              <label>
                <span className="label">Month</span>
                <input type="month" className="input" value={params.month} onChange={set('month')} />
              </label>
            )}
            <div className="flex flex-wrap items-end gap-2 sm:col-span-2 lg:col-span-3">
              <Button onClick={run} loading={running} disabled={missing.length > 0}>
                Preview
              </Button>
              <Button variant="secondary" onClick={() => exportAs('xlsx')} loading={exporting === 'xlsx'} disabled={missing.length > 0}>
                <FileSpreadsheet className="h-4 w-4" /> Excel
              </Button>
              <Button variant="secondary" onClick={() => exportAs('pdf')} loading={exporting === 'pdf'} disabled={missing.length > 0}>
                <FileText className="h-4 w-4" /> PDF
              </Button>
              <Button variant="ghost" onClick={() => exportAs('csv')} loading={exporting === 'csv'} disabled={missing.length > 0}>
                <Sheet className="h-4 w-4" /> CSV
              </Button>
            </div>
          </Card>

          {error && <Alert type="error">{error}</Alert>}

          {report ? (
            <Card title={report.title} description={report.subtitle} bodyClassName="p-0">
              {report.rows.length === 0 ? (
                <EmptyState icon={FileBarChart} title="No records for this selection" />
              ) : (
                <div className="relative max-h-[28rem] overflow-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead className="sticky top-0 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                      <tr>
                        {report.columns.map((c) => (
                          <th key={c.key} scope="col" className={`whitespace-nowrap px-3 py-2.5 ${['money', 'number', 'percent'].includes(c.format) ? 'text-right' : ''}`}>
                            {c.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {report.rows.slice(0, 200).map((r, i) => (
                        <tr key={i}>
                          {report.columns.map((c) => (
                            <td key={c.key} className={`whitespace-nowrap px-3 py-2 ${['money', 'number', 'percent'].includes(c.format) ? 'text-right tabular-nums' : ''}`}>
                              {cell(r[c.key], c.format)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {report.rows.length > 200 && <p className="border-t border-slate-100 px-5 py-2 text-xs text-slate-500">Showing 200 of {report.rows.length} rows — download for the full report.</p>}
              {report.summary?.length > 0 && (
                <dl className="grid grid-cols-2 gap-3 border-t border-slate-100 px-5 py-4 sm:grid-cols-4">
                  {report.summary.map((s) => (
                    <div key={s.label}>
                      <dt className="text-xs text-slate-500">{s.label}</dt>
                      <dd className="font-semibold text-slate-900">{s.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </Card>
          ) : (
            !error && (
              <Card>
                <EmptyState icon={FileBarChart} title="Choose filters and preview" description={missing.length ? `Needed: ${missing.join(', ')}` : 'Press Preview to see the report here.'} />
              </Card>
            )
          )}
        </div>
      </div>
    </>
  );
}
