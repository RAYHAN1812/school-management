import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { Spinner } from '../components/common/ui';
import AppLayout from '../components/layout/AppLayout';
import LoginPage from '../pages/auth/LoginPage';
import { NotFoundPage, UnauthorizedPage } from '../pages/StatusPages';
import { ADMIN_ROLES, ROLES } from '../utils/roles';
import { ProtectedRoute, PublicHomeRoute, PublicOnlyRoute } from './guards';

// Each area is its own chunk, so e.g. students never download the admin charts.
const AdminDashboard = lazy(() => import('../pages/admin/AdminDashboard'));
const UsersPage = lazy(() => import('../pages/admin/UsersPage'));
const AuditLogPage = lazy(() => import('../pages/admin/AuditLogPage'));
const TeacherDashboard = lazy(() => import('../pages/teachers/TeacherDashboard'));
// Parent & student portal pages live in one module.
const portal = () => import('../pages/portal/PortalPages');
const PortalHome = lazy(() => portal().then((m) => ({ default: m.PortalHome })));
const PortalAttendance = lazy(() => portal().then((m) => ({ default: m.PortalAttendance })));
const PortalResults = lazy(() => portal().then((m) => ({ default: m.PortalResults })));
const PortalFees = lazy(() => portal().then((m) => ({ default: m.PortalFees })));
const PortalRoutine = lazy(() => portal().then((m) => ({ default: m.PortalRoutine })));
const PaymentResultPage = lazy(() => portal().then((m) => ({ default: m.PaymentResultPage })));
const PortalLibrary = lazy(() => portal().then((m) => ({ default: m.PortalLibrary })));
const HomeworkPage = lazy(() => import('../pages/homework/HomeworkPage'));
const HomeworkDetailPage = lazy(() => import('../pages/homework/HomeworkPage').then((m) => ({ default: m.HomeworkDetailPage })));
const NoticesPage = lazy(() => import('../pages/notices/NoticesPage'));
const LibraryPage = lazy(() => import('../pages/library/LibraryPage'));
const TransportPage = lazy(() => import('../pages/transport/TransportPage'));
const ReportsPage = lazy(() => import('../pages/reports/ReportsPage'));
const ChangePasswordPage = lazy(() => import('../pages/auth/ChangePasswordPage'));
const ProfilePage = lazy(() => import('../pages/auth/ProfilePage'));
const SchoolDetailsPage = lazy(() => import('../pages/admin/SchoolDetailsPage'));
const ForgotPasswordPage = lazy(() => import('../pages/auth/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('../pages/auth/ResetPasswordPage'));
const AcademicsPage = lazy(() => import('../pages/academics/AcademicsPage'));
const ClassDetailPage = lazy(() => import('../pages/academics/ClassDetailPage'));
const StudentsPage = lazy(() => import('../pages/students/StudentsPage'));
const StudentFormPage = lazy(() => import('../pages/students/StudentFormPage'));
const StudentProfilePage = lazy(() => import('../pages/students/StudentProfilePage'));
const TeachersPage = lazy(() => import('../pages/teachers/TeachersPage'));
const TeacherFormPage = lazy(() => import('../pages/teachers/TeacherFormPage'));
const TeacherProfilePage = lazy(() => import('../pages/teachers/TeacherProfilePage'));
const AttendancePage = lazy(() => import('../pages/attendance/AttendancePage'));
const TimetablePage = lazy(() => import('../pages/timetable/TimetablePage'));
const MyTimetablePage = lazy(() => import('../pages/timetable/MyTimetablePage'));
const ExamsPage = lazy(() => import('../pages/exams/ExamsPage'));
const ExamDetailPage = lazy(() => import('../pages/exams/ExamDetailPage'));
const MarksEntryPage = lazy(() => import('../pages/exams/MarksEntryPage'));
const ReportCardPage = lazy(() => import('../pages/exams/ReportCardPage'));
const FinancePage = lazy(() => import('../pages/finance/FinancePage'));
const InvoiceDetailPage = lazy(() => import('../pages/finance/InvoiceDetailPage'));
const ReceiptPage = lazy(() => import('../pages/finance/ReceiptPage'));

export default function AppRoutes() {
  return (
    <Suspense fallback={<Spinner />}>
      <Routes>
        <Route path="/" element={<PublicHomeRoute />} />

        <Route element={<PublicOnlyRoute />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
        </Route>

        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route element={<ProtectedRoute roles={ADMIN_ROLES} />}>
              <Route path="/admin" element={<AdminDashboard />} />
              <Route path="/admin/users" element={<UsersPage />} />
              <Route path="/admin/audit-logs" element={<AuditLogPage />} />
              <Route path="/admin/academics" element={<AcademicsPage />} />
              <Route path="/admin/classes/:id" element={<ClassDetailPage />} />
              <Route path="/admin/students" element={<StudentsPage />} />
              <Route path="/admin/students/new" element={<StudentFormPage />} />
              <Route path="/admin/students/:id" element={<StudentProfilePage />} />
              <Route path="/admin/students/:id/edit" element={<StudentFormPage />} />
              <Route path="/admin/teachers" element={<TeachersPage />} />
              <Route path="/admin/teachers/new" element={<TeacherFormPage />} />
              <Route path="/admin/teachers/:id" element={<TeacherProfilePage />} />
              <Route path="/admin/teachers/:id/edit" element={<TeacherFormPage />} />
              <Route path="/admin/attendance" element={<AttendancePage />} />
              <Route path="/admin/timetable" element={<TimetablePage />} />
              <Route path="/admin/exams" element={<ExamsPage />} />
              <Route path="/admin/exams/:id" element={<ExamDetailPage />} />
              <Route path="/admin/exams/:id/marks/:subjectId" element={<MarksEntryPage />} />
              <Route path="/admin/exams/:id/report-card/:studentId" element={<ReportCardPage />} />
              <Route path="/admin/finance" element={<FinancePage />} />
              <Route path="/admin/finance/invoices/:id" element={<InvoiceDetailPage />} />
              <Route path="/admin/finance/receipts/:id" element={<ReceiptPage />} />
              <Route path="/admin/homework" element={<HomeworkPage />} />
              <Route path="/admin/homework/:id" element={<HomeworkDetailPage />} />
              <Route path="/admin/notices" element={<NoticesPage />} />
              <Route path="/admin/library" element={<LibraryPage />} />
              <Route path="/admin/transport" element={<TransportPage />} />
              <Route path="/admin/reports" element={<ReportsPage />} />
            </Route>
            <Route element={<ProtectedRoute roles={[ROLES.TEACHER]} />}>
              <Route path="/teacher" element={<TeacherDashboard />} />
              <Route path="/teacher/students" element={<StudentsPage readOnly basePath="/teacher/students" />} />
              <Route path="/teacher/students/:id" element={<StudentProfilePage readOnly basePath="/teacher/students" />} />
              <Route path="/teacher/attendance" element={<AttendancePage />} />
              <Route path="/teacher/timetable" element={<MyTimetablePage />} />
              <Route path="/teacher/exams" element={<ExamsPage />} />
              <Route path="/teacher/exams/:id" element={<ExamDetailPage />} />
              <Route path="/teacher/exams/:id/marks/:subjectId" element={<MarksEntryPage />} />
              <Route path="/teacher/exams/:id/report-card/:studentId" element={<ReportCardPage />} />
              <Route path="/teacher/homework" element={<HomeworkPage />} />
              <Route path="/teacher/homework/:id" element={<HomeworkDetailPage />} />
              <Route path="/teacher/notices" element={<NoticesPage />} />
              <Route path="/teacher/reports" element={<ReportsPage />} />
            </Route>
            {['student', 'parent'].map((area) => (
              <Route key={area} element={<ProtectedRoute roles={[area === 'student' ? ROLES.STUDENT : ROLES.PARENT]} />}>
                <Route path={`/${area}`} element={<PortalHome />} />
                <Route path={`/${area}/attendance`} element={<PortalAttendance />} />
                <Route path={`/${area}/results`} element={<PortalResults />} />
                <Route path={`/${area}/results/:id/:studentId`} element={<ReportCardPage />} />
                <Route path={`/${area}/timetable`} element={<PortalRoutine />} />
                <Route path={`/${area}/fees`} element={<PortalFees />} />
                <Route path={`/${area}/receipts/:id`} element={<ReceiptPage />} />
                <Route path={`/${area}/homework`} element={<HomeworkPage />} />
                <Route path={`/${area}/notices`} element={<NoticesPage />} />
                <Route path={`/${area}/library`} element={<PortalLibrary />} />
              </Route>
            ))}
            <Route path="/payments/result" element={<PaymentResultPage />} />
            <Route path="/account/password" element={<ChangePasswordPage />} />
            <Route path="/account/profile" element={<ProfilePage />} />
            <Route path="/school-details" element={<SchoolDetailsPage />} />
            <Route path="/unauthorized" element={<UnauthorizedPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Route>
      </Routes>
    </Suspense>
  );
}
