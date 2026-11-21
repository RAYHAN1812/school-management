import { ArrowLeft, CheckCircle2, Clock, NotebookPen, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Alert, Badge, Button, Card, EmptyState, LifecycleBadge, LoadError, Modal, PageHeader, Spinner, StatCard, Tabs } from '../../components/common/ui';
import { AttachmentLink, FileUpload } from '../../components/forms/FileUpload';
import { CheckboxField, SelectField, TextAreaField, TextField } from '../../components/forms/fields';
import { useArea } from '../../hooks/useArea';
import { useAsync } from '../../hooks/useAsync';
import { useAuth, useToast } from '../../hooks/useAuth';
import { useForm } from '../../hooks/useForm';
import { useClasses } from '../../hooks/useLookups';
import { homeworkService } from '../../services/campus.service';
import { academicService } from '../../services/school.service';
import { getErrorMessage } from '../../utils/errors';
import { formatDate, formatDateTime } from '../../utils/format';
import { ROLES } from '../../utils/roles';
import PortalShell from '../portal/PortalShell';

const dueLabel = (d) => {
  const ms = new Date(d) - Date.now();
  if (ms < 0) return { text: `Closed ${formatDate(d)}`, tone: 'text-slate-500' };
  const days = Math.floor(ms / 86400000);
  return { text: days === 0 ? `Due today ${formatDateTime(d).slice(-5)}` : `Due in ${days} day${days > 1 ? 's' : ''}`, tone: days <= 1 ? 'text-amber-700' : 'text-slate-600' };
};

/** Routes to the right homework view for the signed-in role. */
export default function HomeworkPage() {
  const { user } = useAuth();
  if (user.role.key === ROLES.STUDENT || user.role.key === ROLES.PARENT) {
    return <PortalShell title="Homework">{(child) => <StudentHomework key={child.id} child={child} isParent={user.role.key === ROLES.PARENT} />}</PortalShell>;
  }
  return <StaffHomework />;
}

// ───────────────────────── Teachers & admins ─────────────────────────

function StaffHomework() {
  const { base } = useArea();
  const toast = useToast();
  const [when, setWhen] = useState('upcoming');
  const list = useAsync(() => homeworkService.list({ when }), [when]);
  const [creating, setCreating] = useState(false);

  return (
    <>
      <PageHeader
        title="Homework"
        description="Set work, collect submissions and give feedback."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> Set homework
          </Button>
        }
      />
      <Tabs
        tabs={[
          { value: 'upcoming', label: 'Open' },
          { value: 'past', label: 'Closed' },
        ]}
        value={when}
        onChange={setWhen}
      />
      {list.loading && !list.data ? (
        <Spinner />
      ) : list.error ? (
        <LoadError error={list.error} onRetry={list.reload} />
      ) : list.data.length === 0 ? (
        <Card>
          <EmptyState icon={NotebookPen} title={when === 'upcoming' ? 'No open homework' : 'No closed homework'} />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {list.data.map((a) => {
            const due = dueLabel(a.dueDate);
            return (
              <Link key={a.id} to={`${base}/homework/${a.id}`} className="card block p-5 transition-shadow hover:shadow-md">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-900">{a.title}</p>
                    <p className="text-sm text-slate-500">
                      {a.subject.name} · {a.class.name}
                      {a.section ? ` ${a.section.name}` : ' (all sections)'}
                    </p>
                  </div>
                  <Badge className="bg-slate-100 text-slate-700 ring-slate-500/20">{a._count.submissions} submitted</Badge>
                </div>
                <p className={`mt-3 flex items-center gap-1 text-xs ${due.tone}`}>
                  <Clock className="h-3.5 w-3.5" /> {due.text}
                </p>
              </Link>
            );
          })}
        </div>
      )}
      <AssignmentModal
        open={creating}
        onClose={() => setCreating(false)}
        onSaved={() => {
          setCreating(false);
          toast.success('Homework set.');
          setWhen('upcoming');
          list.reload();
        }}
      />
    </>
  );
}

function AssignmentModal({ open, onClose, onSaved }) {
  const { isAdmin } = useArea();
  const classes = useClasses();
  const f = useForm({ classId: '', sectionId: '', subjectId: '', title: '', description: '', dueDate: '', totalMarks: '', allowResubmission: false, attachmentUrl: null });
  const [klass, setKlass] = useState(null);

  useEffect(() => {
    if (!open) return;
    const tomorrow = new Date(Date.now() + 2 * 86400000);
    tomorrow.setHours(9, 0, 0, 0);
    const local = new Date(tomorrow.getTime() - tomorrow.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    f.setValues({ classId: '', sectionId: '', subjectId: '', title: '', description: '', dueDate: local, totalMarks: '', allowResubmission: false, attachmentUrl: null });
    f.setErrors({});
    f.setSubmitError('');
    setKlass(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!f.values.classId) return;
    academicService.getClass(f.values.classId).then(setKlass);
  }, [f.values.classId]);

  const onSubmit = f.submit(
    (v) => {
      const e = {};
      if (!v.classId) e.classId = 'Choose a class';
      if (!v.subjectId) e.subjectId = 'Choose a subject';
      if (!v.title.trim()) e.title = 'Give it a title';
      if (!v.description.trim()) e.description = 'Write the instructions';
      if (!v.dueDate) e.dueDate = 'Set a deadline';
      if (v.totalMarks && !(Number(v.totalMarks) > 0)) e.totalMarks = 'Enter a number above 0';
      return e;
    },
    async (v) => {
      try {
        await homeworkService.create({
          classId: v.classId,
          sectionId: v.sectionId || null,
          subjectId: v.subjectId,
          title: v.title.trim(),
          description: v.description.trim(),
          dueDate: new Date(v.dueDate).toISOString(),
          totalMarks: v.totalMarks ? Number(v.totalMarks) : null,
          allowResubmission: v.allowResubmission,
          attachmentUrl: v.attachmentUrl,
        });
        onSaved();
      } catch (err) {
        f.handleApiError(err, { SUBJECT_NOT_IN_CLASS: 'subjectId' });
      }
    },
  );

  return (
    <Modal
      open={open}
      onClose={f.submitting ? undefined : onClose}
      title="Set homework"
      description={isAdmin ? 'Admins set homework on behalf of the subject teacher.' : 'Only subjects you teach are accepted.'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={f.submitting}>
            Cancel
          </Button>
          <Button type="submit" form="assignment-form" loading={f.submitting}>
            Set homework
          </Button>
        </>
      }
    >
      <form id="assignment-form" onSubmit={onSubmit} noValidate className="space-y-4">
        {f.submitError && <Alert type="error">{f.submitError}</Alert>}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <SelectField label="Class" placeholder="Select" options={(classes.data?.classes ?? []).map((c) => ({ value: c.id, label: c.name }))} {...f.bind('classId')} onChange={(e) => { f.setValue('classId', e.target.value); f.setValue('sectionId', ''); f.setValue('subjectId', ''); }} />
          <SelectField label="Section" placeholder="All sections" options={(klass?.sections ?? []).map((s) => ({ value: s.id, label: `Section ${s.name}` }))} {...f.bind('sectionId')} />
          <SelectField label="Subject" placeholder="Select" options={(klass?.classSubjects ?? []).map((cs) => ({ value: cs.subject.id, label: cs.subject.name }))} {...f.bind('subjectId')} />
        </div>
        <TextField label="Title" placeholder="Fractions worksheet" {...f.bind('title')} />
        <TextAreaField label="Instructions" rows={4} {...f.bind('description')} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField label="Deadline" type="datetime-local" {...f.bind('dueDate')} />
          <TextField label="Total marks" type="number" min="1" hint="Optional" {...f.bind('totalMarks')} />
        </div>
        <FileUpload value={f.values.attachmentUrl} onChange={(url) => f.setValue('attachmentUrl', url)} />
        <CheckboxField
          label="Allow resubmission"
          description="Students can replace their work until it's graded."
          checked={f.values.allowResubmission}
          onChange={(on) => f.setValue('allowResubmission', on)}
        />
      </form>
    </Modal>
  );
}

/** Submissions & grading for one assignment. */
export function HomeworkDetailPage() {
  const { id } = useParams();
  const { base } = useArea();
  const toast = useToast();
  const data = useAsync(() => homeworkService.submissions(id), [id]);
  const [grading, setGrading] = useState(null);

  if (data.loading && !data.data) return <Spinner />;
  if (data.error) return <LoadError error={data.error} onRetry={data.reload} />;
  const { assignment: a, summary, rows } = data.data;

  return (
    <>
      <Link to={`${base}/homework`} className="mb-3 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> Homework
      </Link>
      <PageHeader title={a.title} description={`${a.subject.name} · ${a.class.name}${a.section ? ` ${a.section.name}` : ''} · due ${formatDateTime(a.dueDate)}`} />
      <Card className="mb-6">
        <p className="whitespace-pre-line text-sm text-slate-700">{a.description}</p>
        {a.attachmentUrl && (
          <p className="mt-3 text-sm">
            <AttachmentLink url={a.attachmentUrl} name="Homework file" />
          </p>
        )}
      </Card>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Students" value={summary.students} tone="brand" />
        <StatCard label="Submitted" value={summary.submitted} tone="emerald" />
        <StatCard label="Late" value={summary.late} tone="amber" />
        <StatCard label="Graded" value={summary.graded} tone="sky" />
      </div>
      <Card bodyClassName="p-0" title="Submissions">
        <ul className="divide-y divide-slate-100">
          {rows.map((r) => (
            <li key={r.student.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="font-medium text-slate-900">
                  <span className="tabular-nums text-slate-400">
                    {r.section.name}-{r.rollNumber}
                  </span>{' '}
                  {r.student.fullName}
                </p>
                {r.submission ? (
                  <div className="text-xs text-slate-500">
                    Submitted {formatDateTime(r.submission.submittedAt)}
                    {r.submission.version > 1 ? ` (version ${r.submission.version})` : ''}
                    {r.submission.content && <p className="mt-1 line-clamp-2 text-slate-600">{r.submission.content}</p>}
                    {r.submission.attachmentUrl && (
                      <span className="mt-1 block">
                        <AttachmentLink url={r.submission.attachmentUrl} name="Submitted file" />
                      </span>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">Not submitted</p>
                )}
              </div>
              {r.submission && (
                <div className="flex items-center gap-2">
                  <LifecycleBadge status={r.submission.status} />
                  {r.submission.marks != null && (
                    <span className="text-sm font-semibold tabular-nums">
                      {Number(r.submission.marks)}
                      {a.totalMarks ? `/${Number(a.totalMarks)}` : ''}
                    </span>
                  )}
                  <Button size="sm" variant="secondary" onClick={() => setGrading(r)}>
                    {r.submission.status === 'GRADED' ? 'Edit grade' : 'Grade'}
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </Card>
      <GradeModal
        open={Boolean(grading)}
        row={grading}
        totalMarks={a.totalMarks}
        onClose={() => setGrading(null)}
        onDone={() => {
          setGrading(null);
          toast.success('Feedback saved.');
          data.reload();
        }}
      />
    </>
  );
}

function GradeModal({ open, row, totalMarks, onClose, onDone }) {
  const f = useForm({ marks: '', feedback: '' });
  useEffect(() => {
    if (open && row) {
      f.setValues({ marks: row.submission.marks != null ? String(Number(row.submission.marks)) : '', feedback: row.submission.feedback ?? '' });
      f.setErrors({});
      f.setSubmitError('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const onSubmit = f.submit(
    (v) => {
      if (v.marks === '') return {};
      const m = Number(v.marks);
      if (!(m >= 0)) return { marks: 'Enter 0 or more' };
      if (totalMarks && m > Number(totalMarks)) return { marks: `Can't exceed ${Number(totalMarks)}` };
      return {};
    },
    async (v) => {
      try {
        await homeworkService.grade(row.submission.id, { marks: v.marks === '' ? null : Number(v.marks), feedback: v.feedback.trim() || null });
        onDone();
      } catch (err) {
        f.handleApiError(err, { MARKS_EXCEED_FULL_MARKS: 'marks' });
      }
    },
  );
  return (
    <Modal
      open={open}
      onClose={f.submitting ? undefined : onClose}
      title={`Grade ${row?.student.fullName ?? ''}`}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={f.submitting}>
            Cancel
          </Button>
          <Button type="submit" form="grade-form" loading={f.submitting}>
            Save
          </Button>
        </>
      }
    >
      <form id="grade-form" onSubmit={onSubmit} noValidate className="space-y-4">
        {f.submitError && <Alert type="error">{f.submitError}</Alert>}
        <TextField label={`Marks${totalMarks ? ` (out of ${Number(totalMarks)})` : ''}`} type="number" min="0" step="0.5" {...f.bind('marks')} />
        <TextAreaField label="Feedback" rows={3} {...f.bind('feedback')} />
      </form>
    </Modal>
  );
}

// ───────────────────────── Students & parents ─────────────────────────

function StudentHomework({ child, isParent }) {
  const toast = useToast();
  const list = useAsync(() => homeworkService.list(isParent ? { studentId: child.id } : {}), [child.id]);
  const [submitting, setSubmitting] = useState(null);

  if (list.loading && !list.data) return <Spinner />;
  if (list.error) return <LoadError error={list.error} onRetry={list.reload} />;
  if (list.data.length === 0) {
    return (
      <Card>
        <EmptyState icon={NotebookPen} title="No homework yet" />
      </Card>
    );
  }
  const pending = list.data.filter((a) => !a.mySubmission && new Date(a.dueDate) > new Date());

  return (
    <>
      {pending.length > 0 && (
        <Alert type="info" className="mb-4">
          {pending.length} piece{pending.length > 1 ? 's' : ''} of homework still to hand in.
        </Alert>
      )}
      <div className="space-y-4">
        {list.data.map((a) => {
          const s = a.mySubmission;
          const due = dueLabel(a.dueDate);
          const canSubmit = !isParent && (!s || (a.allowResubmission && s.status !== 'GRADED'));
          return (
            <Card
              key={a.id}
              title={a.title}
              description={`${a.subject.name} · ${a.teacher.fullName}`}
              actions={s ? <LifecycleBadge status={s.status} /> : <span className={`text-xs font-medium ${due.tone}`}>{due.text}</span>}
            >
              <p className="whitespace-pre-line text-sm text-slate-700">{a.description}</p>
              {a.attachmentUrl && (
                <p className="mt-2 text-sm">
                  <AttachmentLink url={a.attachmentUrl} name="Homework file" />
                </p>
              )}
              {s && (
                <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm">
                  <p className="flex items-center gap-1.5 font-medium text-slate-800">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Handed in {formatDateTime(s.submittedAt)}
                    {s.isLate && <span className="text-amber-700">(late)</span>}
                  </p>
                  {s.status === 'GRADED' && (
                    <p className="mt-1 text-slate-700">
                      {s.marks != null && (
                        <span className="font-semibold">
                          {Number(s.marks)}
                          {a.totalMarks ? `/${Number(a.totalMarks)}` : ''}
                        </span>
                      )}
                      {s.feedback && <span> — “{s.feedback}”</span>}
                    </p>
                  )}
                </div>
              )}
              {canSubmit && (
                <div className="mt-4">
                  <Button size="sm" onClick={() => setSubmitting(a)}>
                    {s ? 'Resubmit' : 'Hand in'}
                  </Button>
                </div>
              )}
            </Card>
          );
        })}
      </div>
      <SubmitModal
        open={Boolean(submitting)}
        assignment={submitting}
        onClose={() => setSubmitting(null)}
        onDone={(late) => {
          setSubmitting(null);
          toast.success(late ? 'Handed in (after the deadline).' : 'Handed in. Well done!');
          list.reload();
        }}
      />
    </>
  );
}

function SubmitModal({ open, assignment, onClose, onDone }) {
  const f = useForm({ content: '', attachmentUrl: null });
  useEffect(() => {
    if (open) {
      f.setValues({ content: '', attachmentUrl: null });
      f.setErrors({});
      f.setSubmitError('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const onSubmit = f.submit(
    (v) => (!v.content.trim() && !v.attachmentUrl ? { content: 'Write your answer or attach a file' } : {}),
    async (v) => {
      try {
        const s = await homeworkService.submit(assignment.id, { content: v.content.trim() || null, attachmentUrl: v.attachmentUrl });
        onDone(s.isLate);
      } catch (err) {
        f.setSubmitError(getErrorMessage(err));
      }
    },
  );
  const late = assignment && new Date(assignment.dueDate) < new Date();
  return (
    <Modal
      open={open}
      onClose={f.submitting ? undefined : onClose}
      title={`Hand in: ${assignment?.title ?? ''}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={f.submitting}>
            Cancel
          </Button>
          <Button type="submit" form="submit-form" loading={f.submitting}>
            Hand in
          </Button>
        </>
      }
    >
      <form id="submit-form" onSubmit={onSubmit} noValidate className="space-y-4">
        {late && <Alert type="info">The deadline has passed — this will be marked as late.</Alert>}
        {!assignment?.allowResubmission && <Alert type="info">You can hand this in only once.</Alert>}
        {f.submitError && <Alert type="error">{f.submitError}</Alert>}
        <TextAreaField label="Your answer" rows={5} {...f.bind('content')} />
        <FileUpload label="Attach your work" value={f.values.attachmentUrl} onChange={(url) => f.setValue('attachmentUrl', url)} />
      </form>
    </Modal>
  );
}
