import { LoadError, PageHeader, Spinner } from '../../components/common/ui';
import WeeklyTimetable from '../../components/common/WeeklyTimetable';
import { useAsync } from '../../hooks/useAsync';
import { timetableService } from '../../services/operations.service';

/** Read-only weekly routine for the signed-in teacher or student (or a parent's child). */
export default function MyTimetablePage({ studentId, title = 'My timetable', description }) {
  const data = useAsync(() => timetableService.mine(studentId), [studentId]);
  const isTeacher = data.data?.owner?.type === 'teacher';
  return (
    <>
      <PageHeader title={title} description={description ?? (isTeacher ? 'Your teaching periods this week.' : 'Weekly class routine.')} />
      {data.loading && !data.data ? (
        <Spinner />
      ) : data.error ? (
        <LoadError error={data.error} onRetry={data.reload} />
      ) : (
        <WeeklyTimetable entries={data.data.entries} show={isTeacher ? 'class' : 'teacher'} emptyText="No routine published yet." />
      )}
    </>
  );
}
