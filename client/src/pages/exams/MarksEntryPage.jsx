import { ArrowLeft, Lock } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Alert, Button, Card, LoadError, PageHeader, Spinner } from '../../components/common/ui';
import { useArea } from '../../hooks/useArea';
import { useAsync } from '../../hooks/useAsync';
import { useToast } from '../../hooks/useAuth';
import { examService } from '../../services/exam.service';
import { getErrorMessage } from '../../utils/errors';

const num = (v) => (v === '' || v == null ? null : Number(v));

/** Client-side preview using the same rules as the server (server is authoritative). */
function preview(row, es, scale) {
  if (row.isAbsent) return { total: 0, grade: 'F', status: 'Absent' };
  const vals = [row.written, row.mcq, row.practical].map(num);
  if (vals.every((v) => v == null)) return null;
  const total = vals.reduce((a, v) => a + (v ?? 0), 0);
  const pct = (total / Number(es.fullMarks)) * 100;
  const pass = total >= Number(es.passMarks);
  const bands = [...scale].sort((a, b) => Number(b.minPercent) - Number(a.minPercent));
  const grade = pass ? (bands.find((b) => pct >= Number(b.minPercent)) ?? bands.at(-1)).grade : bands.at(-1).grade;
  return { total: Math.round(total * 100) / 100, grade, status: pass ? 'Pass' : 'Fail' };
}

export default function MarksEntryPage() {
  const { id, subjectId } = useParams();
  const { base } = useArea();
  const toast = useToast();
  const [sectionId, setSectionId] = useState('');
  const sheet = useAsync(() => examService.marksSheet(id, subjectId, sectionId || undefined), [id, subjectId, sectionId]);
  const [rows, setRows] = useState({});
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const es = sheet.data?.examSubject;
  const columns = useMemo(() => {
    if (!es) return [];
    const split = [
      ['written', 'Written', es.writtenMarks],
      ['mcq', 'MCQ', es.mcqMarks],
      ['practical', 'Practical', es.practicalMarks],
    ].filter(([, , max]) => max != null);
    return split.length ? split : [['written', 'Marks', es.fullMarks]];
  }, [es]);

  useEffect(() => {
    if (!sheet.data) return;
    const s = (v) => (v == null ? '' : String(Number(v)));
    setRows(
      Object.fromEntries(
        sheet.data.students.map((st) => [
          st.studentId,
          { written: s(st.mark?.written), mcq: s(st.mark?.mcq), practical: s(st.mark?.practical), isAbsent: st.mark?.isAbsent ?? false },
        ]),
      ),
    );
    setErrors({});
  }, [sheet.data]);

  if (sheet.loading && !sheet.data) return <Spinner />;
  if (sheet.error) return <LoadError error={sheet.error} onRetry={sheet.reload} />;
  const data = sheet.data;
  const editable = data.canEdit;

  const set = (sid, field, value) => {
    setRows((r) => ({ ...r, [sid]: { ...r[sid], [field]: value } }));
    setErrors((e) => ({ ...e, [sid]: undefined }));
  };

  function validate() {
    const found = {};
    for (const st of data.students) {
      const r = rows[st.studentId];
      if (!r || r.isAbsent) continue;
      for (const [field, label, max] of columns) {
        const v = num(r[field]);
        if (v == null) continue;
        if (Number.isNaN(v) || v < 0) found[st.studentId] = `${label} must be 0 or more`;
        else if (v > Number(max)) found[st.studentId] = `${label} can't exceed ${Number(max)}`;
      }
    }
    return found;
  }

  async function save() {
    const found = validate();
    setErrors(found);
    setSaveError('');
    if (Object.keys(found).length) {
      setSaveError('Some marks are out of range — see the highlighted rows.');
      return;
    }
    // Only send students who have something entered (or are marked absent).
    const marks = data.students
      .map((st) => ({ studentId: st.studentId, ...rows[st.studentId] }))
      .filter((r) => r.isAbsent || columns.some(([f]) => num(r[f]) != null))
      .map((r) => ({
        studentId: r.studentId,
        isAbsent: r.isAbsent,
        written: r.isAbsent ? null : num(r.written),
        mcq: r.isAbsent ? null : num(r.mcq),
        practical: r.isAbsent ? null : num(r.practical),
      }));
    if (marks.length === 0) {
      setSaveError('Enter at least one student’s marks.');
      return;
    }
    setSaving(true);
    try {
      const r = await examService.enterMarks(id, subjectId, marks);
      toast.success(`Marks saved for ${r.saved} students.`);
      sheet.reload();
    } catch (err) {
      setSaveError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const entered = data.students.filter((st) => st.mark).length;

  return (
    <>
      <Link to={`${base}/exams/${id}`} className="mb-3 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> {data.exam.name}
      </Link>
      <PageHeader
        title={`${es.subject.name} — ${data.exam.name}`}
        description={`${data.exam.class.name} · Full marks ${Number(es.fullMarks)} · Pass ${Number(es.passMarks)} · ${entered}/${data.students.length} entered`}
        actions={
          data.sections.length > 1 && (
            <select className="input w-40" value={sectionId} onChange={(e) => setSectionId(e.target.value)} aria-label="Section">
              <option value="">All sections</option>
              {data.sections.map((s) => (
                <option key={s.id} value={s.id}>
                  Section {s.name}
                </option>
              ))}
            </select>
          )
        }
      />

      {!editable && (
        <Alert type="info" className="mb-4">
          <span className="inline-flex items-center gap-1.5">
            <Lock className="h-4 w-4" />
            {data.published ? 'Results are published — only an administrator can change these marks.' : 'You can view these marks; only the subject teacher or an administrator can change them.'}
          </span>
        </Alert>
      )}
      {editable && data.published && (
        <Alert type="info" className="mb-4">
          These results are published. Changes you save are recorded in the audit log.
        </Alert>
      )}
      {saveError && (
        <Alert type="error" className="mb-4">
          {saveError}
        </Alert>
      )}

      <Card bodyClassName="p-0">
        <div className="relative overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              <tr>
                <th scope="col" className="px-4 py-3">Roll</th>
                <th scope="col" className="px-3 py-3">Student</th>
                {columns.map(([f, label, max]) => (
                  <th key={f} scope="col" className="px-3 py-3">
                    {label} <span className="font-normal normal-case text-slate-400">/ {Number(max)}</span>
                  </th>
                ))}
                <th scope="col" className="px-3 py-3">Absent</th>
                <th scope="col" className="px-3 py-3 text-right">Total</th>
                <th scope="col" className="px-4 py-3">Grade</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.students.map((st) => {
                const r = rows[st.studentId];
                if (!r) return null;
                const p = preview(r, es, data.scale);
                const err = errors[st.studentId];
                return (
                  <tr key={st.studentId} className={err ? 'bg-red-50' : undefined}>
                    <td className="px-4 py-2 tabular-nums text-slate-500">
                      {st.section.name}-{st.rollNumber}
                    </td>
                    <td className="px-3 py-2">
                      <p className="font-medium text-slate-900">{st.fullName}</p>
                      {err && <p className="text-xs text-red-600">{err}</p>}
                    </td>
                    {columns.map(([f, label, max]) => (
                      <td key={f} className="px-3 py-2">
                        <input
                          type="number"
                          inputMode="decimal"
                          min="0"
                          max={Number(max)}
                          step="0.5"
                          className={`input w-20 py-1.5 tabular-nums ${err ? 'input-error' : ''}`}
                          value={r.isAbsent ? '' : r[f]}
                          disabled={!editable || r.isAbsent}
                          onChange={(e) => set(st.studentId, f, e.target.value)}
                          aria-label={`${label} for ${st.fullName}`}
                        />
                      </td>
                    ))}
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300 text-brand-600"
                        checked={r.isAbsent}
                        disabled={!editable}
                        onChange={(e) => set(st.studentId, 'isAbsent', e.target.checked)}
                        aria-label={`${st.fullName} was absent`}
                      />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-700">{p ? p.total : '—'}</td>
                    <td className="px-4 py-2">
                      {p ? (
                        <span className={p.status === 'Pass' ? 'font-semibold text-slate-800' : 'font-semibold text-red-600'}>
                          {p.grade} <span className="text-xs font-normal text-slate-500">{p.status}</span>
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {editable && (
          <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-3">
            <p className="text-xs text-slate-500">Grades preview as you type; the server re-checks everything on save.</p>
            <Button onClick={save} loading={saving}>
              Save marks
            </Button>
          </div>
        )}
      </Card>
    </>
  );
}
