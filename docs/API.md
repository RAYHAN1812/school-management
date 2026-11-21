# API reference

Base URL: `/api` · JSON in, JSON out · 138 endpoints.

**Responses**: `{ "success": true, "data": …, "meta"?: { page, limit, total, totalPages, … } }` or
`{ "success": false, "error": { "code": "DUPLICATE_STUDENT_ID", "message": "…", "details"?: … } }`.

**Authentication**: the web app uses an httpOnly cookie (`sms_token`) set by `/auth/login`; API clients may send
`Authorization: Bearer <token>` instead. Cookie-authenticated writes must include `X-Requested-With: XMLHttpRequest` (CSRF check).

**School scope**: school users are pinned to their school. A super admin sends `X-School-Id: <schoolId>` on school-level endpoints.

**Pagination**: list endpoints accept `?page=&limit=` (limit ≤ 100).

Access key — **Public**: no sign-in · **Any**: any signed-in user · **Admin**: super/school admin · **Staff**: admin or teacher ·
**Owner**: admin, the student, their linked parents, and their teachers (403 otherwise).

## Auth & accounts

| Method | Endpoint | Access | Purpose |
| --- | --- | --- | --- |
| GET | `/health` | Public | Health check |
| POST | `/auth/login` | Public, rate-limited | `{ identifier, password }` (email or username) |
| POST | `/auth/logout` | Any | Clear the session cookie |
| GET | `/auth/me` | Any | Current user |
| POST | `/auth/register` | Admin | Create a login `{ fullName, email, username?, phone?, password, role, schoolId? }` |
| POST | `/auth/forgot-password` | Public, rate-limited | Always 200; emails/logs a reset link |
| POST | `/auth/reset-password` | Public, rate-limited | `{ token, password }` — single use, 30 min |
| POST | `/auth/change-password` | Any | `{ currentPassword, newPassword }` — signs out other sessions |
| GET | `/users` | Admin | `?search&role&status` |
| GET | `/users/:id` | Admin | One account |
| PATCH | `/users/:id/status` | Admin | Activate / deactivate |
| GET | `/roles` | Admin | Roles & permissions |
| GET | `/audit-logs` | Admin | `?action` |
| GET / POST | `/schools` | Super admin | List / create schools |
| GET | `/dashboard/summary` | Any | Role-specific dashboard (`?date=YYYY-MM-DD` = the user's today) |

## Academic structure

| Method | Endpoint | Access | Purpose |
| --- | --- | --- | --- |
| GET / POST | `/academic-years` | Staff / Admin | Years; one may be `ACTIVE` |
| PATCH | `/academic-years/:id` | Admin | Edit; activating completes the previous year |
| GET | `/classes` | Staff / Admin | `?academicYearId`; teachers see only assigned classes/sections |
| POST | `/classes` | Admin | Create with `sections[]`, `subjectIds[]` |
| GET | `/classes/:id` | Staff / Admin | Assigned-class detail; teachers see only assigned sections |
| PATCH | `/classes/:id` | Admin | Edit name/capacity |
| GET | `/classes/:id/students` | Staff | Assigned-class roster `?sectionId`; teachers are restricted to their assigned classes/sections |
| PUT | `/classes/:id/subjects` | Admin | `{ subjects: [{ subjectId, teacherId? }] }` |
| POST | `/classes/:id/sections` | Admin | Add a section |
| PATCH | `/sections/:id` | Admin | Edit section / class teacher |
| POST | `/classes/promote` | Admin | `{ fromClassId, studentIds[], toClassId?, toSectionId?, graduate? }` |
| GET / POST / PATCH | `/subjects`, `/subjects/:id` | Staff / Admin | Subjects |

## Students, guardians, teachers, staff

| Method | Endpoint | Access | Purpose |
| --- | --- | --- | --- |
| GET | `/students` | Staff | `?search&classId&sectionId&status&gender&academicYearId` (teachers: own classes) |
| GET | `/students/export` | Admin | CSV of the filtered list |
| POST | `/students` | Admin | Admission (profile, enrollment, guardians, optional logins) |
| GET / PATCH / DELETE | `/students/:id` | Staff / Admin / Admin | Profile · edit · deactivate |
| PUT | `/students/:id/enrollment` | Admin | Assign or transfer |
| POST / DELETE | `/students/:id/guardians[/:guardianId]` | Admin | Link / unlink guardian |
| POST | `/students/:id/account` | Admin | Create the student's login |
| GET | `/guardians` | Admin | Search guardians (siblings) |
| GET / POST | `/teachers` | Staff / Admin | Teachers (salary admin-only) |
| GET / PATCH | `/teachers/:id` | Staff / Admin | Profile · edit |
| POST | `/teachers/:id/account` | Admin | Create the teacher's login |
| GET / POST / GET / PATCH | `/staff`, `/staff/:id` | Admin | Non-teaching staff |

## Attendance & timetable

| Method | Endpoint | Access | Purpose |
| --- | --- | --- | --- |
| GET | `/attendance/sections` | Staff | Sections the user may mark |
| GET | `/attendance/sheet` | Staff | `?classId&sectionId&date` roster + saved statuses |
| POST | `/attendance` | Staff | Mark a day (409 if already taken) |
| PUT | `/attendance` | Staff | Correct a day |
| PATCH | `/attendance/:id` | Staff | Correct one record |
| GET | `/attendance` | Any (scoped) | `?studentId` or `?sectionId`, `from`, `to` |
| GET | `/attendance/reports` | Staff | `type=daily\|monthly`, `format=json\|csv` |
| GET | `/students/:id/attendance` | Owner | Summary, by month, day by day |
| GET | `/timetables` | Staff | Admins: school timetable; teachers: only their own entries (`?sectionId&teacherId&classId&dayOfWeek` filters cannot widen access) |
| GET | `/timetables/me` | Any | Own routine (parents: `?studentId`) |
| POST / PATCH / DELETE | `/timetables[/:id]` | Admin | Periods; 409 `TIMETABLE_CONFLICT` |

## Exams & results

| Method | Endpoint | Access | Purpose |
| --- | --- | --- | --- |
| GET / PUT | `/grade-scales` | Any / Admin | Configurable grading scale |
| GET / POST | `/exams` | Staff / Admin | Exams with subjects, full/pass/component marks |
| GET / PATCH | `/exams/:id` | Staff / Admin | Detail with entry progress · edit |
| GET / POST | `/exams/:id/marks` | Staff | Marks sheet `?subjectId&sectionId` · save marks (subject teacher/admin) |
| GET | `/exams/:id/results` | Staff | Merit list, GPA, summary |
| POST | `/exams/:id/publish`, `/exams/:id/unpublish` | Admin | Publish (all marks required) / unpublish |
| GET | `/exams/:id/report-card/:studentId` | Owner | Report card (published only for students/parents) |
| GET | `/students/:id/results` | Owner | Published results |

## Fees & payments

| Method | Endpoint | Access | Purpose |
| --- | --- | --- | --- |
| GET / POST / PATCH | `/fee-types[/:id]` | Admin | Fee categories |
| GET / POST / PATCH / DELETE | `/fees[/:id]` | Admin | Fee structures |
| GET / POST | `/invoices` | Admin | List (totals in meta) · create one |
| POST | `/invoices/generate` | Admin | Bulk-invoice a class |
| GET | `/invoices/:id` | Student / linked parent / Admin | Detail; teachers cannot view fees |
| PATCH | `/invoices/:id` | Admin | Discount / due date |
| POST | `/invoices/:id/cancel` | Admin | Cancel (no payments) |
| GET | `/students/:id/fees` | Student / linked parent / Admin | Invoices, payments, summary; teachers are denied |
| GET / POST | `/payments` | Admin | History · record (atomic; 400 overpayment; 409 duplicate ref) |
| GET | `/payments/reports` | Admin | Monthly collection `?month&format=csv` |
| GET | `/payments/:id/receipt` | Student / linked parent / Admin | Receipt; teachers are denied |
| POST | `/payments/online/init` | Admin, parent, student | Start SSLCommerz checkout |
| POST | `/payments/online/ipn`, `/payments/online/return/:result` | Gateway | Callbacks — verified server-side before crediting |

## Portals, homework, notices, library, transport, files

| Method | Endpoint | Access | Purpose |
| --- | --- | --- | --- |
| GET | `/portal/students` | Parent, student | Children / self |
| GET | `/students/:id/overview` | Student / linked parent / assigned teacher / Admin | One-screen summary; teacher responses omit fee values |
| POST | `/uploads` | Signed-in school user | Multipart `file` (PDF/JPG/PNG/WEBP/DOCX/XLSX ≤ 5 MB) |
| GET | `/files/:name` | Uploader / Admin / authorized record audience | Download only if you uploaded the file or can access its attached homework, submission, or notice |
| GET / POST | `/assignments` | Any (scoped) / Staff | Homework list · create |
| GET / PATCH / DELETE | `/assignments/:id` | Scoped / Owner teacher | Detail · edit · delete |
| GET | `/assignments/:id/submissions` | Owner teacher | Roster with submissions |
| POST | `/assignments/:id/submissions` | Student | Hand in (late flagged; one version unless resubmission allowed) |
| PATCH | `/submissions/:id/grade` | Owner teacher | Marks & feedback |
| GET / POST | `/notices` | Any / Staff | Board (`?manage=true` to manage) · create; target edits revalidate the merged audience and class/section |
| GET / PATCH / DELETE | `/notices/:id` | Any / Author or admin | Read · edit · delete |
| POST | `/notices/:id/read` | Any | Mark as read |
| GET / POST / PATCH | `/books[/:id]` | Any / Admin | Catalogue |
| POST | `/books/:id/issue`, `/books/:id/return` | Admin | Issue (stock-checked) / return (fines) |
| GET | `/book-issues`, `/library/stats` | Admin | Loans · stats |
| GET | `/students/:id/library` | Owner | A student's loans |
| GET / POST / PATCH | `/buses[/:id]` | Admin | Buses |
| GET / POST / GET / PATCH | `/transport-routes[/:id]` | Admin | Routes |
| POST | `/transport-routes/:id/students` | Admin | Assign (bus capacity enforced) |
| DELETE | `/transport-assignments/:studentId` | Admin | Unassign |
| GET | `/students/:id/transport` | Owner | Route, bus, driver |

## Reports

| Method | Endpoint | Access | Purpose |
| --- | --- | --- | --- |
| GET | `/reports` | Staff | Report types available to the user |
| GET | `/reports/:type` | Admin (teachers: `attendance`, `exam`) | `format=json\|xlsx\|pdf\|csv`; filters `from, to, month, classId, sectionId, examId` |

Report types: `admissions`, `class-students`, `attendance`, `exam`, `fee-collection`, `outstanding`, `teacher-workload`, `library`.

## Error codes

| Status | Codes |
| --- | --- |
| 400 | `VALIDATION_ERROR`, `INVALID_JSON`, `INVALID_CURRENT_PASSWORD`, `INVALID_RESET_TOKEN`, `SCHOOL_REQUIRED`, `CANNOT_CHANGE_OWN_STATUS`, `EMAIL_REQUIRED`, `GUARDIAN_REQUIRED`, `INVALID_STUDENTS`, `SAME_ACADEMIC_YEAR`, `DATE_OUTSIDE_ACADEMIC_YEAR`, `STUDENT_NOT_IN_SECTION`, `SUBJECT_NOT_IN_CLASS`, `MARKS_EXCEED_FULL_MARKS`, `MARKS_REQUIRED`, `RESULTS_INCOMPLETE`, `INVALID_GRADE_SCALE`, `OVERPAYMENT_NOT_ALLOWED`, `INVALID_DISCOUNT`, `BILLING_PERIOD_REQUIRED`, `NOT_ISSUED_TO_STUDENT`, `INVALID_FILE_TYPE`, `SUBMISSION_EMPTY`, `INVALID_PICKUP_POINT` |
| 401 | `UNAUTHORIZED`, `INVALID_CREDENTIALS`, `ACCOUNT_INACTIVE` (revoked session) |
| 403 | `FORBIDDEN`, `ROLE_NOT_ALLOWED`, `ACCOUNT_INACTIVE` (login), `RESULTS_PUBLISHED`, `NOT_YOUR_CLASS`, `CSRF_CHECK_FAILED` |
| 404 | `*_NOT_FOUND` (e.g. `CLASS_NOT_FOUND`, `STUDENT_NOT_FOUND`, `RESULT_NOT_PUBLISHED`), `ROUTE_NOT_FOUND` |
| 409 | `DUPLICATE_*` (student ID, roll number, employee ID, class, section, subject code, exam, invoice, fee structure, book, bus, route, transaction), `EMAIL_ALREADY_EXISTS`, `USERNAME_ALREADY_EXISTS`, `ATTENDANCE_ALREADY_EXISTS`, `TIMETABLE_CONFLICT`, `CLASS_CAPACITY_EXCEEDED`, `SECTION_CAPACITY_EXCEEDED`, `TEACHER_INACTIVE`, `ALREADY_ENROLLED`, `ALREADY_SUBMITTED`, `NO_COPIES_AVAILABLE`, `BORROW_LIMIT_REACHED`, `BUS_FULL`, `ACCOUNT_EXISTS` |
| 413 | `PAYLOAD_TOO_LARGE`, `FILE_TOO_LARGE` |
| 429 | `TOO_MANY_REQUESTS` |
| 503 | `PAYMENT_GATEWAY_NOT_CONFIGURED` |
