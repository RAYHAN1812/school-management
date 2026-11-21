import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, ConfirmDialog, LoadError, Modal, PageHeader, Spinner, Tabs } from '../../components/common/ui';
import WeeklyTimetable, { DAYS, dayLabel } from '../../components/common/WeeklyTimetable';
import { SelectField, TextField } from '../../components/forms/fields';
import { useAsync } from '../../hooks/useAsync';
import { useToast } from '../../hooks/useAuth';
import { useForm } from '../../hooks/useForm';
import { useActiveTeachers, useClasses } from '../../hooks/useLookups';
import { academicService } from '../../services/school.service';
import { timetableService } from '../../services/operations.service';
import { getErrorMessage } from '../../utils/errors';

/** Admin: build routines per section; check any teacher's week. */
export default function TimetablePage() {
  const [view, setView] = useState('section');
  const classes = useClasses();
  const teachers = useActiveTeachers();

  return (
    <>
      <PageHeader title="Class routine" description="Weekly timetable. Clashes for a section, teacher or room are blocked automatically." />
      <Tabs
        tabs={[
          { value: 'section', label: 'By section' },
          { value: 'teacher', label: 'By teacher' },
        ]}
        value={view}
        onChange={setView}
      />
      {classes.loading || teachers.loading ? (
        <Spinner />
      ) : classes.error ? (
        <LoadError error={classes.error} onRetry={classes.reload} />
      ) : view === 'section' ? (
        <SectionView classes={classes.data.classes} teachers={teachers.data ?? []} />
      ) : (
        <TeacherView teachers={teachers.data ?? []} />
      )}
    </>
  );
}

function SectionView({ classes, teachers }) {
  const toast = useToast();
  const options = useMemo(() => classes.flatMap((c) => c.sections.map((s) => ({ classId: c.id, className: c.name, sectionId: s.id, sectionName: s.name }))), [classes]);
  const [sectionId, setSectionId] = useState(options[0]?.sectionId ?? '');
  const current = options.find((o) => o.sectionId === sectionId);
  const entries = useAsync(() => (sectionId ? timetableService.list({ sectionId }) : Promise.resolve([])), [sectionId]);
  const [editing, setEditing] = useState(null); // null | { new: true, day } | entry

  if (options.length === 0) return <Alert type="info">Create classes and sections first (Academics).</Alert>;

  return (
    <>
      <Card bodyClassName="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <label className="sm:w-72">
          <span className="label">Section</span>
          <select className="input" value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
            {options.map((o) => (
              <option key={o.sectionId} value={o.sectionId}>
                {o.className} · Section {o.sectionName}
              </option>
            ))}
          </select>
        </label>
        <Button onClick={() => setEditing({ new: true })}>
          <Plus className="h-4 w-4" /> Add period
        </Button>
      </Card>
      <div className="mt-4">
        {entries.loading && !entries.data ? (
          <Spinner />
        ) : entries.error ? (
          <LoadError error={entries.error} onRetry={entries.reload} />
        ) : (
          <WeeklyTimetable entries={entries.data} show="teacher" onSelect={(e) => setEditing(e)} emptyText="No periods yet — add the first one." />
        )}
      </div>
      <PeriodModal
        open={Boolean(editing)}
        entry={editing?.new ? null : editing}
        target={current}
        teachers={teachers}
        onClose={() => setEditing(null)}
        onSaved={(message) => {
          setEditing(null);
          toast.success(message);
          entries.reload();
        }}
      />
    </>
  );
}

function TeacherView({ teachers }) {
  const [teacherId, setTeacherId] = useState(teachers[0]?.id ?? '');
  const entries = useAsync(() => (teacherId ? timetableService.list({ teacherId }) : Promise.resolve([])), [teacherId]);
  const minutes = (entries.data ?? []).reduce((a, e) => a + (e.endMinute - e.startMinute), 0);

  return (
    <>
      <Card bodyClassName="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <label className="sm:w-72">
          <span className="label">Teacher</span>
          <select className="input" value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.fullName} ({t.employeeCode})
              </option>
            ))}
          </select>
        </label>
        {entries.data && (
          <p className="text-sm text-slate-600">
            <span className="font-semibold text-slate-900">{entries.data.length}</span> periods ·{' '}
            <span className="font-semibold text-slate-900">{(minutes / 60).toFixed(1)}</span> teaching hours per week
          </p>
        )}
      </Card>
      <div className="mt-4">
        {entries.loading && !entries.data ? <Spinner /> : <WeeklyTimetable entries={entries.data} show="class" emptyText="No periods assigned." />}
      </div>
    </>
  );
}

function PeriodModal({ open, entry, target, teachers, onClose, onSaved }) {
  const f = useForm({ dayOfWeek: 'SUNDAY', startTime: '08:00', endTime: '08:45', subjectId: '', teacherId: '', roomNumber: '' });
  const [klass, setKlass] = useState(null);
  const [conflicts, setConflicts] = useState([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const classId = entry?.class.id ?? target?.classId;

  useEffect(() => {
    if (!open) return;
    setConflicts([]);
    f.setErrors({});
    f.setSubmitError('');
    f.setValues(
      entry
        ? {
            dayOfWeek: entry.dayOfWeek,
            startTime: entry.startTime,
            endTime: entry.endTime,
            subjectId: entry.subject.id,
            teacherId: entry.teacher.id,
            roomNumber: entry.roomNumber ?? '',
          }
        : { dayOfWeek: 'SUNDAY', startTime: '08:00', endTime: '08:45', subjectId: '', teacherId: '', roomNumber: '' },
    );
    if (classId) academicService.getClass(classId).then(setKlass).catch(() => setKlass(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, entry]);

  const classSubjects = klass?.classSubjects ?? [];
  const onSubjectChange = (e) => {
    const subjectId = e.target.value;
    f.setValue('subjectId', subjectId);
    // Default to the class's subject teacher.
    const t = classSubjects.find((cs) => cs.subject.id === subjectId)?.teacher;
    if (t && !f.values.teacherId) f.setValue('teacherId', t.id);
  };

  const onSubmit = f.submit(
    (v) => {
      const e = {};
      if (!v.subjectId) e.subjectId = 'Choose a subject';
      if (!v.teacherId) e.teacherId = 'Choose a teacher';
      if (!/^\d{2}:\d{2}$/.test(v.startTime)) e.startTime = 'Enter a start time';
      if (!/^\d{2}:\d{2}$/.test(v.endTime)) e.endTime = 'Enter an end time';
      else if (v.endTime <= v.startTime) e.endTime = 'End must be after start';
      return e;
    },
    async (v) => {
      setConflicts([]);
      const payload = { ...v, roomNumber: v.roomNumber.trim() || null };
      try {
        if (entry) {
          await timetableService.update(entry.id, payload);
          onSaved('Period updated.');
        } else {
          await timetableService.create({ ...payload, classId: target.classId, sectionId: target.sectionId });
          onSaved('Period added.');
        }
      } catch (err) {
        const details = err.response?.data?.error?.details?.conflicts;
        if (details) setConflicts(details);
        else f.handleApiError(err, { SUBJECT_NOT_IN_CLASS: 'subjectId', TEACHER_INACTIVE: 'teacherId' });
      }
    },
  );

  async function remove() {
    setDeleting(true);
    try {
      await timetableService.remove(entry.id);
      setConfirmDelete(false);
      onSaved('Period removed.');
    } catch (err) {
      f.setSubmitError(getErrorMessage(err));
    } finally {
      setDeleting(false);
    }
  }

  const title = entry
    ? `${entry.subject.name} · ${entry.class.name} ${entry.section.name}`
    : `Add period · ${target?.className ?? ''} Section ${target?.sectionName ?? ''}`;

  return (
    <>
      <Modal
        open={open && !confirmDelete}
        onClose={f.submitting ? undefined : onClose}
        title={title}
        footer={
          <div className="flex w-full items-center justify-between gap-2">
            {entry ? (
              <Button variant="ghost" onClick={() => setConfirmDelete(true)} className="text-red-600 hover:bg-red-50 hover:text-red-700">
                <Trash2 className="h-4 w-4" /> Remove
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="secondary" onClick={onClose} disabled={f.submitting}>
                Cancel
              </Button>
              <Button type="submit" form="period-form" loading={f.submitting}>
                {entry ? 'Save' : 'Add period'}
              </Button>
            </div>
          </div>
        }
      >
        <form id="period-form" onSubmit={onSubmit} noValidate className="space-y-4">
          {conflicts.length > 0 && (
            <Alert type="error" title="This period clashes with the routine">
              <ul className="list-disc space-y-0.5 pl-4">
                {conflicts.map((c) => (
                  <li key={c.entryId}>{c.message}</li>
                ))}
              </ul>
            </Alert>
          )}
          {f.submitError && <Alert type="error">{f.submitError}</Alert>}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <SelectField label="Day" options={DAYS.map((d) => ({ value: d, label: dayLabel(d) }))} {...f.bind('dayOfWeek')} />
            <TextField label="Start" type="time" {...f.bind('startTime')} />
            <TextField label="End" type="time" {...f.bind('endTime')} />
          </div>
          <SelectField
            label="Subject"
            placeholder={klass ? 'Select subject' : 'Loading…'}
            options={classSubjects.map((cs) => ({ value: cs.subject.id, label: cs.subject.name }))}
            hint={klass && classSubjects.length === 0 ? 'This class has no subjects yet — add them under Academics.' : undefined}
            {...f.bind('subjectId')}
            onChange={onSubjectChange}
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <SelectField
              label="Teacher"
              placeholder="Select teacher"
              options={teachers.map((t) => ({ value: t.id, label: t.fullName }))}
              {...f.bind('teacherId')}
            />
            <TextField label="Room" placeholder="Section's room" hint="Blank = section's home room" {...f.bind('roomNumber')} />
          </div>
        </form>
      </Modal>
      <ConfirmDialog
        open={confirmDelete}
        title="Remove this period?"
        message="It will be removed from the routine for the section and the teacher."
        confirmLabel="Remove"
        loading={deleting}
        onConfirm={remove}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
}
