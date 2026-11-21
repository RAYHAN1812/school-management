import { ArrowLeft, GraduationCap, Printer } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, LoadError, Spinner } from '../../components/common/ui';
import { useAsync } from '../../hooks/useAsync';
import { METHOD_LABELS, financeService } from '../../services/finance.service';
import { formatDateTime, formatMoney } from '../../utils/format';

/** Printable payment receipt (admins, and the student's own parent/student). */
export default function ReceiptPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const r = useAsync(() => financeService.receipt(id), [id]);

  if (r.loading && !r.data) return <Spinner />;
  if (r.error) return <LoadError error={r.error} onRetry={r.reload} />;
  const p = r.data;
  const enrollment = p.student.enrollments[0];

  return (
    <>
      <div className="mb-4 flex items-center justify-between print:hidden">
        <button type="button" onClick={() => navigate(-1)} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <Button onClick={() => window.print()}>
          <Printer className="h-4 w-4" /> Print / Save as PDF
        </Button>
      </div>
      <article className="mx-auto max-w-xl rounded-xl border border-slate-200 bg-white p-6 shadow-card sm:p-8 print:max-w-none print:border-0 print:p-0 print:shadow-none">
        <header className="flex items-start justify-between gap-4 border-b border-dashed border-slate-300 pb-4">
          <div className="flex items-center gap-3">
            <GraduationCap className="h-8 w-8 text-brand-600 print:text-slate-900" aria-hidden="true" />
            <div>
              <p className="font-bold text-slate-900">{p.school?.name}</p>
              {p.school?.address && <p className="text-xs text-slate-500">{p.school.address}</p>}
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wider text-slate-500">Payment receipt</p>
            <p className="font-mono font-semibold text-slate-900">{p.receiptNumber}</p>
          </div>
        </header>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          {[
            ['Student', p.student.fullName],
            ['Student ID', p.student.studentCode],
            ['Class', enrollment ? `${enrollment.class.name} · ${enrollment.section.name}` : '—'],
            ['Date', formatDateTime(p.paidAt)],
            ['Invoice', p.invoice.invoiceNumber],
            ['For', `${p.invoice.feeType.name}${p.invoice.billingPeriod ? ` (${p.invoice.billingPeriod})` : ''}`],
            ['Method', METHOD_LABELS[p.method]],
            ['Reference', p.transactionRef ?? '—'],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs text-slate-500">{k}</dt>
              <dd className="font-medium text-slate-900">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-6 rounded-lg bg-slate-50 p-4 print:border print:border-slate-300 print:bg-white">
          <div className="flex justify-between text-lg font-bold">
            <span>Amount received</span>
            <span className="tabular-nums">{formatMoney(p.amount)}</span>
          </div>
          <div className="mt-1 flex justify-between text-sm text-slate-600">
            <span>Balance remaining on invoice</span>
            <span className="tabular-nums">{formatMoney(p.invoice.outstanding)}</span>
          </div>
        </div>
        <p className="mt-6 text-xs text-slate-500">Received by {p.receivedBy?.fullName ?? 'online payment'}. This is a computer-generated receipt.</p>
      </article>
    </>
  );
}
