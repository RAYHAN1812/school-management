import { Download, GraduationCap, Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Card, EmptyState, LifecycleBadge, LoadError, PageHeader, Pagination, Spinner } from '../../components/common/ui';
import { useAsync, useDebounced } from '../../hooks/useAsync';
import { useToast } from '../../hooks/useAuth';
import { useClasses } from '../../hooks/useLookups';
import { studentService } from '../../services/school.service';
import { getErrorMessage } from '../../utils/errors';
import ProfileAvatar from '../../components/common/ProfileAvatar';

/**
 * Admin: full student directory with create/export.
 * Teacher (`readOnly`): only students in the teacher's classes (the API scopes it).
 */
export default function StudentsPage({ readOnly = false, basePath = '/admin/students' }) {
  const toast = useToast();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [classId, setClassId] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [status, setStatus] = useState('ACTIVE');
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const debounced = useDebounced(search);

  const classes = useClasses();
  const filters = { search: debounced, classId, sectionId, status, page, limit: 15 };
  const list = useAsync(() => studentService.list(filters), [debounced, classId, sectionId, status, page]);

  const sections = useMemo(
    () => classes.data?.classes.find((c) => c.id === classId)?.sections ?? [],
    [classes.data, classId],
  );

  const reset = (setter) => (e) => {
    setter(e.target.value);
    setPage(1);
  };

  async function exportCsv() {
    setExporting(true);
    try {
      await studentService.exportCsv({ search: debounced, classId, sectionId, status });
    } catch (err) {
      toast.error(getErrorMessage(err, 'Export failed'));
    } finally {
      setExporting(false);
    }
  }

  const items = list.data?.items ?? [];
  const yearName = list.data?.meta?.academicYear?.name;

  return (
    <>
      <PageHeader
        title={readOnly ? 'My students' : 'Students'}
        description={
          readOnly
            ? 'Students in the classes you teach this year.'
            : `Admissions, profiles and class placement${yearName ? ` · Academic year ${yearName}` : ''}.`
        }
        actions={
          !readOnly && (
            <>
              <Button variant="secondary" onClick={exportCsv} loading={exporting}>
                <Download className="h-4 w-4" /> Export CSV
              </Button>
              <Link to={`${basePath}/new`}>
                <Button>
                  <Plus className="h-4 w-4" /> Admit student
                </Button>
              </Link>
            </>
          )
        }
      />

      <Card bodyClassName="p-0">
        <div className="grid grid-cols-1 gap-3 border-b border-slate-100 p-4 sm:grid-cols-2 lg:grid-cols-[1fr_auto_auto_auto]">
          <div className="relative sm:col-span-2 lg:col-span-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              className="input pl-9"
              placeholder="Search by name, student ID or phone"
              value={search}
              onChange={reset(setSearch)}
              aria-label="Search students"
            />
          </div>
          <select
            className="input lg:w-40"
            value={classId}
            onChange={(e) => {
              setClassId(e.target.value);
              setSectionId('');
              setPage(1);
            }}
            aria-label="Filter by class"
          >
            <option value="">All classes</option>
            {(classes.data?.classes ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select className="input lg:w-36" value={sectionId} onChange={reset(setSectionId)} disabled={!classId} aria-label="Filter by section">
            <option value="">All sections</option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                Section {s.name}
              </option>
            ))}
          </select>
          {!readOnly && (
            <select className="input lg:w-36" value={status} onChange={reset(setStatus)} aria-label="Filter by status">
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
              <option value="GRADUATED">Graduated</option>
              <option value="TRANSFERRED">Transferred out</option>
              <option value="ALL">All statuses</option>
            </select>
          )}
        </div>

        {list.error ? (
          <div className="p-4">
            <LoadError error={list.error} onRetry={list.reload} />
          </div>
        ) : list.loading && !list.data ? (
          <Spinner label="Loading students…" />
        ) : items.length === 0 ? (
          <EmptyState
            icon={GraduationCap}
            title="No students found"
            description={
              search || classId || status !== 'ACTIVE'
                ? 'Try a different search or filter.'
                : readOnly
                  ? 'You have no classes assigned this year.'
                  : 'Admit the first student to get started.'
            }
          />
        ) : (
          <>
            <div className={`relative hidden overflow-x-auto md:block ${list.loading ? 'opacity-60' : ''}`}>
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  <tr>
                    <th scope="col" className="px-5 py-3">Student</th>
                    <th scope="col" className="px-5 py-3">Class</th>
                    <th scope="col" className="px-5 py-3">Roll</th>
                    <th scope="col" className="hidden px-5 py-3 lg:table-cell">Guardian</th>
                    <th scope="col" className="px-5 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {items.map((s) => (
                    <tr key={s.id} onClick={() => navigate(`${basePath}/${s.id}`)} className="cursor-pointer hover:bg-slate-50">
                      <td className="px-5 py-3">
                         <div className="flex items-center gap-3">
                           <ProfileAvatar userId={s.user?.id} name={s.fullName} size="sm" />
                           <div>
                             <Link to={`${basePath}/${s.id}`} className="font-medium text-slate-900 hover:text-brand-700" onClick={(e) => e.stopPropagation()}>
                               {s.fullName}
                             </Link>
                             <p className="font-mono text-xs text-slate-500">{s.studentCode}</p>
                           </div>
                         </div>
                      </td>
                      <td className="px-5 py-3 text-slate-700">
                        {s.enrollment ? `${s.enrollment.class.name} · ${s.enrollment.section.name}` : <span className="text-slate-400">Not enrolled</span>}
                      </td>
                      <td className="px-5 py-3 tabular-nums text-slate-600">{s.enrollment?.rollNumber ?? '—'}</td>
                      <td className="hidden px-5 py-3 text-slate-600 lg:table-cell">
                        {s.primaryGuardian ? (
                          <>
                            {s.primaryGuardian.fullName}
                            <span className="block text-xs text-slate-400">{s.primaryGuardian.phone}</span>
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <LifecycleBadge status={s.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className={`divide-y divide-slate-100 md:hidden ${list.loading ? 'opacity-60' : ''}`}>
              {items.map((s) => (
                <li key={s.id}>
                  <Link to={`${basePath}/${s.id}`} className="flex items-center justify-between gap-3 p-4 hover:bg-slate-50">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-900">{s.fullName}</p>
                      <p className="truncate text-xs text-slate-500">
                        {s.studentCode}
                        {s.enrollment && ` · ${s.enrollment.class.name}-${s.enrollment.section.name} · Roll ${s.enrollment.rollNumber}`}
                      </p>
                    </div>
                    <LifecycleBadge status={s.status} />
                  </Link>
                </li>
              ))}
            </ul>
            <Pagination meta={list.data.meta} onPageChange={setPage} />
          </>
        )}
      </Card>
    </>
  );
}
