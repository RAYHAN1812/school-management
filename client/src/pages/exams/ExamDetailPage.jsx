import { ArrowLeft, Award, CheckCircle2, Pencil, Printer, Send, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Alert, Badge, Button, Card, ConfirmDialog, LifecycleBadge, LoadError, PageHeader, Spinner, StatCard, Tabs } from '../../components/common/ui';
import { useArea } from '../../hooks/useArea';
import { useAsync } from '../../hooks/useAsync';
import { useToast } from '../../hooks/useAuth';
import { examService } from '../../services/exam.service';
import { getErrorMessage } from '../../utils/errors';
import { formatDate, formatDateTime } from '../../utils/format';
import { ExamModal } from './ExamsPage';

const n = (v) => (v == null ? '—' : Number(v));

export default function ExamDetailPage() {
  const { id } = useParams();
  const { base, isAdmin } = useArea();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'results' ? 'results' : 'subjects';
  const exam = useAsync(() => examService.get(id), [id]);
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(null); // 'publish' | 'unpublish'
  const [busy, setBusy] = useState(false);
  const [publishError, setPublishError] = useState('');

  if (exam.loading && !exam.data) return <Spinner />;
  if (exam.error) return <LoadError error={exam.error} onRetry={exam.reload} />;
  const e = exam.data;
  const isPublished = e.status === 'PUBLISHED';
  const complete = e.subjects.every((s) => s.marksEntered >= e.studentCount);

  async function runConfirm() {
    setBusy(true);
    setPublishError('');
    try {
      if (confirm === 'publish') await examService.publish(id);
      else await examService.unpublish(id);
      toast.success(confirm === 'publish' ? 'Results published. Students and parents can now see them.' : 'Results unpublished.');
      exam.reload();
    } catch (err) {
      setPublishError(getErrorMessage(err));
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  return (
    <>
      <Link to={`${base}/exams`} className="mb-3 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> Exams
      </Link>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {e.name} <LifecycleBadge status={e.status} />
          </span>
        }
        description={`${e.class.name} · ${e.academicYear.name}${e.startDate ? ` · ${formatDate(e.startDate)} – ${formatDate(e.endDate)}` : ''}${
          isPublished ? ` · Published ${formatDateTime(e.publishedAt)}` : ''
        }`}
        actions={
          isAdmin && (
            <>
              {!isPublished && (
                <Button variant="secondary" onClick={() => setEditing(true)}>
                  <Pencil className="h-4 w-4" /> Edit
                </Button>
              )}
              {isPublished ? (
                <Button variant="secondary" onClick={() => setConfirm('unpublish')}>
                  <Undo2 className="h-4 w-4" /> Unpublish
                </Button>
              ) : (
                <Button onClick={() => setConfirm('publish')}>
                  <Send className="h-4 w-4" /> Publish results
                </Button>
              )}
            </>
          )
        }
      />

      {publishError && (
        <Alert type="error" className="mb-4" title="Can't publish yet">
          {publishError}
        </Alert>
      )}

      <Tabs
        tabs={[
          { value: 'subjects', label: 'Marks entry' },
          { value: 'results', label: 'Results & merit list' },
        ]}
        value={tab}
        onChange={(v) => setParams({ tab: v }, { replace: true })}
      />

      {tab === 'subjects' ? (
        <Card bodyClassName="p-0" title={`${e.studentCount} students`} description={complete ? 'All marks entered.' : 'Marks are still being entered.'}>
          <ul className="divide-y divide-slate-100">
            {e.subjects.map((s) => {
              const pct = e.studentCount ? Math.round((s.marksEntered / e.studentCount) * 100) : 0;
              const parts = [
                s.writtenMarks != null && `Written ${n(s.writtenMarks)}`,
                s.mcqMarks != null && `MCQ ${n(s.mcqMarks)}`,
                s.practicalMarks != null && `Practical ${n(s.practicalMarks)}`,
              ].filter(Boolean);
              return (
                <li key={s.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-900">{s.subject.name}</p>
                    <p className="text-xs text-slate-500">
                      Full {n(s.fullMarks)} · Pass {n(s.passMarks)}
                      {parts.length ? ` · ${parts.join(' + ')}` : ''}
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <div className="h-1.5 w-40 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
                        <div className={`h-full ${pct === 100 ? 'bg-emerald-500' : 'bg-brand-500'}`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs tabular-nums text-slate-500">
                        {s.marksEntered}/{e.studentCount}
                      </span>
                      {pct === 100 && <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-label="Complete" />}
                    </div>
                  </div>
                  <Link to={`${base}/exams/${e.id}/marks/${s.subjectId}`}>
                    <Button size="sm" variant={s.canEnterMarks && !isPublished ? 'primary' : 'secondary'}>
                      {s.canEnterMarks && (!isPublished || isAdmin) ? 'Enter marks' : 'View marks'}
                    </Button>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      ) : (
        <ResultsTab exam={e} />
      )}

      {isAdmin && (
        <>
          <ExamModal
            open={editing}
            exam={e}
            classes={[]}
            onClose={() => setEditing(false)}
            onSaved={() => {
              setEditing(false);
              toast.success('Exam updated.');
              exam.reload();
            }}
          />
          <ConfirmDialog
            open={Boolean(confirm)}
            title={confirm === 'publish' ? 'Publish results?' : 'Unpublish results?'}
            message={
              confirm === 'publish'
                ? 'Students and parents will see their marks, grades, GPA and merit position. After publishing, only administrators can change marks (every change is audited).'
                : 'Results will be hidden from students and parents, and teachers can edit marks again.'
            }
            confirmLabel={confirm === 'publish' ? 'Publish' : 'Unpublish'}
            tone="primary"
            loading={busy}
            onConfirm={runConfirm}
            onCancel={() => setConfirm(null)}
          />
        </>
      )}
    </>
  );
}

function ResultsTab({ exam }) {
  const { base } = useArea();
  const [sectionId, setSectionId] = useState('');
  const results = useAsync(() => examService.results(exam.id, sectionId || undefined), [exam.id, sectionId]);

  if (results.loading && !results.data) return <Spinner />;
  if (results.error) return <LoadError error={results.error} onRetry={results.reload} />;
  const { rows, subjects, summary } = results.data;

  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Results complete" value={`${summary.complete}/${summary.students}`} tone="brand" />
        <StatCard label="Passed" value={summary.passed} tone="emerald" />
        <StatCard label="Pass rate" value={summary.passRate == null ? '—' : `${summary.passRate}%`} tone="sky" />
        <StatCard label="Highest GPA" value={summary.highestGpa?.toFixed(2) ?? '—'} icon={Award} tone="amber" />
      </div>
      <Card
        className="mt-4"
        bodyClassName="p-0"
        title="Merit list"
        description="Ranked by GPA, then total marks. Failing any subject gives GPA 0.00."
        actions={
          exam.class.sections.length > 1 && (
            <select className="input w-36 py-1.5" value={sectionId} onChange={(ev) => setSectionId(ev.target.value)} aria-label="Section">
              <option value="">All sections</option>
              {exam.class.sections.map((s) => (
                <option key={s.id} value={s.id}>
                  Section {s.name}
                </option>
              ))}
            </select>
          )
        }
      >
        <div className="relative overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              <tr>
                <th scope="col" className="px-4 py-3">Pos.</th>
                <th scope="col" className="px-3 py-3">Student</th>
                {subjects.map((s) => (
                  <th key={s.id} scope="col" className="hidden px-3 py-3 text-center lg:table-cell" title={s.name}>
                    {s.code}
                  </th>
                ))}
                <th scope="col" className="px-3 py-3 text-right">Total</th>
                <th scope="col" className="px-3 py-3 text-right">GPA</th>
                <th scope="col" className="px-3 py-3">Result</th>
                <th scope="col" className="px-3 py-3"><span className="sr-only">Report card</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.studentId}>
                  <td className="px-4 py-2.5 font-semibold tabular-nums text-slate-700">{r.position ?? '—'}</td>
                  <td className="px-3 py-2.5">
                    <p className="font-medium text-slate-900">{r.fullName}</p>
                    <p className="text-xs text-slate-500">
                      Section {r.section.name} · Roll {r.rollNumber}
                    </p>
                  </td>
                  {subjects.map((s) => {
                    const m = r.subjects.find((x) => x.subjectId === s.id);
                    return (
                      <td key={s.id} className="hidden px-3 py-2.5 text-center lg:table-cell">
                        {m ? (
                          <span className={m.resultStatus === 'PASS' ? 'text-slate-700' : 'font-semibold text-red-600'} title={`${m.total} / ${s.fullMarks}`}>
                            {m.isAbsent ? 'Abs' : m.grade}
                          </span>
                        ) : (
                          <span className="text-slate-300">·</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2.5 text-right tabular-nums">{r.totalMarks}</td>
                  <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{r.gpa == null ? '—' : r.gpa.toFixed(2)}</td>
                  <td className="px-3 py-2.5">
                    {r.result === 'PASS' ? (
                      <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-600/20">Pass · {r.grade}</Badge>
                    ) : r.result === 'FAIL' ? (
                      <Badge className="bg-red-50 text-red-700 ring-red-600/20">Fail</Badge>
                    ) : (
                      <Badge className="bg-slate-100 text-slate-600 ring-slate-500/20">Incomplete</Badge>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {r.result !== 'INCOMPLETE' && (
                      <Link to={`${base}/exams/${exam.id}/report-card/${r.studentId}`} className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700">
                        <Printer className="h-3.5 w-3.5" /> Report card
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
