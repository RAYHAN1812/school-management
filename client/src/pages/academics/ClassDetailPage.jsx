import { ArrowLeft, GraduationCap, Pencil, Plus, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Badge, Button, Card, EmptyState, LifecycleBadge, LoadError, PageHeader, Spinner } from '../../components/common/ui';
import { useAsync } from '../../hooks/useAsync';
import { useToast } from '../../hooks/useAuth';
import { academicService, teacherService } from '../../services/school.service';
import { ClassModal, ClassSubjectsModal, SectionModal } from './AcademicModals';
import PromoteModal from './PromoteModal';

export default function ClassDetailPage() {
  const { id } = useParams();
  const toast = useToast();
  const klass = useAsync(() => academicService.getClass(id), [id]);
  const [sectionFilter, setSectionFilter] = useState('');
  const students = useAsync(() => academicService.classStudents(id, sectionFilter || undefined), [id, sectionFilter]);
  const teachers = useAsync(() => teacherService.list({ status: 'ACTIVE', limit: 100 }).then((r) => r.items), []);
  const subjects = useAsync(() => academicService.listSubjects(), []);

  const [editingClass, setEditingClass] = useState(false);
  const [sectionModal, setSectionModal] = useState(null); // null | 'new' | section
  const [subjectsOpen, setSubjectsOpen] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [promoteOpen, setPromoteOpen] = useState(false);

  const rows = useMemo(() => students.data ?? [], [students.data]);
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.student.id));

  if (klass.loading && !klass.data) return <Spinner />;
  if (klass.error) return <LoadError error={klass.error} onRetry={klass.reload} />;
  const c = klass.data;

  const refresh = (updated, message) => {
    toast.success(message);
    if (updated) klass.reload();
    students.reload();
  };

  const toggle = (studentId, on) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(studentId);
      else next.delete(studentId);
      return next;
    });

  return (
    <>
      <Link to="/admin/academics" className="mb-3 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> Academics
      </Link>
      <PageHeader
        title={c.name}
        description={`Academic year ${c.academicYear.name} · ${c._count.enrollments} of ${c.capacity} places filled`}
        actions={
          <Button variant="secondary" onClick={() => setEditingClass(true)}>
            <Pencil className="h-4 w-4" /> Edit class
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card
          title="Sections"
          bodyClassName="p-0"
          actions={
            <Button size="sm" variant="secondary" onClick={() => setSectionModal('new')}>
              <Plus className="h-4 w-4" /> Add section
            </Button>
          }
        >
          <ul className="divide-y divide-slate-100">
            {c.sections.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="font-medium text-slate-900">
                    Section {s.name}
                    {s.roomNumber && <span className="font-normal text-slate-500"> · Room {s.roomNumber}</span>}
                  </p>
                  <p className="truncate text-sm text-slate-500">
                    {s.classTeacher ? (
                      <>
                        Class teacher: {s.classTeacher.fullName}
                        {s.classTeacher.status !== 'ACTIVE' && <span className="text-amber-700"> ({s.classTeacher.status.toLowerCase()})</span>}
                      </>
                    ) : (
                      'No class teacher'
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className="bg-slate-100 text-slate-700 ring-slate-500/20">
                    {s._count.enrollments}
                    {s.capacity ? `/${s.capacity}` : ''} students
                  </Badge>
                  <Button size="sm" variant="ghost" onClick={() => setSectionModal(s)} aria-label={`Edit section ${s.name}`}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <Card
          title="Subjects & teachers"
          bodyClassName="p-0"
          actions={
            <Button size="sm" variant="secondary" onClick={() => setSubjectsOpen(true)}>
              <Pencil className="h-4 w-4" /> Edit
            </Button>
          }
        >
          {c.classSubjects.length === 0 ? (
            <EmptyState title="No subjects assigned" description="Choose which subjects this class studies." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {c.classSubjects.map((cs) => (
                <li key={cs.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                  <span className="font-medium text-slate-800">
                    {cs.subject.name} <span className="font-mono text-xs text-slate-400">{cs.subject.code}</span>
                  </span>
                  <span className={cs.teacher ? 'text-slate-600' : 'text-amber-700'}>{cs.teacher?.fullName ?? 'Teacher not assigned'}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card
        className="mt-6"
        title="Students"
        description="Active students enrolled in this class"
        bodyClassName="p-0"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="input w-36 py-1.5"
              value={sectionFilter}
              onChange={(e) => {
                setSectionFilter(e.target.value);
                setSelected(new Set());
              }}
              aria-label="Filter by section"
            >
              <option value="">All sections</option>
              {c.sections.map((s) => (
                <option key={s.id} value={s.id}>
                  Section {s.name}
                </option>
              ))}
            </select>
            <Button size="sm" disabled={selected.size === 0} onClick={() => setPromoteOpen(true)}>
              <GraduationCap className="h-4 w-4" /> Promote{selected.size ? ` (${selected.size})` : ''}
            </Button>
          </div>
        }
      >
        {students.loading && !students.data ? (
          <Spinner />
        ) : students.error ? (
          <div className="p-4">
            <LoadError error={students.error} onRetry={students.reload} />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState icon={Users} title="No students in this class yet" />
        ) : (
          <div className="relative overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="w-10 px-5 py-3">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 text-brand-600"
                      checked={allSelected}
                      onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((r) => r.student.id)) : new Set())}
                      aria-label="Select all students"
                    />
                  </th>
                  <th scope="col" className="px-3 py-3">Roll</th>
                  <th scope="col" className="px-3 py-3">Name</th>
                  <th scope="col" className="px-3 py-3">Section</th>
                  <th scope="col" className="hidden px-3 py-3 sm:table-cell">Student ID</th>
                  <th scope="col" className="hidden px-3 py-3 md:table-cell">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((e) => (
                  <tr key={e.id} className={selected.has(e.student.id) ? 'bg-brand-50/50' : undefined}>
                    <td className="px-5 py-2.5">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300 text-brand-600"
                        checked={selected.has(e.student.id)}
                        onChange={(ev) => toggle(e.student.id, ev.target.checked)}
                        aria-label={`Select ${e.student.fullName}`}
                      />
                    </td>
                    <td className="px-3 py-2.5 tabular-nums text-slate-600">{e.rollNumber}</td>
                    <td className="px-3 py-2.5">
                      <Link to={`/admin/students/${e.student.id}`} className="font-medium text-slate-900 hover:text-brand-700">
                        {e.student.fullName}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 text-slate-600">{e.section.name}</td>
                    <td className="hidden px-3 py-2.5 font-mono text-xs text-slate-500 sm:table-cell">{e.student.studentCode}</td>
                    <td className="hidden px-3 py-2.5 md:table-cell">
                      <LifecycleBadge status={e.student.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <ClassModal
        open={editingClass}
        klass={c}
        onClose={() => setEditingClass(false)}
        onSaved={() => {
          setEditingClass(false);
          refresh(true, 'Class updated.');
        }}
      />
      <SectionModal
        open={Boolean(sectionModal)}
        classId={c.id}
        section={sectionModal === 'new' ? null : sectionModal}
        teachers={teachers.data ?? []}
        onClose={() => setSectionModal(null)}
        onSaved={() => {
          const message = sectionModal === 'new' ? 'Section added.' : 'Section updated.';
          setSectionModal(null);
          refresh(true, message);
        }}
      />
      <ClassSubjectsModal
        open={subjectsOpen}
        klass={c}
        subjects={subjects.data ?? []}
        teachers={teachers.data ?? []}
        onClose={() => setSubjectsOpen(false)}
        onSaved={() => {
          setSubjectsOpen(false);
          refresh(true, 'Subjects updated.');
        }}
      />
      <PromoteModal
        open={promoteOpen}
        klass={c}
        studentIds={[...selected]}
        onClose={() => setPromoteOpen(false)}
        onDone={(r) => {
          setPromoteOpen(false);
          setSelected(new Set());
          refresh(true, r.graduated ? `${r.graduated} students marked as graduated.` : `${r.promoted} students promoted.`);
        }}
      />
    </>
  );
}
