// Pure business formulas from the spec — no I/O, unit-tested directly.

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Attendance % = Present Days / Total School Days × 100.
 * A late arrival still counts as present. Leave and absence don't.
 * Total school days = days attendance was taken for the student.
 */
export function attendancePercentage({ present = 0, late = 0, absent = 0, leave = 0 }) {
  const total = present + late + absent + leave;
  if (total === 0) return null; // no school days yet — not 0%
  return round2(((present + late) / total) * 100);
}

export function countStatuses(records) {
  const counts = { present: 0, absent: 0, late: 0, leave: 0 };
  for (const r of records) counts[r.status.toLowerCase()] += 1;
  return { ...counts, total: records.length, percentage: attendancePercentage(counts) };
}

/** "HH:MM" (24h) ↔ minutes after midnight. */
export function timeToMinutes(hhmm) {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function minutesToTime(minutes) {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/** Half-open intervals [start, end) overlap. Back-to-back periods don't. */
export const overlaps = (a, b) => a.start < b.end && b.start < a.end;

// ───────────────────────── Grading ─────────────────────────

/** Default scale from the spec; schools can change theirs (grade_scales table). */
export const DEFAULT_GRADE_SCALE = [
  { grade: 'A+', minPercent: 80, maxPercent: 100, gradePoint: 5 },
  { grade: 'A', minPercent: 70, maxPercent: 79.99, gradePoint: 4 },
  { grade: 'A-', minPercent: 60, maxPercent: 69.99, gradePoint: 3.5 },
  { grade: 'B', minPercent: 50, maxPercent: 59.99, gradePoint: 3 },
  { grade: 'C', minPercent: 40, maxPercent: 49.99, gradePoint: 2 },
  { grade: 'D', minPercent: 33, maxPercent: 39.99, gradePoint: 1 },
  { grade: 'F', minPercent: 0, maxPercent: 32.99, gradePoint: 0 },
];

const num = (v) => (v == null ? null : Number(v));
const normaliseScale = (scale) =>
  scale.map((s) => ({ ...s, minPercent: num(s.minPercent), maxPercent: num(s.maxPercent), gradePoint: num(s.gradePoint) })).sort((a, b) => b.minPercent - a.minPercent);

/**
 * Letter grade for a percentage: the highest band whose minimum it reaches.
 * (Using only the minimum means 79.995% can't fall into a gap between bands.)
 */
export function gradeFor(percentage, scale = DEFAULT_GRADE_SCALE) {
  const bands = normaliseScale(scale);
  return bands.find((b) => percentage >= b.minPercent) ?? bands[bands.length - 1];
}

/** Overall letter for a GPA: the band with the highest grade point not above it. */
export function letterForGpa(gpa, scale = DEFAULT_GRADE_SCALE) {
  const bands = normaliseScale(scale).sort((a, b) => b.gradePoint - a.gradePoint);
  return (bands.find((b) => gpa >= b.gradePoint) ?? bands[bands.length - 1]).grade;
}

/**
 * One student's result in one subject.
 * Total = written + MCQ + practical. Pass needs total ≥ pass marks.
 */
export function subjectResult({ written, mcq, practical, isAbsent }, { fullMarks, passMarks }, scale = DEFAULT_GRADE_SCALE) {
  if (isAbsent) {
    const f = gradeFor(0, scale);
    return { total: 0, percentage: 0, grade: f.grade, gradePoint: f.gradePoint, resultStatus: 'ABSENT' };
  }
  const total = round2((num(written) ?? 0) + (num(mcq) ?? 0) + (num(practical) ?? 0));
  const percentage = round2((total / Number(fullMarks)) * 100);
  const passed = total >= Number(passMarks);
  // Failing the pass mark always means F, whatever the percentage band says.
  const band = passed ? gradeFor(percentage, scale) : normaliseScale(scale).at(-1);
  return { total, percentage, grade: band.grade, gradePoint: band.gradePoint, resultStatus: passed ? 'PASS' : 'FAIL' };
}

/**
 * GPA = average grade point across subjects (2 decimals).
 * Failing or missing any subject makes the overall result FAIL with GPA 0.00.
 */
export function overallResult(subjectResults, scale = DEFAULT_GRADE_SCALE) {
  if (subjectResults.length === 0) return { gpa: null, grade: null, result: 'PENDING', totalMarks: 0, fullMarks: 0 };
  const totalMarks = round2(subjectResults.reduce((a, s) => a + Number(s.total), 0));
  const fullMarks = round2(subjectResults.reduce((a, s) => a + Number(s.fullMarks ?? 0), 0));
  const failed = subjectResults.some((s) => s.resultStatus !== 'PASS');
  if (failed) return { gpa: 0, grade: normaliseScale(scale).at(-1).grade, result: 'FAIL', totalMarks, fullMarks };
  const gpa = round2(subjectResults.reduce((a, s) => a + Number(s.gradePoint), 0) / subjectResults.length);
  return { gpa, grade: letterForGpa(gpa, scale), result: 'PASS', totalMarks, fullMarks };
}

/** Rank by GPA, then total marks. Ties share a position (1, 2, 2, 4). */
export function rankResults(rows) {
  const sorted = [...rows].sort((a, b) => (b.gpa ?? -1) - (a.gpa ?? -1) || b.totalMarks - a.totalMarks);
  let position = 0;
  return sorted.map((r, i) => {
    const prev = sorted[i - 1];
    if (!prev || prev.gpa !== r.gpa || prev.totalMarks !== r.totalMarks) position = i + 1;
    return { ...r, position };
  });
}

/** Validate a school's custom scale: 0–100 covered, no overlaps, unique grades. */
export function validateGradeScale(scale) {
  const bands = normaliseScale(scale).sort((a, b) => a.minPercent - b.minPercent);
  const problems = [];
  if (new Set(bands.map((b) => b.grade)).size !== bands.length) problems.push('Grade letters must be unique');
  if (bands[0]?.minPercent !== 0) problems.push('The lowest band must start at 0%');
  if (!bands.some((b) => b.maxPercent >= 100)) problems.push('The highest band must reach 100%');
  for (let i = 0; i < bands.length; i += 1) {
    if (bands[i].maxPercent < bands[i].minPercent) problems.push(`${bands[i].grade}: maximum is below minimum`);
    if (i > 0 && bands[i].minPercent <= bands[i - 1].maxPercent) problems.push(`${bands[i - 1].grade} and ${bands[i].grade} overlap`);
    if (i > 0 && bands[i].minPercent - bands[i - 1].maxPercent > 0.011) problems.push(`Gap between ${bands[i - 1].grade} and ${bands[i].grade}`);
  }
  return problems;
}

// ───────────────────────── Fees ─────────────────────────
// Money is handled in paisa (integer) to avoid floating-point drift.

export const toPaisa = (v) => Math.round(Number(v ?? 0) * 100);
export const fromPaisa = (p) => p / 100;

/** Outstanding = Total Fee − Total Paid (never below zero). */
export function outstanding(netAmount, paidAmount) {
  return fromPaisa(Math.max(0, toPaisa(netAmount) - toPaisa(paidAmount)));
}

/** Net payable after an authorised discount. */
export function netAmount(amount, discount = 0) {
  return fromPaisa(toPaisa(amount) - toPaisa(discount));
}

/** Paid / Partially Paid / Unpaid, from what's been paid against what's due. */
export function invoiceStatus(net, paid) {
  const p = toPaisa(paid);
  if (p <= 0) return 'UNPAID';
  if (p >= toPaisa(net)) return 'PAID';
  return 'PARTIALLY_PAID';
}

// ───────────────────────── Library ─────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;
const utcDay = (d) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

/** Whole days late (0 if on time). Dates compared by calendar day. */
export function daysOverdue(dueDate, returnedOn = new Date()) {
  return Math.max(0, Math.round((utcDay(new Date(returnedOn)) - utcDay(new Date(dueDate))) / DAY_MS));
}

/** Overdue fine = days late × fine per day. */
export function libraryFine(dueDate, returnedOn, finePerDay) {
  return fromPaisa(daysOverdue(dueDate, returnedOn) * toPaisa(finePerDay));
}

export { round2 };
