import { ClipboardList, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Alert, Button, Card, EmptyState, LifecycleBadge, LoadError, Modal, PageHeader, Spinner, Tabs } from '../../components/common/ui';
import { SelectField, TextField } from '../../components/forms/fields';
import { useArea } from '../../hooks/useArea';
import { useAsync } from '../../hooks/useAsync';
import { useToast } from '../../hooks/useAuth';
import { useForm } from '../../hooks/useForm';
import { useClasses } from '../../hooks/useLookups';
import { examService } from '../../services/exam.service';
import { academicService } from '../../services/school.service';
import { getErrorMessage } from '../../utils/errors';
import { formatDate } from '../../utils/format';

const EXAM_NAMES = ['First Term', 'Midterm', 'Second Term', 'Final', 'Pre-test', 'Class Test'];

export default function ExamsPage() {
  const { isAdmin } = useArea();
  const [params, setParams] = useSearchParams();
  const tab = isAdmin && params.get('tab') === 'grading' ? 'grading' : 'exams';
  return (
    <>
      <PageHeader
        title={isAdmin ? 'Exams & results' : 'Exams & marks'}
        description={isAdmin ? 'Set up exams, follow marks entry, publish results.' : 'Enter marks for the subjects you teach.'}
      />
      {isAdmin && (
        <Tabs
          tabs={[
            { value: 'exams', label: 'Exams' },
            { value: 'grading', label: 'Grading scale' },
          ]}
          value={tab}
          onChange={(v) => setParams({ tab: v }, { replace: true })}
        />
      )}
      {tab === 'exams' ? <ExamList /> : <GradingScale />}
    </>
  );
}

function ExamList() {
  const { base, isAdmin } = useArea();
  const toast = useToast();
  const classes = useClasses();
  const [classId, setClassId] = useState('');
  const exams = useAsync(() => examService.list({ classId: classId || undefined }), [classId]);
  const [creating, setCreating] = useState(false);

  return (
    <>
      <Card bodyClassName="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <label className="sm:w-60">
          <span className="label">Class</span>
          <select className="input" value={classId} onChange={(e) => setClassId(e.target.value)}>
            <option value="">All classes (active year)</option>
            {(classes.data?.classes ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        {isAdmin && (
          <Button onClick={() => setCreating(true)} disabled={!classes.data?.classes.length}>
            <Plus className="h-4 w-4" /> New exam
          </Button>
        )}
      </Card>

      <div className="mt-4">
        {exams.loading && !exams.data ? (
          <Spinner />
        ) : exams.error ? (
          <LoadError error={exams.error} onRetry={exams.reload} />
        ) : exams.data.length === 0 ? (
          <Card>
            <EmptyState icon={ClipboardList} title="No exams yet" description={isAdmin ? 'Create an exam to start entering marks.' : 'No exams for your classes yet.'} />
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {exams.data.map((e) => (
              <Link key={e.id} to={`${base}/exams/${e.id}`} className="card block p-5 transition-shadow hover:shadow-md">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-slate-900">{e.name}</h3>
                    <p className="text-sm text-slate-500">
                      {e.class.name} · {e.academicYear.name}
                    </p>
                  </div>
                  <LifecycleBadge status={e.status} />
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  {e.startDate ? `${formatDate(e.startDate)} – ${formatDate(e.endDate)}` : 'Dates not set'}
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {e.subjects.map((s) => (
                    <span key={s.id} className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                      {s.subject.name}
                    </span>
                  ))}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {isAdmin && (
        <ExamModal
          open={creating}
          classes={classes.data?.classes ?? []}
          onClose={() => setCreating(false)}
          onSaved={(exam) => {
            setCreating(false);
            toast.success(`${exam.name} created for ${exam.class.name}.`);
            exams.reload();
          }}
        />
      )}
    </>
  );
}

const subjectRow = (subjectId) => ({ subjectId, fullMarks: '100', passMarks: '33', split: false, writtenMarks: '70', mcqMarks: '30', practicalMarks: '' });

/** Create an exam (or edit one, when `exam` is given). */
export function ExamModal({ open, exam, classes, onClose, onSaved }) {
  const f = useForm({ classId: '', name: '', startDate: '', endDate: '' });
  const [rows, setRows] = useState([]);
  const [classSubjects, setClassSubjects] = useState([]);

  useEffect(() => {
    if (!open) return;
    f.setErrors({});
    f.setSubmitError('');
    if (exam) {
      f.setValues({ classId: exam.class.id, name: exam.name, startDate: exam.startDate?.slice(0, 10) ?? '', endDate: exam.endDate?.slice(0, 10) ?? '' });
      setRows(
        exam.subjects.map((s) => ({
          subjectId: s.subjectId,
          fullMarks: String(Number(s.fullMarks)),
          passMarks: String(Number(s.passMarks)),
          split: s.writtenMarks != null || s.mcqMarks != null || s.practicalMarks != null,
          writtenMarks: s.writtenMarks != null ? String(Number(s.writtenMarks)) : '',
          mcqMarks: s.mcqMarks != null ? String(Number(s.mcqMarks)) : '',
          practicalMarks: s.practicalMarks != null ? String(Number(s.practicalMarks)) : '',
        })),
      );
    } else {
      f.setValues({ classId: classes[0]?.id ?? '', name: 'First Term', startDate: '', endDate: '' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, exam]);

  // Subjects available = subjects taught in the chosen class.
  useEffect(() => {
    const cid = f.values.classId;
    if (!open || !cid) return;
    academicService.getClass(cid).then((c) => {
      setClassSubjects(c.classSubjects.map((cs) => cs.subject));
      if (!exam) setRows(c.classSubjects.map((cs) => subjectRow(cs.subject.id)));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, f.values.classId]);

  const setRow = (i, field, value) => setRows((r) => r.map((row, idx) => (idx === i ? { ...row, [field]: value } : row)));
  const name = (id) => classSubjects.find((s) => s.id === id)?.name ?? '…';
  const unused = classSubjects.filter((s) => !rows.some((r) => r.subjectId === s.id));

  const onSubmit = f.submit(
    (v) => {
      const e = {};
      if (!v.classId) e.classId = 'Choose a class';
      if (!v.name.trim()) e.name = 'Enter the exam name';
      if (v.startDate && v.endDate && v.endDate < v.startDate) e.endDate = 'End date is before the start date';
      if (rows.length === 0) e.subjects = 'Add at least one subject';
      rows.forEach((r) => {
        const full = Number(r.fullMarks);
        if (!(full > 0)) e.subjects = `${name(r.subjectId)}: full marks must be more than 0`;
        else if (!(Number(r.passMarks) >= 0) || Number(r.passMarks) > full) e.subjects = `${name(r.subjectId)}: pass marks must be between 0 and ${full}`;
        else if (r.split) {
          const sum = ['writtenMarks', 'mcqMarks', 'practicalMarks'].reduce((a, k) => a + (Number(r[k]) || 0), 0);
          if (Math.abs(sum - full) > 0.001) e.subjects = `${name(r.subjectId)}: written + MCQ + practical must equal ${full}`;
        }
      });
      return e;
    },
    async (v) => {
      const subjects = rows.map((r) => ({
        subjectId: r.subjectId,
        fullMarks: Number(r.fullMarks),
        passMarks: Number(r.passMarks),
        writtenMarks: r.split && r.writtenMarks !== '' ? Number(r.writtenMarks) : null,
        mcqMarks: r.split && r.mcqMarks !== '' ? Number(r.mcqMarks) : null,
        practicalMarks: r.split && r.practicalMarks !== '' ? Number(r.practicalMarks) : null,
      }));
      const payload = { name: v.name.trim(), startDate: v.startDate || null, endDate: v.endDate || null, subjects };
      try {
        onSaved(exam ? await examService.update(exam.id, payload) : await examService.create({ ...payload, classId: v.classId }));
      } catch (err) {
        f.handleApiError(err, { DUPLICATE_EXAM: 'name' });
      }
    },
  );

  return (
    <Modal
      open={open}
      onClose={f.submitting ? undefined : onClose}
      title={exam ? `Edit ${exam.name}` : 'New exam'}
      description="Marks per subject can be one total, or split into written, MCQ and practical parts."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={f.submitting}>
            Cancel
          </Button>
          <Button type="submit" form="exam-form" loading={f.submitting}>
            {exam ? 'Save exam' : 'Create exam'}
          </Button>
        </>
      }
    >
      <form id="exam-form" onSubmit={onSubmit} noValidate className="space-y-4">
        {f.submitError && <Alert type="error">{f.submitError}</Alert>}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {!exam && <SelectField label="Class" options={classes.map((c) => ({ value: c.id, label: c.name }))} {...f.bind('classId')} />}
          <div className={exam ? 'sm:col-span-2' : ''}>
            <TextField label="Exam name" list="exam-names" required {...f.bind('name')} />
            <datalist id="exam-names">
              {EXAM_NAMES.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </div>
          <TextField label="Starts" type="date" {...f.bind('startDate')} />
          <TextField label="Ends" type="date" {...f.bind('endDate')} />
        </div>

        <fieldset>
          <legend className="label">Subjects</legend>
          {f.errors.subjects && <Alert type="error" className="mb-2">{f.errors.subjects}</Alert>}
          <ul className="space-y-3">
            {rows.map((r, i) => (
              <li key={r.subjectId} className="rounded-lg border border-slate-200 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-slate-900">{name(r.subjectId)}</p>
                  <Button size="sm" variant="ghost" onClick={() => setRows((all) => all.filter((_, idx) => idx !== i))} aria-label={`Remove ${name(r.subjectId)}`}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <label className="text-xs text-slate-600">
                    Full marks
                    <input type="number" min="1" className="input mt-1" value={r.fullMarks} onChange={(e) => setRow(i, 'fullMarks', e.target.value)} />
                  </label>
                  <label className="text-xs text-slate-600">
                    Pass marks
                    <input type="number" min="0" className="input mt-1" value={r.passMarks} onChange={(e) => setRow(i, 'passMarks', e.target.value)} />
                  </label>
                  <label className="col-span-2 flex items-end gap-2 pb-2 text-sm text-slate-700">
                    <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-brand-600" checked={r.split} onChange={(e) => setRow(i, 'split', e.target.checked)} />
                    Split into written / MCQ / practical
                  </label>
                </div>
                {r.split && (
                  <div className="mt-2 grid grid-cols-3 gap-3">
                    {[
                      ['writtenMarks', 'Written'],
                      ['mcqMarks', 'MCQ'],
                      ['practicalMarks', 'Practical'],
                    ].map(([k, label]) => (
                      <label key={k} className="text-xs text-slate-600">
                        {label}
                        <input type="number" min="0" className="input mt-1" value={r[k]} onChange={(e) => setRow(i, k, e.target.value)} placeholder="—" />
                      </label>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
          {unused.length > 0 && (
            <select
              className="input mt-3"
              value=""
              onChange={(e) => e.target.value && setRows((all) => [...all, subjectRow(e.target.value)])}
              aria-label="Add subject"
            >
              <option value="">+ Add a subject…</option>
              {unused.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
        </fieldset>
      </form>
    </Modal>
  );
}

function GradingScale() {
  const toast = useToast();
  const scale = useAsync(() => examService.gradeScale(), []);
  const [bands, setBands] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (scale.data) setBands(scale.data.map(({ grade, minPercent, maxPercent, gradePoint }) => ({ grade, minPercent: String(Number(minPercent)), maxPercent: String(Number(maxPercent)), gradePoint: String(Number(gradePoint)) })));
  }, [scale.data]);

  const set = (i, k, v) => setBands((b) => b.map((row, idx) => (idx === i ? { ...row, [k]: v } : row)));

  async function save() {
    setSaving(true);
    setError('');
    try {
      await examService.setGradeScale(bands.map((b) => ({ grade: b.grade.trim(), minPercent: Number(b.minPercent), maxPercent: Number(b.maxPercent), gradePoint: Number(b.gradePoint) })));
      toast.success('Grading scale saved. Unpublished results were re-graded.');
      scale.reload();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (scale.loading && !scale.data) return <Spinner />;
  if (scale.error) return <LoadError error={scale.error} onRetry={scale.reload} />;

  return (
    <Card
      className="max-w-2xl"
      title="Grading scale"
      description="Used to grade every subject and compute GPA. Published results keep the grades they were issued with."
      bodyClassName="p-0"
    >
      {error && (
        <div className="p-4 pb-0">
          <Alert type="error">{error}</Alert>
        </div>
      )}
      <div className="relative overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
            <tr>
              <th scope="col" className="px-5 py-3">Grade</th>
              <th scope="col" className="px-3 py-3">From %</th>
              <th scope="col" className="px-3 py-3">To %</th>
              <th scope="col" className="px-3 py-3">Grade point</th>
              <th scope="col" className="px-3 py-3"><span className="sr-only">Remove</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {bands.map((b, i) => (
              <tr key={i}>
                {['grade', 'minPercent', 'maxPercent', 'gradePoint'].map((k) => (
                  <td key={k} className={k === 'grade' ? 'px-5 py-2' : 'px-3 py-2'}>
                    <input
                      className="input w-24 py-1.5"
                      type={k === 'grade' ? 'text' : 'number'}
                      step="0.01"
                      value={b[k]}
                      onChange={(e) => set(i, k, e.target.value)}
                      aria-label={`${k} for row ${i + 1}`}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <Button size="sm" variant="ghost" onClick={() => setBands((all) => all.filter((_, idx) => idx !== i))} aria-label="Remove band">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3">
        <Button size="sm" variant="secondary" onClick={() => setBands((b) => [...b, { grade: '', minPercent: '', maxPercent: '', gradePoint: '' }])}>
          <Plus className="h-4 w-4" /> Add band
        </Button>
        <Button onClick={save} loading={saving}>
          Save scale
        </Button>
      </div>
    </Card>
  );
}
