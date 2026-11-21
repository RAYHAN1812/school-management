# Ratonpur Central School — রতনপুর সেন্ট্রাল স্কুল

A full-stack, multi-school School ERP. It has a React + Tailwind front end, a Node/Express REST API and PostgreSQL through Prisma. It covers admissions and people, academic structure, attendance, timetables, exams and report cards, fees and payments, homework, notices, library and transport, plus role-specific portals, dashboards and exportable reports.

> **Status:** all 10 phases are built; 239 automated API tests pass.
> It is **not deployed yet**: the deployment configuration is ready ([Deployment](#deployment)), but there are no live URLs.

**Contents:** [Features](#features) · [Tech stack](#tech-stack) · [Getting started](#getting-started) · [Environment variables](#environment-variables) · [Database](#database) · [API](#api) · [Roles](#user-roles-and-permissions) · [Demo accounts](#demo-accounts) · [Testing](#testing) · [Deployment](#deployment) · [Bonus features](#bonus-features) · [Known limitations](#known-limitations) · [AI disclosure](#ai-tool-usage-disclosure)

---

## Features

| Module | What works |
| --- | --- |
| **Authentication & roles** | Login by email or username, using an httpOnly JWT cookie (a Bearer header is also accepted).<br>Passwords: bcrypt; strength policy; change; forgot/reset with single-use 30-minute tokens.<br>Changing or resetting a password, or deactivating an account, revokes existing sessions at once.<br>5 roles, each with its own dashboard. No public sign-up: admins create accounts.<br>Audit log of logins and account events. |
| **Multi-school** | Every school-owned table carries `schoolId`.<br>School users only ever see their own school. The super admin switches schools in the header (`X-School-Id`). |
| **Students** | Admission with an auto ID (`STU-2026-0001`), guardians, auto roll number, and optional student and parent logins.<br>Profile, edit, transfer, deactivate/reactivate, link sibling guardians.<br>Search, filters, CSV export. |
| **Teachers & staff** | Auto employee ID (`EMP-0001`), qualified subjects, class and class-teacher assignments, workload.<br>Salary is admin-only. Resigned or inactive status disables the login. |
| **Academic structure** | Academic years (exactly one active), classes with sections, capacities, rooms, class teachers and subject teachers.<br>Promotion to the next year, or graduation. |
| **Attendance** | Daily sheet per section, with Present / Absent / Late / Excused and a remark.<br>Rules: no duplicates, no future dates, no dates outside the year; teachers mark only their own sections.<br>Corrections. Daily and monthly reports, with attendance % = (present + late) ÷ days marked. |
| **Timetable** | Weekly grid per section.<br>Conflict detection for teacher, room and section double-booking; break periods.<br>"My routine" for teachers, students and parents. |
| **Exams & results** | Configurable grading scale. Exams with per-subject full, pass and component marks.<br>Marks entry by the subject teacher, with absentees and range validation.<br>GPA and grade, merit rank, publish/unpublish (marks lock once published).<br>Printable report cards. |
| **Fees & payments** | Fee types and structures (monthly, termly, one-off); bulk invoice generation per class; discounts; due dates.<br>Payments: partial; atomic overpayment guard; duplicate transaction reference blocked.<br>Printable receipts (`RCPT-2026-00001`); monthly collection report.<br>SSLCommerz online payment with server-side validation (needs credentials). |
| **Parent & student portals** | One-screen overview, attendance calendar, results and report cards, fees and receipts, routine, library loans, transport.<br>Parents switch between linked children; any other student returns `403`. |
| **Homework** | Assignments with attachments and due dates.<br>Student submissions: late submissions are flagged, with optional resubmission.<br>Teacher grading with feedback; a roster of who has and hasn't submitted. |
| **Notices** | Audience targeting (everyone, a role, or a class), pinning, expiry, attachments, read tracking. |
| **Library** | Catalogue with stock. Issue and return: 14-day loans, at most 3 books, a fine of 5/day.<br>Overdue list; each student's loans. |
| **Transport** | Buses, routes and stops; student assignment with bus capacity enforced; driver details shown to parents. |
| **Dashboards** | Admin: KPIs, today's attendance, fee collection, 14-day attendance and 6-month collection charts, upcoming exams, recent admissions, notices.<br>Teacher: today's periods, attendance still to take, submissions to grade. |
| **Reports** | 8 reports: admissions, class list, attendance, exam results, fee collection, outstanding dues, teacher workload, library.<br>Each opens on screen and exports to **Excel (.xlsx), PDF or CSV**. |
| **Uploads** | Attachments up to 5 MB (PDF / JPG / PNG / WEBP / DOCX / XLSX).<br>Checked by extension, MIME type and file signature; stored under random names; downloads are limited to the uploader, admins and audiences authorized for the attached homework, submission or notice. |

Teachers see only assigned class rosters and their own timetable entries. Student-specific fee records are limited to admins, the student and linked parents; teacher student overviews omit financial values.

Every business rule in the spec's "expected results" tables is enforced and tested. Examples: duplicate IDs, capacity, timetable conflicts, marks above full marks, publishing incomplete results, overpayment, a parent opening another child, out-of-stock books, and late or duplicate homework. See [docs/TESTING.md](docs/TESTING.md).

## Tech stack

- **Client:** React 18, React Router 6, Tailwind CSS 3, Axios, Recharts, lucide-react, Vite 5.
- **Server:** Node.js 20+ (ESM), Express 4, Prisma 5, Zod, bcryptjs, jsonwebtoken, Helmet, express-rate-limit, Multer, ExcelJS, PDFKit.
- **Database:** PostgreSQL 17.
- **Tests:** Vitest + Supertest against a real PostgreSQL test database.
- **Ops:**
  - Docker Compose (db + api + nginx-served client)
  - GitHub Actions CI
  - Render blueprint (API)
  - Vercel config (client)

```
school-management-system/
├── client/src/        components/ (ui kit, forms, layout) · context/ · hooks/ · pages/ (one folder per module) · routes/ · services/
├── server/
│   ├── prisma/        schema.prisma · migrations/ · seed.js
│   ├── scripts/       local-db.js (Docker-free PostgreSQL)
│   ├── src/           config/ · middleware/ · routes/ · controllers/ · services/ · validators/ · utils/
│   └── tests/         14 test files
├── docs/              API.md · TESTING.md
├── docker-compose.yml · render.yaml · .github/workflows/ci.yml
```

## Getting started

**Prerequisites:** Node.js 20+. Docker is optional.

```bash
npm install                          # client + server (npm workspaces)
cp server/.env.example server/.env
```

**1. Start PostgreSQL** with either option. Both use `sms` / `sms_dev_password` and create the `sms` and `sms_test` databases.

```bash
npm run db:up        # A: Docker (postgres:17)
npm run db:local     # B: no Docker — embedded PostgreSQL; leave this terminal open
```

**2. Create the schema and demo data**

```bash
npm run db:migrate   # prisma migrate dev (use `npx prisma migrate deploy` in server/ for production)
npm run db:seed
```

**3. Run**

```bash
npm run dev:server   # http://localhost:5000/api
npm run dev:client   # http://localhost:5173 (proxies /api to the server)
```

**Everything in Docker:** `docker compose up --build` serves the app on <http://localhost:8080>. The API container applies migrations on start and seeds demo data when `RUN_SEED=true`. Set real secrets in a root `.env` first (see `.env.example`).

## Environment variables

Server (`server/.env`). The server refuses to start if a required value is missing or invalid.

| Variable | Purpose | Default |
| --- | --- | --- |
| `DATABASE_URL` | PostgreSQL connection string (add `?sslmode=require` for Neon) | required |
| `JWT_SECRET` | Token signing secret, at least 32 characters (`openssl rand -hex 32`) | required |
| `JWT_EXPIRES_IN` | Session length (`30m`, `12h`, `1d`) | `1d` |
| `CLIENT_URL` | Allowed CORS origin(s), comma-separated. The first one is used in reset links and payment redirects. | `http://localhost:5173` |
| `COOKIE_SECURE` / `COOKIE_SAMESITE` | Cookie flags. Set `COOKIE_SECURE=true` behind HTTPS. | `false` / `lax` |
| `BCRYPT_ROUNDS` | bcrypt cost | `12` |
| `PORT` | API port | `5000` |
| `UPLOAD_DIR` | Folder for uploaded attachments | `src/uploads` |
| `API_PUBLIC_URL` | Public API origin; SSLCommerz callbacks use it | — |
| `SSLCOMMERZ_STORE_ID` / `SSLCOMMERZ_STORE_PASSWORD` / `SSLCOMMERZ_SANDBOX` | Online payments (optional; "Pay online" is hidden without them) | — / — / `true` |

Client (optional):
- `VITE_API_URL` (default `/api`).
- `VITE_SHOW_DEMO_ACCOUNTS=false` hides the demo-login buttons on the sign-in page.

## Database

`server/prisma/schema.prisma` defines 37 tables (snake_case names):
- **Accounts:** users, roles, password_reset_tokens, schools, audit_logs, id_sequences.
- **People:** students, guardians, student_guardians, teachers, teacher_subjects, staff.
- **Academics:** academic_years, classes, sections, subjects, class_subjects, enrollments, attendance, timetables.
- **Exams:** exams, exam_subjects, marks, grade_scales.
- **Fees:** fee_types, fee_structures, invoices, payments.
- **Campus:** assignments, submissions, notices, notice_reads, books, book_issues, buses, transport_routes, transport_assignments.

Integrity rules enforced by the database:
- Roll number is unique per section.
- One enrolment per student per academic year.
- One attendance record per student per day.
- One mark per student per exam subject.
- Transaction references are unique per school.
- Human-readable IDs come from atomic per-school counters (`id_sequences`), so concurrent admissions never collide.

Money is `DECIMAL` (handled as integer paisa in code), never floats.

Useful commands, run from `server/`:
- `npx prisma studio`
- `npx prisma migrate dev --name <change>`
- `npm run db:reset` (drops all data)

**Backups.** On Neon, point-in-time restore is built in; create a branch to restore to any moment in the retention window. For any PostgreSQL:

```bash
pg_dump "$DATABASE_URL" -Fc -f edumanage-$(date +%F).dump     # backup
pg_restore --clean --no-owner -d "$DATABASE_URL" edumanage-YYYY-MM-DD.dump   # restore
```

Uploaded files live in `UPLOAD_DIR`; back that folder up too, or the Docker `uploads` volume.

## API

Base URL `/api`, 138 endpoints. **Full reference: [docs/API.md](docs/API.md).**

- **Responses:** `{ success: true, data, meta? }` or `{ success: false, error: { code, message, details? } }`. Error codes are stable strings such as `DUPLICATE_STUDENT_ID` or `OVERPAYMENT_NOT_ALLOWED`.
- **Authentication:** the httpOnly cookie, or `Authorization: Bearer <token>`.
- **CSRF:** cookie-authenticated writes must send `X-Requested-With: XMLHttpRequest`; the web client always does.
- **Inputs:** every input is validated with Zod.
- **Rate limits:** the authentication endpoints are rate-limited.

## User roles and permissions

| Role | Access |
| --- | --- |
| **Super Admin** | Everything in every school (picks a school in the header); creates schools and any account. |
| **School Admin** | Everything in their own school: people, academic structure, attendance, timetable, exams and publishing, fees and payments, library, transport, notices, reports, accounts, audit log. |
| **Teacher** | Their own sections and classes only: mark and correct attendance, enter marks for subjects they teach, view results and the timetable.<br>Homework (create, grade) and notices.<br>Attendance and exam reports. No salaries, fees or other teachers' classes. |
| **Student** | Own dashboard, attendance, published results and report cards, fees and receipts, routine, homework (submit), notices, library loans, transport. |
| **Parent** | The same views for each linked child (child switcher); can pay online when enabled. Any other student returns `403`. |

The API enforces every rule; the UI only hides what a role can't use.

## Demo accounts

The seed creates demo accounts only when `DEMO_PASSWORD` is set to a strong value. Set it privately before running `npm run db:seed`; never commit or reuse it in production.

| Role | Email | Username |
| --- | --- | --- |
| Super Admin | superadmin@edumanage.test | `superadmin` |
| School Admin | admin@edumanage.test | `schooladmin` |
| Teacher | teacher@edumanage.test | `teacher` |
| Student | student@edumanage.test | `student` |
| Parent | parent@edumanage.test | `parent` |

The seed builds a working demo school: **Ratonpur Central School** (`রাতনপুর সেন্ট্রাল স্কুল`) with classes from Play Group through Class 10.

**People and classes**
- Academic year 2026 (active): Class 6 A/B and Class 7 A.
- Upcoming year 2027: Class 7 A/B, for trying promotion.
- 2 teachers, an accountant and a driver.
- 8 students with guardians. The demo student is the demo parent's child.

**Activity**
- Timetables, and the last 14 days of attendance.
- A published First Term exam with marks, and a Midterm exam with no marks yet.
- Two months of invoices, plus partial and full payments.
- Notices, two homework assignments with submissions, library books with an overdue loan, and a bus route.

## Testing

```bash
npm test             # from the repo root; needs PostgreSQL running (option A or B)
```

The setup rebuilds a separate `sms_test` database from the migrations and seeds it. It refuses to touch a database whose name doesn't contain `test`. The suite has **239 tests in 15 files**:
- Unit tests for grading, attendance, fee and fine calculations, and the password policy.
- API tests for every module, including the role and tenant boundaries.
- Security tests: CSRF, mass assignment, upload spoofing, CSV formula injection, and cross-school access.

[docs/TESTING.md](docs/TESTING.md) covers:
- How each test type in the spec, its 10 example cases and its "expected results" tables map to test files.
- The manual browser checks that were done.
- Bugs found and fixed.
- Known gaps.

CI (`.github/workflows/ci.yml`) runs the tests and the client build on every push and pull request.

## Deployment

Recommended free-tier setup: **Neon** (PostgreSQL) + **Render** (API) + **Vercel** (client).

1. **Database (Neon):** create a project and copy the pooled connection string (with `?sslmode=require`).
2. **API (Render):** use **New → Blueprint** with this repository; `render.yaml` defines the service.
   - Root directory: `server`.
   - Every deploy runs `prisma migrate deploy`.
   - `/api/health` is the health check.
   - `JWT_SECRET` is generated automatically.
   - In the dashboard, set `DATABASE_URL`, `CLIENT_URL` (your Vercel URL) and `API_PUBLIC_URL` (your Render URL).
   - Do not seed demo data in production. For a separate demo database, set a private `DEMO_PASSWORD` before running `node prisma/seed.js`.
3. **Client (Vercel):** import the repository with root directory `client`.
   - First edit `client/vercel.json` and replace `YOUR-RENDER-SERVICE` with your Render hostname.
   - Vercel then proxies `/api/*` to Render. The auth cookie stays first-party, so no CORS or third-party-cookie setup is needed.
   - `vercel.json` also sets security headers and a Content-Security-Policy.
4. **Online payments (optional):** add the SSLCommerz sandbox store ID and password on Render.

**Alternative:** run `docker compose up --build` on any VM, behind an HTTPS reverse proxy, with `COOKIE_SECURE=true`.

**Live links:** not deployed yet. Add the Vercel and Render URLs here once deployed.

## Bonus features

| Bonus | Status |
| --- | --- |
| Docker Compose | ✅ db + API + nginx client, with health check, migrations on start and an uploads volume |
| CI pipeline | ✅ GitHub Actions: tests + build |
| Online payment gateway | ✅ SSLCommerz, with server-side validation (sandbox credentials needed to try it) |
| PDF / Excel export | ✅ All 8 reports; printable report cards and receipts |
| File uploads | ✅ Homework and notice attachments |
| Multi-school (SaaS) | ✅ Tenant isolation with a super-admin school switcher |
| Email / SMS notifications | ❌ Not implemented: no provider wired up |
| Bangla / multi-language UI | ❌ Not implemented |
| Mobile app / PWA | ❌ Responsive web only |
| Biometric / QR attendance | ❌ Not implemented |

## Known limitations

- **No email or SMS delivery.** Password-reset links are written to the server log. Outside production, the API also returns the link and the UI shows it.
- **Online payments need real SSLCommerz credentials** and a public `API_PUBLIC_URL`. Without them, "Pay online" is hidden and fees are recorded at the office.
- **Uploads are stored on local disk.** On Render's free tier the disk is ephemeral, so attachments disappear on redeploy. Use a persistent disk or move to object storage (S3 or Cloudinary) for production.
- **Uploaded files are not school-scoped.** Any signed-in user who knows a file's random 128-bit name can download it.
- **PDF exports use a Latin font**, so Bangla text does not render in PDFs. Excel and CSV are fine.
- **No end-to-end browser tests.** UI flows were checked manually in a browser; the 239 automated tests cover the API.
- **Logging out clears only this browser's cookie.** To sign out everywhere, change the password.
- **Student photos are a URL field.** There is no bulk import from spreadsheets.
- **The Docker images were not built on the development machine** (Docker Desktop was unavailable there). CI builds and tests the code without Docker.
- **Not deployed yet.**

## AI tool usage disclosure

This project was built with the help of **Claude (Anthropic)**, an AI coding assistant, working from the written specification, phase by phase. The assistant wrote most of the code, tests and documentation, ran the test suite, and checked each phase in a browser. All code should be reviewed, tested and understood by the developer submitting it. The developer is responsible for the final submission.
