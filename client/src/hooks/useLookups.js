import { academicService, teacherService } from '../services/school.service';
import { useAsync } from './useAsync';

/** Classes (with sections) for a year — defaults to the active year. */
export function useClasses(academicYearId) {
  return useAsync(() => academicService.listClasses(academicYearId), [academicYearId]);
}

export function useSubjects() {
  return useAsync(() => academicService.listSubjects(), []);
}

export function useActiveTeachers() {
  return useAsync(() => teacherService.list({ status: 'ACTIVE', limit: 100 }).then((r) => r.items), []);
}

export function useAcademicYears() {
  return useAsync(() => academicService.listYears(), []);
}
