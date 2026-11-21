import { ArrowLeft, GraduationCap, Printer } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button, LoadError, Spinner } from '../../components/common/ui';
import { useAsync } from '../../hooks/useAsync';
import { examService } from '../../services/exam.service';
import { formatDate } from '../../utils/format';

/** Printable report card. "Print / Save as PDF" uses the browser's print dialog. */
export default function ReportCardPage({ backTo }) {
  const { id, studentId } = useParams();
  const card = useAsync(() => examService.reportCard(id, studentId), [id, studentId]);
  const navigate = useNavigate();

  if (card.loading && !card.data) return <Spinner />;
  if (card.error) return <LoadError error={card.error} onRetry={card.reload} />;
  const { school, exam, student, subjects, overall, scale } = card.data;
  const n = (v) => (v == null ? '—' : Number(v));

  return (
    <>
      <div className="mb-4 flex items-center justify-between print:hidden">
        {backTo ? (
          <Link to={backTo} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
        ) : (
          <button type="button" onClick={() => navigate(-1)} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
        )}
        <Button onClick={() => window.print()}>
          <Printer className="h-4 w-4" /> Print / Save as PDF
        </Button>
      </div>

      <article className="mx-auto max-w-3xl rounded-xl border border-slate-200 bg-white p-6 shadow-card sm:p-10 print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none">
        <header className="flex items-start justify-between gap-4 border-b-2 border-slate-900 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-brand-600 text-white print:border print:border-slate-900 print:bg-white print:text-slate-900">
              <GraduationCap className="h-7 w-7" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">{school?.name}</h1>
              {school?.address && <p className="text-xs text-slate-500">{school.address}</p>}
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wider text-slate-500">Report card</p>
            <p className="font-semibold text-slate-900">{exam.name}</p>
            <p className="text-xs text-slate-500">Academic year {exam.academicYear.name}</p>
          </div>
        </header>

        <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
          {[
            ['Student', student.fullName],
            ['Student ID', student.studentCode],
            ['Class', `${exam.class.name} · ${student.section.name}`],
            ['Roll', student.rollNumber],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs text-slate-500">{k}</dt>
              <dd className="font-medium text-slate-900">{v}</dd>
            </div>
          ))}
        </dl>

        <table className="mt-6 w-full border-collapse text-sm">
          <thead>
            <tr className="border-y border-slate-300 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600 print:bg-white">
              <th className="px-2 py-2">Subject</th>
              <th className="px-2 py-2 text-right">Full</th>
              <th className="px-2 py-2 text-right">Written</th>
              <th className="px-2 py-2 text-right">MCQ</th>
              <th className="px-2 py-2 text-right">Practical</th>
              <th className="px-2 py-2 text-right">Total</th>
              <th className="px-2 py-2 text-center">Grade</th>
              <th className="px-2 py-2 text-right">GP</th>
            </tr>
          </thead>
          <tbody>
            {subjects.map((s) => (
              <tr key={s.id} className="border-b border-slate-200">
                <td className="px-2 py-2 font-medium text-slate-900">{s.name}</td>
                <td className="px-2 py-2 text-right tabular-nums">{n(s.fullMarks)}</td>
                <td className="px-2 py-2 text-right tabular-nums">{s.isAbsent ? 'Absent' : n(s.written)}</td>
                <td className="px-2 py-2 text-right tabular-nums">{s.isAbsent ? '' : n(s.mcq)}</td>
                <td className="px-2 py-2 text-right tabular-nums">{s.isAbsent ? '' : n(s.practical)}</td>
                <td className="px-2 py-2 text-right font-semibold tabular-nums">{n(s.total)}</td>
                <td className={`px-2 py-2 text-center font-semibold ${s.resultStatus === 'PASS' ? '' : 'text-red-600'}`}>{s.grade ?? '—'}</td>
                <td className="px-2 py-2 text-right tabular-nums">{s.gradePoint == null ? '—' : Number(s.gradePoint).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <section className="mt-6 grid grid-cols-2 gap-4 rounded-lg bg-slate-50 p-4 text-center sm:grid-cols-5 print:border print:border-slate-300 print:bg-white">
          {[
            ['Total', `${overall.totalMarks}${overall.fullMarks ? ` / ${overall.fullMarks}` : ''}`],
            ['GPA', overall.gpa == null ? '—' : overall.gpa.toFixed(2)],
            ['Grade', overall.grade ?? '—'],
            ['Result', overall.result === 'PASS' ? 'Passed' : overall.result === 'FAIL' ? 'Failed' : 'Incomplete'],
            ['Merit position', overall.position ? `${overall.position} of ${overall.outOf}` : '—'],
          ].map(([k, v]) => (
            <div key={k}>
              <p className="text-xs text-slate-500">{k}</p>
              <p className={`text-lg font-bold ${k === 'Result' && overall.result === 'FAIL' ? 'text-red-600' : 'text-slate-900'}`}>{v}</p>
            </div>
          ))}
        </section>

        <section className="mt-6 text-xs text-slate-500">
          <p className="font-medium text-slate-700">Grading scale</p>
          <p className="mt-1">
            {scale.map((b) => `${b.grade} ${Number(b.minPercent)}–${Number(b.maxPercent)}% (${Number(b.gradePoint).toFixed(2)})`).join(' · ')}
          </p>
          <p className="mt-1">GPA is the average grade point across subjects. A failed or missed subject gives a GPA of 0.00.</p>
        </section>

        <footer className="mt-12 grid grid-cols-3 gap-6 text-center text-xs text-slate-500">
          {['Class teacher', 'Guardian', 'Principal'].map((s) => (
            <div key={s}>
              <div className="mb-1 border-t border-slate-400 pt-1">{s}</div>
            </div>
          ))}
        </footer>
        <p className="mt-6 text-right text-[10px] text-slate-400">
          {exam.publishedAt ? `Published ${formatDate(exam.publishedAt)}` : 'Provisional — not yet published'}
        </p>
      </article>
    </>
  );
}
