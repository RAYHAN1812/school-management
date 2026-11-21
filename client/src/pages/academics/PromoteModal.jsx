import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Modal } from '../../components/common/ui';
import { CheckboxField, SelectField } from '../../components/forms/fields';
import { getErrorMessage } from '../../utils/errors';
import { academicService } from '../../services/school.service';

/**
 * Promote the selected students of `klass` into a class of a later academic
 * year, or graduate them. Defaults to keeping each student's section letter.
 */
export default function PromoteModal({ open, klass, studentIds, onClose, onDone }) {
  const [years, setYears] = useState([]);
  const [targetYearId, setTargetYearId] = useState('');
  const [targetClasses, setTargetClasses] = useState([]);
  const [toClassId, setToClassId] = useState('');
  const [toSectionId, setToSectionId] = useState('');
  const [graduate, setGraduate] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError('');
    setGraduate(false);
    setToClassId('');
    setToSectionId('');
    academicService.listYears().then((all) => {
      // Only years that start after this class's year.
      const later = all
        .filter((y) => new Date(y.startDate) > new Date(klass.academicYear.startDate))
        .sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
      setYears(later);
      setTargetYearId(later[0]?.id ?? '');
    });
  }, [open, klass]);

  useEffect(() => {
    if (!targetYearId) {
      setTargetClasses([]);
      return;
    }
    academicService.listClasses(targetYearId).then(({ classes }) => {
      setTargetClasses(classes);
      // Suggest the next class level.
      const next = classes.find((c) => klass.numericLevel != null && c.numericLevel === klass.numericLevel + 1);
      setToClassId(next?.id ?? '');
      setToSectionId('');
    });
  }, [targetYearId, klass]);

  const targetClass = useMemo(() => targetClasses.find((c) => c.id === toClassId), [targetClasses, toClassId]);

  async function submit() {
    setSubmitting(true);
    setError('');
    try {
      const result = await academicService.promote({
        fromClassId: klass.id,
        studentIds,
        ...(graduate ? { graduate: true } : { toClassId, ...(toSectionId ? { toSectionId } : {}) }),
      });
      onDone(result);
    } catch (err) {
      const details = err.response?.data?.error?.details?.students;
      setError(details ? `${getErrorMessage(err)}: ${details.join(', ')}` : getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = graduate || Boolean(toClassId);

  return (
    <Modal
      open={open}
      onClose={submitting ? undefined : onClose}
      title={`Promote ${studentIds.length} student${studentIds.length === 1 ? '' : 's'}`}
      description={`From ${klass?.name} (${klass?.academicYear.name}). Their current enrollment is kept as history.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} loading={submitting} disabled={!canSubmit}>
            {graduate ? 'Mark as graduated' : 'Promote'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert type="error">{error}</Alert>}
        <CheckboxField
          label="Graduate instead"
          description="For the final class: marks the students as graduated rather than moving them to a new class."
          checked={graduate}
          onChange={setGraduate}
        />
        {!graduate && (
          <>
            {years.length === 0 ? (
              <Alert type="info">
                There is no later academic year yet. Create one under Academics → Academic years, and add its classes.
              </Alert>
            ) : (
              <>
                <SelectField
                  label="Into academic year"
                  value={targetYearId}
                  onChange={(e) => setTargetYearId(e.target.value)}
                  options={years.map((y) => ({ value: y.id, label: `${y.name} (${y.status.toLowerCase()})` }))}
                />
                <SelectField
                  label="Into class"
                  value={toClassId}
                  onChange={(e) => {
                    setToClassId(e.target.value);
                    setToSectionId('');
                  }}
                  placeholder={targetClasses.length ? 'Select a class' : 'No classes in that year yet'}
                  options={targetClasses.map((c) => ({ value: c.id, label: c.name }))}
                />
                {targetClass && (
                  <SelectField
                    label="Into section"
                    value={toSectionId}
                    onChange={(e) => setToSectionId(e.target.value)}
                    placeholder="Same section letter as now"
                    options={targetClass.sections.map((s) => ({ value: s.id, label: `Section ${s.name}` }))}
                    hint="Roll numbers are assigned after the students already in the section."
                  />
                )}
              </>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
