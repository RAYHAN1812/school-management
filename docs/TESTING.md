# Testing

Ratonpur Central School has **239 automated tests** (Vitest + Supertest) in 15 files that run against a real PostgreSQL
database, plus manual browser checks of every module.

```bash
npm run db:local        # or: npm run db:up   (Docker)
npm test                # from the repository root
```

The test setup rebuilds a separate `sms_test` database from the Prisma migrations and seeds it with the
demo data before every run. It refuses to reset any database whose name does not contain `test`.

## Test types (spec section 10)

| Testing type | What we test | Where |
| --- | --- | --- |
| **Unit** | Grade bands, GPA, merit ranking, grading-scale validation, attendance %, fee outstanding/net/status, library fines, timetable overlap, password policy, reset-token hashing | `grading.unit`, `calculations.unit`, `password.unit`, `finance.api` (fee calculations block), `campus.api` (fines) |
| **API** | Every endpoint group: status codes, error codes, response shapes | all `*.api.test.js` |
| **Integration** | Admission → enrolment → attendance → exams → results → invoices → payments flowing through the real database | `people.api`, `operations.api`, `exams.api`, `finance.api`, `portal.api` |
| **Authentication** | Login (email/username), wrong password, inactive account, expired/tampered tokens, logout, change & reset password, token revocation | `auth.api` |
| **Authorization** | 401 without a session, 403 for wrong roles, teachers limited to their classes, parents limited to their children, salary hidden from non-admins | `auth.api`, `people.api`, `operations.api`, `exams.api`, `portal.api`, `security.api` |
| **Validation** | Required fields, invalid dates, duplicates (IDs, rolls, emails, invoices, transaction refs), capacity, marks limits, file types | every API file |
| **Security** | No password hashes/token versions/salaries leak, multi-school isolation, CSRF check, security headers, payload limits, upload content sniffing, path traversal, forged payment callbacks | `security.api`, `campus.api`, `finance.api` |
| **Database integrity** | Unique constraints, one enrolment per year, one attendance record per day, atomic payments under concurrency, stock counts on issue/return | `people.api`, `operations.api`, `finance.api` ("two simultaneous full payments"), `campus.api` |
| **UI** | Forms, navigation, role-based menus, responsive layout (375 px phone, tablet, desktop), no horizontal overflow | Manual browser checks during each phase (see below) |

## The spec's example test cases

| # | Spec test case | Automated test |
| --- | --- | --- |
| 1 | Create a new student with valid information | `people.api` › *creates a student with a generated ID, next roll number and guardian* |
| 2 | Attempt to create a duplicate student ID | `people.api` › *returns 409 DUPLICATE_STUDENT_ID* |
| 3 | Assign a student to a class | `people.api` › *transfers the student to another section*; `academic.api` › promotion tests |
| 4 | Mark student attendance | `operations.api` › *saves attendance, then rejects a duplicate with 409 ATTENDANCE_ALREADY_EXISTS* |
| 5 | Attempt to enter marks above full marks | `exams.api` › *rejects marks above the maximum (MARKS_EXCEED_FULL_MARKS)* |
| 6 | Generate an invoice | `finance.api` › *generates an invoice with a sequential number…*; *bulk-generates monthly invoices* |
| 7 | Record a partial payment | `finance.api` › *no payment → Unpaid; partial → Partially Paid; full → Paid* |
| 8 | Attempt to access another student's result as a parent | `exams.api` › *blocks a parent from another student's result with 403*; `portal.api` |
| 9 | Create conflicting teacher timetables | `operations.api` › *rejects a teacher teaching two classes at once* (plus section and room clashes) |
| 10 | Generate a monthly attendance report | `operations.api` › *produces a monthly report with attendance percentages and a CSV download*; `reports.api` |

## Spec "Expected results" tables

| Module | Expected result | Covered by |
| --- | --- | --- |
| Students | Duplicate ID → `409 DUPLICATE_STUDENT_ID`; invalid class → `404 CLASS_NOT_FOUND` | `people.api` |
| Attendance | Duplicate → `409 ATTENDANCE_ALREADY_EXISTS`; update; monthly summary | `operations.api` |
| Fees | Paid / Partially Paid / Unpaid; `400 OVERPAYMENT_NOT_ALLOWED`; `409 DUPLICATE_TRANSACTION` | `finance.api` |
| Timetable | `409 TIMETABLE_CONFLICT` (section, teacher, room) | `operations.api` |
| Parent portal | Other children → `403 FORBIDDEN` | `portal.api`, `exams.api`, `operations.api`, `finance.api` |
| Online payments | Not marked paid until verified server-side | `finance.api` › *online payment* block (gateway mocked) |

Access-control regressions also cover a teacher probing an unassigned class roster/detail or timetable,
teacher access to invoice/fees/receipt routes and overview fee values, changed notice targets, and direct file
downloads by upload owners, students/parents in the attached audience, and unauthorized users. Upload ownership
and attachment references are recorded in the additive `uploaded_files` table.

## Manual browser checks performed

Run against the dev server with the seeded demo data:

- Login validation, role-based redirect, sign-out, access-denied page for a parent opening `/admin`.
- Admin: dashboard charts, account create/duplicate/deactivate, academics (classes, sections, subjects, years),
  promotion dialog, admission form (empty submit, valid admission, ID generation), profile edit, transfer,
  attendance marking and reports, routine clash warning, exam results, report card, marks entry limits,
  invoices, overpayment block, partial payment and receipt, library, transport, notices, reports preview.
- Teacher: My students (scoped), attendance taking, weekly timetable.
- Parent: dashboard, fees, results, homework, notices.
- Layout at 375 px (phone) — no horizontal scrolling; tables collapse to cards.

Bugs found by these checks and fixed: table overflow on the accounts page, UTC-vs-local "today" in forms and
payments, invoice totals ignoring the status filter, missing "create login" for existing profiles, student list
failing in a school with no active year, stale dev-server cache (environment issue).

## Known gaps

- No automated browser (end-to-end) tests yet — UI checks above are manual.
- The SSLCommerz gateway is mocked in tests; a sandbox account is needed to test against the real service.
- PDF export uses the built-in Helvetica font, which cannot render Bangla script.
