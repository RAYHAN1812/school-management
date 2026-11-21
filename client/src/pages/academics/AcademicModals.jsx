import { useEffect, useMemo } from 'react';
import { Alert, Button, Modal } from '../../components/common/ui';
import { CheckboxField, SelectField, TextField } from '../../components/forms/fields';
import { useForm } from '../../hooks/useForm';
import { academicService } from '../../services/school.service';
import { toDateInput } from '../../utils/format';

const CLASS_PRESETS = ['Play Group', 'Nursery', 'KG', ...Array.from({ length: 10 }, (_, i) => `Class ${i + 1}`)];
const levelFor = (name) =>
  name === 'Play Group' ? -2 : name === 'Nursery' ? -1 : name === 'KG' ? 0 : Number(/\d+/.exec(name)?.[0] ?? '') || null;

function ModalForm({ id, open, onClose, title, description, submitting, submitLabel, submitError, onSubmit, children }) {
  return (
    <Modal
      open={open}
      onClose={submitting ? undefined : onClose}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" form={id} loading={submitting}>
            {submitLabel}
          </Button>
        </>
      }
    >
      <form id={id} onSubmit={onSubmit} noValidate className="space-y-4">
        {submitError && <Alert type="error">{submitError}</Alert>}
        {children}
      </form>
    </Modal>
  );
}

// ── Academic year ──────────────────────────────────────
export function YearModal({ open, year, onClose, onSaved }) {
  const empty = { name: '', startDate: '', endDate: '', status: 'UPCOMING' };
  const f = useForm(empty);
  useEffect(() => {
    if (open) {
      f.setValues(year ? { name: year.name, startDate: toDateInput(year.startDate), endDate: toDateInput(year.endDate), status: year.status } : empty);
      f.setErrors({});
      f.setSubmitError('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, year]);

  const validate = (v) => {
    const e = {};
    if (!v.name.trim()) e.name = 'Enter a name, e.g. 2027';
    if (!v.startDate) e.startDate = 'Choose a start date';
    if (!v.endDate) e.endDate = 'Choose an end date';
    else if (v.startDate && v.endDate <= v.startDate) e.endDate = 'End date must be after the start date';
    return e;
  };

  const onSubmit = f.submit(validate, async (v) => {
    try {
      const saved = year ? await academicService.updateYear(year.id, v) : await academicService.createYear(v);
      onSaved(saved);
    } catch (err) {
      f.handleApiError(err, { DUPLICATE_ACADEMIC_YEAR: 'name' });
    }
  });

  return (
    <ModalForm
      id="year-form"
      open={open}
      onClose={onClose}
      title={year ? `Edit ${year.name}` : 'New academic year'}
      description="Only one year can be active. Activating a year marks the current one as completed."
      submitting={f.submitting}
      submitLabel={year ? 'Save changes' : 'Create year'}
      submitError={f.submitError}
      onSubmit={onSubmit}
    >
      <TextField label="Name" placeholder="2027" required {...f.bind('name')} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField label="Start date" type="date" required {...f.bind('startDate')} />
        <TextField label="End date" type="date" required {...f.bind('endDate')} />
      </div>
      <SelectField
        label="Status"
        options={[
          { value: 'UPCOMING', label: 'Upcoming' },
          { value: 'ACTIVE', label: 'Active' },
          { value: 'COMPLETED', label: 'Completed' },
        ]}
        {...f.bind('status')}
      />
    </ModalForm>
  );
}

// ── Subject ────────────────────────────────────────────
export function SubjectModal({ open, subject, onClose, onSaved }) {
  const empty = { name: '', code: '', isOptional: false, hasPractical: false };
  const f = useForm(empty);
  useEffect(() => {
    if (open) {
      f.setValues(subject ? { name: subject.name, code: subject.code, isOptional: subject.isOptional, hasPractical: subject.hasPractical } : empty);
      f.setErrors({});
      f.setSubmitError('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, subject]);

  const validate = (v) => {
    const e = {};
    if (!v.name.trim()) e.name = 'Enter the subject name';
    if (!/^[A-Za-z0-9-]{2,15}$/.test(v.code.trim())) e.code = '2–15 letters, numbers or dashes';
    return e;
  };

  const onSubmit = f.submit(validate, async (v) => {
    try {
      const payload = { ...v, name: v.name.trim(), code: v.code.trim() };
      onSaved(subject ? await academicService.updateSubject(subject.id, payload) : await academicService.createSubject(payload));
    } catch (err) {
      f.handleApiError(err, { DUPLICATE_SUBJECT_CODE: 'code' });
    }
  });

  return (
    <ModalForm
      id="subject-form"
      open={open}
      onClose={onClose}
      title={subject ? `Edit ${subject.name}` : 'New subject'}
      submitting={f.submitting}
      submitLabel={subject ? 'Save changes' : 'Create subject'}
      submitError={f.submitError}
      onSubmit={onSubmit}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <TextField label="Subject name" placeholder="Mathematics" required {...f.bind('name')} />
        </div>
        <TextField label="Code" placeholder="MATH" required {...f.bind('code')} />
      </div>
      <CheckboxField
        label="Optional subject"
        description="Students may choose whether to take it."
        checked={f.values.isOptional}
        onChange={(v) => f.setValue('isOptional', v)}
      />
      <CheckboxField
        label="Has a practical component"
        description="Exams for this subject include practical marks."
        checked={f.values.hasPractical}
        onChange={(v) => f.setValue('hasPractical', v)}
      />
    </ModalForm>
  );
}

// ── Class ──────────────────────────────────────────────
export function ClassModal({ open, klass, years, defaultYearId, subjects = [], onClose, onSaved }) {
  const empty = { academicYearId: defaultYearId ?? '', name: '', capacity: '80', sections: 'A, B', subjectIds: [] };
  const f = useForm(empty);
  useEffect(() => {
    if (open) {
      f.setValues(
        klass
          ? { academicYearId: klass.academicYearId, name: klass.name, capacity: String(klass.capacity), sections: '', subjectIds: [] }
          : { ...empty, academicYearId: defaultYearId ?? '' },
      );
      f.setErrors({});
      f.setSubmitError('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, klass, defaultYearId]);

  const sectionList = useMemo(
    () => f.values.sections.split(/[,\s]+/).map((s) => s.trim().toUpperCase()).filter(Boolean),
    [f.values.sections],
  );

  const validate = (v) => {
    const e = {};
    if (!klass && !v.academicYearId) e.academicYearId = 'Choose an academic year';
    if (!v.name.trim()) e.name = 'Enter the class name';
    const cap = Number(v.capacity);
    if (!Number.isInteger(cap) || cap < 1) e.capacity = 'Enter a whole number above 0';
    if (!klass) {
      if (sectionList.length === 0) e.sections = 'Add at least one section';
      else if (new Set(sectionList).size !== sectionList.length) e.sections = 'Section names must be unique';
    }
    return e;
  };

  const onSubmit = f.submit(validate, async (v) => {
    try {
      const name = v.name.trim();
      const saved = klass
        ? await academicService.updateClass(klass.id, { name, capacity: Number(v.capacity), numericLevel: levelFor(name) })
        : await academicService.createClass({
            academicYearId: v.academicYearId,
            name,
            numericLevel: levelFor(name),
            capacity: Number(v.capacity),
            sections: sectionList,
            subjectIds: v.subjectIds,
          });
      onSaved(saved);
    } catch (err) {
      f.handleApiError(err, { DUPLICATE_CLASS: 'name', CAPACITY_BELOW_ENROLLMENT: 'capacity' });
    }
  });

  const toggleSubject = (id, on) =>
    f.setValue('subjectIds', on ? [...f.values.subjectIds, id] : f.values.subjectIds.filter((s) => s !== id));

  return (
    <ModalForm
      id="class-form"
      open={open}
      onClose={onClose}
      title={klass ? `Edit ${klass.name}` : 'New class'}
      submitting={f.submitting}
      submitLabel={klass ? 'Save changes' : 'Create class'}
      submitError={f.submitError}
      onSubmit={onSubmit}
    >
      {!klass && (
        <SelectField
          label="Academic year"
          required
          placeholder="Select a year"
          options={(years ?? []).map((y) => ({ value: y.id, label: `${y.name}${y.status === 'ACTIVE' ? ' (active)' : ''}` }))}
          {...f.bind('academicYearId')}
        />
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <TextField label="Class name" list="class-presets" placeholder="Class 6" required {...f.bind('name')} />
          <datalist id="class-presets">
            {CLASS_PRESETS.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </div>
        <TextField label="Maximum students" type="number" min="1" required {...f.bind('capacity')} />
      </div>
      {!klass && (
        <>
          <TextField
            label="Sections"
            hint={sectionList.length ? `Will create: ${sectionList.join(', ')}` : 'Separate with commas, e.g. A, B, C'}
            required
            {...f.bind('sections')}
          />
          {subjects.length > 0 && (
            <fieldset>
              <legend className="label">Subjects taught</legend>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {subjects.map((s) => (
                  <CheckboxField
                    key={s.id}
                    label={`${s.name} (${s.code})`}
                    checked={f.values.subjectIds.includes(s.id)}
                    onChange={(on) => toggleSubject(s.id, on)}
                  />
                ))}
              </div>
            </fieldset>
          )}
        </>
      )}
    </ModalForm>
  );
}

// ── Section ────────────────────────────────────────────
export function SectionModal({ open, classId, section, teachers = [], onClose, onSaved }) {
  const empty = { name: '', capacity: '', roomNumber: '', classTeacherId: '' };
  const f = useForm(empty);
  useEffect(() => {
    if (open) {
      f.setValues(
        section
          ? {
              name: section.name,
              capacity: section.capacity ? String(section.capacity) : '',
              roomNumber: section.roomNumber ?? '',
              classTeacherId: section.classTeacher?.id ?? '',
            }
          : empty,
      );
      f.setErrors({});
      f.setSubmitError('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, section]);

  // Keep the current class teacher selectable even if they're no longer active.
  const teacherOptions = useMemo(() => {
    const list = teachers.map((t) => ({ value: t.id, label: `${t.fullName} (${t.employeeCode})` }));
    const current = section?.classTeacher;
    if (current && !list.some((o) => o.value === current.id)) {
      list.unshift({ value: current.id, label: `${current.fullName} (${current.status.toLowerCase()})` });
    }
    return list;
  }, [teachers, section]);

  const validate = (v) => {
    const e = {};
    if (!v.name.trim()) e.name = 'Enter a section name';
    if (v.capacity && (!Number.isInteger(Number(v.capacity)) || Number(v.capacity) < 1)) e.capacity = 'Enter a whole number above 0';
    return e;
  };

  const onSubmit = f.submit(validate, async (v) => {
    const payload = {
      name: v.name.trim(),
      capacity: v.capacity ? Number(v.capacity) : null,
      roomNumber: v.roomNumber.trim() || null,
      classTeacherId: v.classTeacherId || null,
    };
    try {
      onSaved(section ? await academicService.updateSection(section.id, payload) : await academicService.addSection(classId, payload));
    } catch (err) {
      f.handleApiError(err, {
        DUPLICATE_SECTION: 'name',
        CAPACITY_BELOW_ENROLLMENT: 'capacity',
        TEACHER_INACTIVE: 'classTeacherId',
      });
    }
  });

  return (
    <ModalForm
      id="section-form"
      open={open}
      onClose={onClose}
      title={section ? `Edit section ${section.name}` : 'Add section'}
      submitting={f.submitting}
      submitLabel={section ? 'Save changes' : 'Add section'}
      submitError={f.submitError}
      onSubmit={onSubmit}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <TextField label="Section" placeholder="C" required {...f.bind('name')} />
        <TextField label="Capacity" type="number" min="1" hint="Optional" {...f.bind('capacity')} />
        <TextField label="Room" placeholder="203" hint="Optional" {...f.bind('roomNumber')} />
      </div>
      <SelectField label="Class teacher" placeholder="No class teacher" options={teacherOptions} {...f.bind('classTeacherId')} />
    </ModalForm>
  );
}

// ── Class subjects ─────────────────────────────────────
export function ClassSubjectsModal({ open, klass, subjects = [], teachers = [], onClose, onSaved }) {
  const f = useForm({ rows: {} });
  useEffect(() => {
    if (open && klass) {
      const rows = {};
      for (const cs of klass.classSubjects) rows[cs.subject.id] = cs.teacher?.id ?? '';
      f.setValues({ rows });
      f.setSubmitError('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, klass]);

  const rows = f.values.rows;
  const setRow = (subjectId, value) => {
    const next = { ...rows };
    if (value === undefined) delete next[subjectId];
    else next[subjectId] = value;
    f.setValue('rows', next);
  };

  const teacherOptions = (subjectId) => {
    const qualified = teachers.filter((t) => t.subjects?.some((s) => s.subject.id === subjectId));
    const others = teachers.filter((t) => !qualified.includes(t));
    const current = klass?.classSubjects.find((cs) => cs.subject.id === subjectId)?.teacher;
    const opts = [
      ...qualified.map((t) => ({ value: t.id, label: `${t.fullName} ★` })),
      ...others.map((t) => ({ value: t.id, label: t.fullName })),
    ];
    if (current && !opts.some((o) => o.value === current.id)) opts.unshift({ value: current.id, label: `${current.fullName} (inactive)` });
    return opts;
  };

  const onSubmit = f.submit(null, async () => {
    try {
      const payload = Object.entries(rows).map(([subjectId, teacherId]) => ({ subjectId, teacherId: teacherId || null }));
      onSaved(await academicService.setClassSubjects(klass.id, payload));
    } catch (err) {
      f.handleApiError(err);
    }
  });

  return (
    <ModalForm
      id="class-subjects-form"
      open={open}
      onClose={onClose}
      title={`Subjects for ${klass?.name ?? ''}`}
      description="Tick the subjects taught in this class and choose who teaches each. ★ marks teachers qualified for the subject."
      submitting={f.submitting}
      submitLabel="Save subjects"
      submitError={f.submitError}
      onSubmit={onSubmit}
    >
      {subjects.length === 0 ? (
        <Alert type="info">Create subjects first (Academics → Subjects).</Alert>
      ) : (
        <ul className="divide-y divide-slate-100">
          {subjects.map((s) => {
            const on = s.id in rows;
            return (
              <li key={s.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <CheckboxField label={`${s.name} (${s.code})`} checked={on} onChange={(v) => setRow(s.id, v ? '' : undefined)} />
                {on && (
                  <select
                    className="input sm:w-60"
                    value={rows[s.id]}
                    onChange={(e) => setRow(s.id, e.target.value)}
                    aria-label={`Teacher for ${s.name}`}
                  >
                    <option value="">No teacher yet</option>
                    {teacherOptions(s.id).map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </ModalForm>
  );
}
