import { ArrowLeft, Ban, Percent, Wallet } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Alert, Button, Card, ConfirmDialog, Detail, LifecycleBadge, LoadError, Modal, Spinner } from '../../components/common/ui';
import { SelectField, TextField } from '../../components/forms/fields';
import { useAsync } from '../../hooks/useAsync';
import { useToast } from '../../hooks/useAuth';
import { todayInput, useForm } from '../../hooks/useForm';
import { METHOD_LABELS, financeService } from '../../services/finance.service';
import { getErrorMessage } from '../../utils/errors';
import { formatDate, formatDateTime, formatMoney } from '../../utils/format';

export default function InvoiceDetailPage() {
  const { id } = useParams();
  const toast = useToast();
  const invoice = useAsync(() => financeService.invoice(id), [id]);
  const [paying, setPaying] = useState(false);
  const [discounting, setDiscounting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [busy, setBusy] = useState(false);

  if (invoice.loading && !invoice.data) return <Spinner />;
  if (invoice.error) return <LoadError error={invoice.error} onRetry={invoice.reload} />;
  const inv = invoice.data;
  const open = ['UNPAID', 'PARTIALLY_PAID'].includes(inv.status);
  const overdue = open && inv.dueDate.slice(0, 10) < todayInput();

  async function cancel() {
    setBusy(true);
    try {
      await financeService.cancelInvoice(inv.id);
      toast.success('Invoice cancelled.');
      invoice.reload();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
      setCancelling(false);
    }
  }

  return (
    <>
      <Link to="/admin/finance" className="mb-3 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> Fees & payments
      </Link>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-mono text-xl font-semibold text-slate-900">{inv.invoiceNumber}</h1>
            <LifecycleBadge status={inv.status} />
            {overdue && <span className="rounded bg-red-600 px-1.5 py-0.5 text-xs font-medium text-white">Overdue</span>}
          </div>
          <p className="text-sm text-slate-500">
            {inv.description ?? inv.feeType.name} · {inv.student.fullName} ({inv.student.studentCode})
          </p>
        </div>
        {open && (
          <div className="flex flex-wrap gap-2">
            {Number(inv.paidAmount) === 0 && (
              <Button variant="secondary" onClick={() => setCancelling(true)}>
                <Ban className="h-4 w-4" /> Cancel
              </Button>
            )}
            <Button variant="secondary" onClick={() => setDiscounting(true)}>
              <Percent className="h-4 w-4" /> Discount
            </Button>
            <Button onClick={() => setPaying(true)}>
              <Wallet className="h-4 w-4" /> Record payment
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card title="Amounts" className="lg:col-span-1">
          <dl className="space-y-2 text-sm">
            {[
              ['Amount', formatMoney(inv.amount)],
              ['Discount', `− ${formatMoney(inv.discount)}`],
              ['Net payable', formatMoney(inv.netAmount)],
              ['Paid', formatMoney(inv.paidAmount)],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between">
                <dt className="text-slate-500">{k}</dt>
                <dd className="tabular-nums text-slate-900">{v}</dd>
              </div>
            ))}
            <div className="flex justify-between border-t border-slate-200 pt-2 text-base">
              <dt className="font-medium text-slate-700">Outstanding</dt>
              <dd className={`font-bold tabular-nums ${inv.outstanding > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>{formatMoney(inv.outstanding)}</dd>
            </div>
          </dl>
        </Card>
        <Card title="Details" className="lg:col-span-2">
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Detail label="Fee type" value={inv.feeType.name} />
            <Detail label="Billing month" value={inv.billingPeriod} />
            <Detail label="Academic year" value={inv.academicYear.name} />
            <Detail label="Due date" value={formatDate(inv.dueDate)} />
            <Detail label="Created by" value={inv.createdBy?.fullName} />
            <Detail label="Discount approved by" value={inv.discountApprovedBy?.fullName} />
          </dl>
        </Card>
      </div>

      <Card className="mt-6" title="Payments" bodyClassName="p-0">
        {inv.payments.length === 0 ? (
          <p className="px-5 py-4 text-sm text-slate-500">No payments yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {inv.payments.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div>
                  <p className="font-medium text-slate-900">
                    {formatMoney(p.amount)} <span className="text-sm font-normal text-slate-500">· {METHOD_LABELS[p.method]}</span>
                  </p>
                  <p className="text-xs text-slate-500">
                    {p.paidAt ? formatDateTime(p.paidAt) : 'Not completed'}
                    {p.transactionRef ? ` · Ref ${p.transactionRef}` : ''}
                    {p.receivedBy ? ` · by ${p.receivedBy.fullName}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <LifecycleBadge status={p.status} />
                  {p.status === 'SUCCESS' && (
                    <Link to={`/admin/finance/receipts/${p.id}`} className="text-xs font-medium text-brand-600 hover:text-brand-700">
                      Receipt {p.receiptNumber}
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <PaymentModal
        open={paying}
        invoice={inv}
        onClose={() => setPaying(false)}
        onDone={(receipt) => {
          setPaying(false);
          toast.success(`Payment recorded. Receipt ${receipt.receiptNumber}.`);
          invoice.reload();
        }}
      />
      <DiscountModal
        open={discounting}
        invoice={inv}
        onClose={() => setDiscounting(false)}
        onDone={() => {
          setDiscounting(false);
          toast.success('Discount applied.');
          invoice.reload();
        }}
      />
      <ConfirmDialog
        open={cancelling}
        title="Cancel this invoice?"
        message="It will no longer count as due. This can't be undone; issue a new invoice if needed."
        confirmLabel="Cancel invoice"
        loading={busy}
        onConfirm={cancel}
        onCancel={() => setCancelling(false)}
      />
    </>
  );
}

function PaymentModal({ open, invoice, onClose, onDone }) {
  const f = useForm({ amount: '', method: 'CASH', transactionRef: '', paidAt: todayInput() });
  useEffect(() => {
    if (open) {
      f.setValues({ amount: String(invoice.outstanding), method: 'CASH', transactionRef: '', paidAt: todayInput() });
      f.setErrors({});
      f.setSubmitError('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const onSubmit = f.submit(
    (v) => {
      const e = {};
      const amount = Number(v.amount);
      if (!(amount > 0)) e.amount = 'Enter an amount above 0';
      else if (Math.round(amount * 100) > Math.round(invoice.outstanding * 100)) e.amount = `Can't exceed the outstanding ${formatMoney(invoice.outstanding)}`;
      if (v.method !== 'CASH' && !v.transactionRef.trim()) e.transactionRef = 'Enter the transaction reference';
      return e;
    },
    async (v) => {
      try {
        onDone(
          await financeService.recordPayment({
            invoiceId: invoice.id,
            amount: Number(v.amount),
            method: v.method,
            transactionRef: v.transactionRef.trim() || undefined,
            // Today → the actual time; an earlier date → that date.
            paidAt: v.paidAt === todayInput() ? new Date().toISOString() : v.paidAt,
          }),
        );
      } catch (err) {
        f.handleApiError(err, { OVERPAYMENT_NOT_ALLOWED: 'amount', DUPLICATE_TRANSACTION: 'transactionRef' });
      }
    },
  );

  return (
    <Modal
      open={open}
      onClose={f.submitting ? undefined : onClose}
      title="Record payment"
      description={`${invoice.invoiceNumber} · outstanding ${formatMoney(invoice.outstanding)}`}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={f.submitting}>
            Cancel
          </Button>
          <Button type="submit" form="payment-form" loading={f.submitting}>
            Record payment
          </Button>
        </>
      }
    >
      <form id="payment-form" onSubmit={onSubmit} noValidate className="space-y-4">
        {f.submitError && <Alert type="error">{f.submitError}</Alert>}
        <TextField label="Amount (৳)" type="number" min="0" step="0.01" {...f.bind('amount')} />
        <SelectField
          label="Method"
          options={Object.entries(METHOD_LABELS)
            .filter(([k]) => k !== 'SSLCOMMERZ')
            .map(([value, label]) => ({ value, label }))}
          {...f.bind('method')}
        />
        {f.values.method !== 'CASH' && <TextField label="Transaction reference" placeholder="e.g. bKash TrxID" {...f.bind('transactionRef')} />}
        <TextField label="Payment date" type="date" max={todayInput()} {...f.bind('paidAt')} />
      </form>
    </Modal>
  );
}

function DiscountModal({ open, invoice, onClose, onDone }) {
  const f = useForm({ discount: '' });
  useEffect(() => {
    if (open) {
      f.setValues({ discount: String(Number(invoice.discount)) });
      f.setErrors({});
      f.setSubmitError('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const onSubmit = f.submit(
    (v) => {
      const d = Number(v.discount);
      if (!(d >= 0) || d > Number(invoice.amount)) return { discount: `Between 0 and ${formatMoney(invoice.amount)}` };
      return {};
    },
    async (v) => {
      try {
        await financeService.updateInvoice(invoice.id, { discount: Number(v.discount) });
        onDone();
      } catch (err) {
        f.handleApiError(err, { INVALID_DISCOUNT: 'discount' });
      }
    },
  );
  return (
    <Modal
      open={open}
      onClose={f.submitting ? undefined : onClose}
      title="Apply discount"
      description="The discount is recorded as approved by you and appears in the audit log."
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={f.submitting}>
            Cancel
          </Button>
          <Button type="submit" form="discount-form" loading={f.submitting}>
            Apply
          </Button>
        </>
      }
    >
      <form id="discount-form" onSubmit={onSubmit} noValidate className="space-y-4">
        {f.submitError && <Alert type="error">{f.submitError}</Alert>}
        <TextField label={`Discount (৳) on ${formatMoney(invoice.amount)}`} type="number" min="0" step="0.01" {...f.bind('discount')} />
      </form>
    </Modal>
  );
}
