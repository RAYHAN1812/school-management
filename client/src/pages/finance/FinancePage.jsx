import { Download, FilePlus2, Layers, Pencil, Plus, Receipt, Search, Trash2, Wallet } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Alert,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  LifecycleBadge,
  LoadError,
  Modal,
  PageHeader,
  Pagination,
  Spinner,
  StatCard,
  Tabs,
} from '../../components/common/ui';
import { CheckboxField, SelectField, TextField } from '../../components/forms/fields';
import { useAsync, useDebounced } from '../../hooks/useAsync';
import { useToast } from '../../hooks/useAuth';
import { todayInput, useForm } from '../../hooks/useForm';
import { useClasses } from '../../hooks/useLookups';
import { FREQUENCY_LABELS, METHOD_LABELS, financeService } from '../../services/finance.service';
import { studentService } from '../../services/school.service';
import { getErrorMessage } from '../../utils/errors';
import { formatDate, formatMoney } from '../../utils/format';

const TABS = [
  { value: 'invoices', label: 'Invoices' },
  { value: 'payments', label: 'Payments' },
  { value: 'fees', label: 'Fee structure' },
  { value: 'reports', label: 'Reports' },
];

export default function FinancePage() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.value === params.get('tab')) ? params.get('tab') : 'invoices';
  return (
    <>
      <PageHeader title="Fees & payments" description="Invoices, collections, dues and receipts." />
      <Tabs tabs={TABS} value={tab} onChange={(v) => setParams({ tab: v }, { replace: true })} />
      {tab === 'invoices' && <InvoicesTab />}
      {tab === 'payments' && <PaymentsTab />}
      {tab === 'fees' && <FeesTab />}
      {tab === 'reports' && <ReportsTab />}
    </>
  );
}

// ───────────────────────── Invoices ─────────────────────────

function InvoicesTab() {
  const navigate = useNavigate();
  const toast = useToast();
  const classes = useClasses();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('OUTSTANDING');
  const [classId, setClassId] = useState('');
  const [billingPeriod, setBillingPeriod] = useState('');
  const [page, setPage] = useState(1);
  const debounced = useDebounced(search);
  const list = useAsync(
    () => financeService.invoices({ search: debounced, status, classId, billingPeriod, page, limit: 15 }),
    [debounced, status, classId, billingPeriod, page],
  );
  const [modal, setModal] = useState(null); // 'single' | 'bulk'
  const reset = (fn) => (e) => {
    fn(e.target.value);
    setPage(1);
  };
  const totals = list.data?.meta.totals;

  return (
    <>
      {totals && (
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatCard label="Billed (filtered)" value={formatMoney(totals.billed)} icon={Receipt} tone="brand" />
          <StatCard label="Collected" value={formatMoney(totals.paid)} icon={Wallet} tone="emerald" />
          <StatCard label="Outstanding" value={formatMoney(totals.outstanding)} tone={totals.outstanding > 0 ? 'amber' : 'slate'} />
        </div>
      )}
      <Card
        bodyClassName="p-0"
        title="Invoices"
        actions={
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => setModal('single')}>
              <Plus className="h-4 w-4" /> Invoice
            </Button>
            <Button size="sm" onClick={() => setModal('bulk')}>
              <FilePlus2 className="h-4 w-4" /> Generate for class
            </Button>
          </div>
        }
      >
        <div className="grid grid-cols-1 gap-3 border-b border-slate-100 p-4 sm:grid-cols-2 lg:grid-cols-[1fr_auto_auto_auto]">
          <div className="relative sm:col-span-2 lg:col-span-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input className="input pl-9" type="search" placeholder="Invoice no., student name or ID" value={search} onChange={reset(setSearch)} aria-label="Search invoices" />
          </div>
          <select className="input lg:w-40" value={status} onChange={reset(setStatus)} aria-label="Status">
            <option value="OUTSTANDING">Outstanding</option>
            <option value="UNPAID">Unpaid</option>
            <option value="PARTIALLY_PAID">Partially paid</option>
            <option value="PAID">Paid</option>
            <option value="CANCELLED">Cancelled</option>
            <option value="">All</option>
          </select>
          <select className="input lg:w-36" value={classId} onChange={reset(setClassId)} aria-label="Class">
            <option value="">All classes</option>
            {(classes.data?.classes ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input type="month" className="input lg:w-44" value={billingPeriod} onChange={reset(setBillingPeriod)} aria-label="Billing month" />
        </div>
        {list.error ? (
          <div className="p-4">
            <LoadError error={list.error} onRetry={list.reload} />
          </div>
        ) : list.loading && !list.data ? (
          <Spinner />
        ) : list.data.items.length === 0 ? (
          <EmptyState icon={Receipt} title="No invoices match" />
        ) : (
          <>
            <div className={`relative overflow-x-auto ${list.loading ? 'opacity-60' : ''}`}>
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  <tr>
                    <th scope="col" className="px-5 py-3">Invoice</th>
                    <th scope="col" className="px-3 py-3">Student</th>
                    <th scope="col" className="hidden px-3 py-3 md:table-cell">Due</th>
                    <th scope="col" className="px-3 py-3 text-right">Amount</th>
                    <th scope="col" className="hidden px-3 py-3 text-right sm:table-cell">Due now</th>
                    <th scope="col" className="px-5 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {list.data.items.map((inv) => (
                    <tr key={inv.id} onClick={() => navigate(`/admin/finance/invoices/${inv.id}`)} className="cursor-pointer hover:bg-slate-50">
                      <td className="px-5 py-2.5">
                        <Link to={`/admin/finance/invoices/${inv.id}`} onClick={(e) => e.stopPropagation()} className="font-mono text-xs font-medium text-brand-700">
                          {inv.invoiceNumber}
                        </Link>
                        <p className="text-xs text-slate-500">{inv.description ?? inv.feeType.name}</p>
                      </td>
                      <td className="px-3 py-2.5">
                        <p className="font-medium text-slate-900">{inv.student.fullName}</p>
                        <p className="font-mono text-xs text-slate-400">{inv.student.studentCode}</p>
                      </td>
                      <td className="hidden px-3 py-2.5 text-slate-600 md:table-cell">{formatDate(inv.dueDate)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{formatMoney(inv.netAmount)}</td>
                      <td className="hidden px-3 py-2.5 text-right font-medium tabular-nums sm:table-cell">{inv.status === 'CANCELLED' ? '—' : formatMoney(inv.outstanding)}</td>
                      <td className="px-5 py-2.5">
                        <LifecycleBadge status={inv.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination meta={list.data.meta} onPageChange={setPage} />
          </>
        )}
      </Card>
      <InvoiceModal
        open={modal === 'single'}
        onClose={() => setModal(null)}
        onSaved={(inv) => {
          setModal(null);
          toast.success(`Invoice ${inv.invoiceNumber} created.`);
          navigate(`/admin/finance/invoices/${inv.id}`);
        }}
      />
      <GenerateModal
        open={modal === 'bulk'}
        classes={classes.data?.classes ?? []}
        onClose={() => setModal(null)}
        onDone={(r) => {
          setModal(null);
          toast.success(`${r.created} invoices created${r.skipped ? `, ${r.skipped} skipped (already billed)` : ''}.`);
          list.reload();
        }}
      />
    </>
  );
}

function InvoiceModal({ open, onClose, onSaved }) {
  const empty = { studentId: '', feeTypeId: '', amount: '', discount: '0', billingPeriod: '', dueDate: todayInput(), description: '' };
  const f = useForm(empty);
  const [query, setQuery] = useState('');
  const [students, setStudents] = useState([]);
  const [chosen, setChosen] = useState(null);
  const [feeTypes, setFeeTypes] = useState([]);
  const debounced = useDebounced(query);

  useEffect(() => {
    if (!open) return;
    f.setValues(empty);
    f.setErrors({});
    f.setSubmitError('');
    setQuery('');
    setChosen(null);
    financeService.feeTypes().then(setFeeTypes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open || debounced.trim().length < 2 || chosen) {
      setStudents([]);
      return;
    }
    studentService.list({ search: debounced, limit: 8 }).then((r) => setStudents(r.items));
  }, [debounced, open, chosen]);

  const onSubmit = f.submit(
    (v) => {
      const e = {};
      if (!chosen) e.studentId = 'Choose a student';
      if (!v.feeTypeId) e.feeTypeId = 'Choose a fee type';
      if (!(Number(v.amount) > 0)) e.amount = 'Enter an amount above 0';
      if (Number(v.discount) < 0 || Number(v.discount) > Number(v.amount)) e.discount = 'Discount must be between 0 and the amount';
      if (!v.dueDate) e.dueDate = 'Choose a due date';
      return e;
    },
    async (v) => {
      try {
        onSaved(
          await financeService.createInvoice({
            studentId: chosen.id,
            feeTypeId: v.feeTypeId,
            amount: Number(v.amount),
            discount: Number(v.discount || 0),
            billingPeriod: v.billingPeriod || undefined,
            dueDate: v.dueDate,
            description: v.description.trim() || null,
          }),
        );
      } catch (err) {
        f.handleApiError(err, { INVALID_DISCOUNT: 'discount' });
      }
    },
  );

  return (
    <Modal
      open={open}
      onClose={f.submitting ? undefined : onClose}
      title="New invoice"
      description="For one-off charges. Use “Generate for class” for regular fees."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={f.submitting}>
            Cancel
          </Button>
          <Button type="submit" form="invoice-form" loading={f.submitting}>
            Create invoice
          </Button>
        </>
      }
    >
      <form id="invoice-form" onSubmit={onSubmit} noValidate className="space-y-4">
        {f.submitError && <Alert type="error">{f.submitError}</Alert>}
        {chosen ? (
          <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <span>
              <span className="font-medium">{chosen.fullName}</span> <span className="font-mono text-xs text-slate-500">{chosen.studentCode}</span>
            </span>
            <Button size="sm" variant="ghost" onClick={() => setChosen(null)}>
              Change
            </Button>
          </div>
        ) : (
          <div>
            <TextField label="Student" placeholder="Search by name or ID" value={query} onChange={(e) => setQuery(e.target.value)} error={f.errors.studentId} />
            {students.length > 0 && (
              <ul className="mt-1 max-h-44 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
                {students.map((s) => (
                  <li key={s.id}>
                    <button type="button" onClick={() => setChosen(s)} className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50">
                      {s.fullName} <span className="font-mono text-xs text-slate-400">{s.studentCode}</span>
                      {s.enrollment && <span className="text-xs text-slate-500"> · {s.enrollment.class.name}-{s.enrollment.section.name}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SelectField label="Fee type" placeholder="Select" options={feeTypes.map((t) => ({ value: t.id, label: t.name }))} {...f.bind('feeTypeId')} />
          <TextField label="Billing month" type="month" hint="Optional (for monthly fees)" {...f.bind('billingPeriod')} />
          <TextField label="Amount (৳)" type="number" min="0" step="0.01" {...f.bind('amount')} />
          <TextField label="Discount (৳)" type="number" min="0" step="0.01" hint="Recorded as approved by you" {...f.bind('discount')} />
          <TextField label="Due date" type="date" {...f.bind('dueDate')} />
          <TextField label="Description" placeholder="e.g. Science fair fee" {...f.bind('description')} />
        </div>
      </form>
    </Modal>
  );
}

function GenerateModal({ open, classes, onClose, onDone }) {
  const f = useForm({ classId: '', sectionId: '', billingPeriod: todayInput().slice(0, 7), dueDate: '' });
  const [structures, setStructures] = useState([]);
  const [selected, setSelected] = useState([]);

  useEffect(() => {
    if (!open) return;
    const first = classes[0]?.id ?? '';
    f.setValues({ classId: first, sectionId: '', billingPeriod: todayInput().slice(0, 7), dueDate: `${todayInput().slice(0, 7)}-10` });
    f.setErrors({});
    f.setSubmitError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open || !f.values.classId) return;
    financeService.feeStructures({ classId: f.values.classId }).then((list) => {
      setStructures(list);
      setSelected(list.filter((s) => s.frequency === 'MONTHLY').map((s) => s.id));
    });
  }, [open, f.values.classId]);

  const klass = classes.find((c) => c.id === f.values.classId);
  const needsMonth = structures.some((s) => selected.includes(s.id) && s.frequency === 'MONTHLY');

  const onSubmit = f.submit(
    (v) => {
      const e = {};
      if (!v.classId) e.classId = 'Choose a class';
      if (selected.length === 0) e.fees = 'Choose at least one fee';
      if (needsMonth && !v.billingPeriod) e.billingPeriod = 'Choose the month';
      if (!v.dueDate) e.dueDate = 'Choose a due date';
      return e;
    },
    async (v) => {
      try {
        onDone(
          await financeService.generateInvoices({
            classId: v.classId,
            sectionId: v.sectionId || undefined,
            feeStructureIds: selected,
            billingPeriod: v.billingPeriod || undefined,
            dueDate: v.dueDate,
          }),
        );
      } catch (err) {
        f.handleApiError(err);
      }
    },
  );

  return (
    <Modal
      open={open}
      onClose={f.submitting ? undefined : onClose}
      title="Generate invoices for a class"
      description="Creates one invoice per active student for each chosen fee. Students already billed for the same fee and month are skipped."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={f.submitting}>
            Cancel
          </Button>
          <Button type="submit" form="generate-form" loading={f.submitting}>
            Generate
          </Button>
        </>
      }
    >
      <form id="generate-form" onSubmit={onSubmit} noValidate className="space-y-4">
        {f.submitError && <Alert type="error">{f.submitError}</Alert>}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SelectField label="Class" options={classes.map((c) => ({ value: c.id, label: c.name }))} {...f.bind('classId')} />
          <SelectField
            label="Section"
            placeholder="All sections"
            options={(klass?.sections ?? []).map((s) => ({ value: s.id, label: `Section ${s.name}` }))}
            {...f.bind('sectionId')}
          />
        </div>
        <fieldset>
          <legend className="label">Fees</legend>
          {f.errors.fees && <p className="mb-1 text-xs text-red-600">{f.errors.fees}</p>}
          {structures.length === 0 ? (
            <Alert type="info">No fees set up for this class yet (Fee structure tab).</Alert>
          ) : (
            <div className="space-y-2">
              {structures.map((s) => (
                <CheckboxField
                  key={s.id}
                  label={`${s.feeType.name} — ${formatMoney(s.amount)}`}
                  description={`${FREQUENCY_LABELS[s.frequency]}${s.class ? ` · ${s.class.name} only` : ' · all classes'}`}
                  checked={selected.includes(s.id)}
                  onChange={(on) => setSelected((all) => (on ? [...all, s.id] : all.filter((x) => x !== s.id)))}
                />
              ))}
            </div>
          )}
        </fieldset>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField label="Billing month" type="month" hint={needsMonth ? 'Required for monthly fees' : 'Not needed'} disabled={!needsMonth} {...f.bind('billingPeriod')} />
          <TextField label="Due date" type="date" {...f.bind('dueDate')} />
        </div>
      </form>
    </Modal>
  );
}

// ───────────────────────── Payments ─────────────────────────

function PaymentsTab() {
  const [method, setMethod] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const list = useAsync(() => financeService.payments({ method, from, to, page, limit: 20 }), [method, from, to, page]);

  return (
    <Card bodyClassName="p-0" title="Payment history" description={list.data ? `Total in view: ${formatMoney(list.data.meta.totalAmount)}` : undefined}>
      <div className="grid grid-cols-1 gap-3 border-b border-slate-100 p-4 sm:grid-cols-3">
        <select className="input" value={method} onChange={(e) => { setMethod(e.target.value); setPage(1); }} aria-label="Method">
          <option value="">All methods</option>
          {Object.entries(METHOD_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <input type="date" className="input" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} aria-label="From date" />
        <input type="date" className="input" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} aria-label="To date" />
      </div>
      {list.error ? (
        <div className="p-4">
          <LoadError error={list.error} onRetry={list.reload} />
        </div>
      ) : list.loading && !list.data ? (
        <Spinner />
      ) : list.data.items.length === 0 ? (
        <EmptyState icon={Wallet} title="No payments in this range" />
      ) : (
        <>
          <ul className="divide-y divide-slate-100">
            {list.data.items.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="font-medium text-slate-900">
                    {p.student.fullName} <span className="font-mono text-xs font-normal text-slate-400">{p.student.studentCode}</span>
                  </p>
                  <p className="text-xs text-slate-500">
                    {p.invoice.feeType.name}
                    {p.invoice.billingPeriod ? ` · ${p.invoice.billingPeriod}` : ''} · {METHOD_LABELS[p.method]}
                    {p.transactionRef ? ` · ${p.transactionRef}` : ''} · {formatDate(p.paidAt)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold tabular-nums text-slate-900">{formatMoney(p.amount)}</span>
                  <Link to={`/admin/finance/receipts/${p.id}`} className="text-xs font-medium text-brand-600 hover:text-brand-700">
                    {p.receiptNumber}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
          <Pagination meta={list.data.meta} onPageChange={setPage} />
        </>
      )}
    </Card>
  );
}

// ───────────────────────── Fee structure ─────────────────────────

function FeesTab() {
  const toast = useToast();
  const classes = useClasses();
  const fees = useAsync(() => financeService.feeStructures({}), []);
  const types = useAsync(() => financeService.feeTypes(), []);
  const [editing, setEditing] = useState(null);
  const [typeOpen, setTypeOpen] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    try {
      await financeService.deleteFeeStructure(deleting.id);
      toast.success('Fee removed.');
      fees.reload();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
      setDeleting(null);
    }
  }

  return (
    <>
      <Card
        bodyClassName="p-0"
        title="Fees for the active year"
        description="New invoices use these amounts. Changing a fee doesn't alter invoices already issued."
        actions={
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => setTypeOpen(true)}>
              <Layers className="h-4 w-4" /> Fee type
            </Button>
            <Button size="sm" onClick={() => setEditing('new')}>
              <Plus className="h-4 w-4" /> Add fee
            </Button>
          </div>
        }
      >
        {fees.loading && !fees.data ? (
          <Spinner />
        ) : fees.error ? (
          <div className="p-4">
            <LoadError error={fees.error} onRetry={fees.reload} />
          </div>
        ) : fees.data.length === 0 ? (
          <EmptyState icon={Layers} title="No fees set up" />
        ) : (
          <ul className="divide-y divide-slate-100">
            {fees.data.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div>
                  <p className="font-medium text-slate-900">{s.feeType.name}</p>
                  <p className="text-xs text-slate-500">
                    {FREQUENCY_LABELS[s.frequency]} · {s.class ? s.class.name : 'All classes'}
                    {s.dueDay ? ` · due on day ${s.dueDay}` : ''} · {s._count.invoices} invoices
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold tabular-nums">{formatMoney(s.amount)}</span>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(s)} aria-label={`Edit ${s.feeType.name}`}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  {s._count.invoices === 0 && (
                    <Button size="sm" variant="ghost" onClick={() => setDeleting(s)} aria-label={`Remove ${s.feeType.name}`}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <FeeModal
        open={Boolean(editing)}
        fee={editing === 'new' ? null : editing}
        classes={classes.data?.classes ?? []}
        types={types.data ?? []}
        onClose={() => setEditing(null)}
        onSaved={() => {
          toast.success('Fee saved.');
          setEditing(null);
          fees.reload();
        }}
      />
      <FeeTypeModal
        open={typeOpen}
        onClose={() => setTypeOpen(false)}
        onSaved={(t) => {
          toast.success(`${t.name} added.`);
          setTypeOpen(false);
          types.reload();
        }}
      />
      <ConfirmDialog
        open={Boolean(deleting)}
        title="Remove this fee?"
        message={`${deleting?.feeType.name} will no longer be available for new invoices.`}
        confirmLabel="Remove"
        loading={busy}
        onConfirm={remove}
        onCancel={() => setDeleting(null)}
      />
    </>
  );
}

function FeeModal({ open, fee, classes, types, onClose, onSaved }) {
  const f = useForm({ feeTypeId: '', classId: '', amount: '', frequency: 'MONTHLY', dueDay: '10' });
  useEffect(() => {
    if (!open) return;
    f.setValues(
      fee
        ? { feeTypeId: fee.feeType.id, classId: fee.class?.id ?? '', amount: String(Number(fee.amount)), frequency: fee.frequency, dueDay: fee.dueDay ? String(fee.dueDay) : '' }
        : { feeTypeId: '', classId: '', amount: '', frequency: 'MONTHLY', dueDay: '10' },
    );
    f.setErrors({});
    f.setSubmitError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, fee]);

  const onSubmit = f.submit(
    (v) => {
      const e = {};
      if (!fee && !v.feeTypeId) e.feeTypeId = 'Choose a fee type';
      if (!(Number(v.amount) > 0)) e.amount = 'Enter an amount above 0';
      if (v.dueDay && !(Number(v.dueDay) >= 1 && Number(v.dueDay) <= 28)) e.dueDay = 'Day 1–28';
      return e;
    },
    async (v) => {
      const common = { amount: Number(v.amount), frequency: v.frequency, dueDay: v.dueDay ? Number(v.dueDay) : null };
      try {
        if (fee) await financeService.updateFeeStructure(fee.id, common);
        else await financeService.createFeeStructure({ ...common, feeTypeId: v.feeTypeId, classId: v.classId || null });
        onSaved();
      } catch (err) {
        f.handleApiError(err, { DUPLICATE_FEE_STRUCTURE: 'feeTypeId' });
      }
    },
  );

  return (
    <Modal
      open={open}
      onClose={f.submitting ? undefined : onClose}
      title={fee ? `Edit ${fee.feeType.name}` : 'Add fee'}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={f.submitting}>
            Cancel
          </Button>
          <Button type="submit" form="fee-form" loading={f.submitting}>
            Save
          </Button>
        </>
      }
    >
      <form id="fee-form" onSubmit={onSubmit} noValidate className="space-y-4">
        {f.submitError && <Alert type="error">{f.submitError}</Alert>}
        {!fee && (
          <>
            <SelectField label="Fee type" placeholder="Select" options={types.map((t) => ({ value: t.id, label: t.name }))} {...f.bind('feeTypeId')} />
            <SelectField label="Applies to" placeholder="All classes" options={classes.map((c) => ({ value: c.id, label: c.name }))} {...f.bind('classId')} />
          </>
        )}
        <TextField label="Amount (৳)" type="number" min="0" step="0.01" {...f.bind('amount')} />
        <div className="grid grid-cols-2 gap-4">
          <SelectField label="Frequency" options={Object.entries(FREQUENCY_LABELS).map(([value, label]) => ({ value, label }))} {...f.bind('frequency')} />
          <TextField label="Due day" type="number" min="1" max="28" hint="Of the month" {...f.bind('dueDay')} />
        </div>
      </form>
    </Modal>
  );
}

function FeeTypeModal({ open, onClose, onSaved }) {
  const f = useForm({ name: '', code: '' });
  useEffect(() => {
    if (open) {
      f.setValues({ name: '', code: '' });
      f.setErrors({});
      f.setSubmitError('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const onSubmit = f.submit(
    (v) => {
      const e = {};
      if (!v.name.trim()) e.name = 'Enter a name';
      if (!/^[A-Za-z0-9_-]{2,20}$/.test(v.code.trim())) e.code = '2–20 letters, numbers, dash or underscore';
      return e;
    },
    async (v) => {
      try {
        onSaved(await financeService.createFeeType({ name: v.name.trim(), code: v.code.trim() }));
      } catch (err) {
        f.handleApiError(err, { DUPLICATE_FEE_TYPE: 'code' });
      }
    },
  );
  return (
    <Modal
      open={open}
      onClose={f.submitting ? undefined : onClose}
      title="New fee type"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={f.submitting}>
            Cancel
          </Button>
          <Button type="submit" form="fee-type-form" loading={f.submitting}>
            Add
          </Button>
        </>
      }
    >
      <form id="fee-type-form" onSubmit={onSubmit} noValidate className="space-y-4">
        {f.submitError && <Alert type="error">{f.submitError}</Alert>}
        <TextField label="Name" placeholder="Sports fee" {...f.bind('name')} />
        <TextField label="Code" placeholder="SPORTS" {...f.bind('code')} />
      </form>
    </Modal>
  );
}

// ───────────────────────── Reports ─────────────────────────

function ReportsTab() {
  const toast = useToast();
  const [month, setMonth] = useState(todayInput().slice(0, 7));
  const report = useAsync(() => financeService.report(month), [month]);
  const [exporting, setExporting] = useState(false);
  const maxDaily = useMemo(() => Math.max(1, ...(report.data?.daily ?? []).map((d) => d.amount)), [report.data]);

  async function exportCsv() {
    setExporting(true);
    try {
      await financeService.exportReport(month);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Export failed'));
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <Card bodyClassName="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <label className="sm:w-56">
          <span className="label">Month</span>
          <input type="month" className="input" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
        </label>
        <Button variant="secondary" onClick={exportCsv} loading={exporting}>
          <Download className="h-4 w-4" /> Export CSV
        </Button>
      </Card>
      {report.loading && !report.data ? (
        <Spinner />
      ) : report.error ? (
        <LoadError error={report.error} onRetry={report.reload} />
      ) : (
        <>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatCard label={`Collected in ${report.data.month}`} value={formatMoney(report.data.collected)} icon={Wallet} tone="emerald" />
            <StatCard label="Payments" value={report.data.paymentCount} tone="brand" />
            <StatCard label="Outstanding (all time)" value={formatMoney(report.data.outstanding.amount)} hint={`${report.data.outstanding.invoices} open invoices`} tone="amber" />
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            {[
              ['By payment method', report.data.byMethod.map((x) => ({ ...x, label: METHOD_LABELS[x.key] ?? x.key }))],
              ['By fee type', report.data.byFeeType.map((x) => ({ ...x, label: x.key }))],
            ].map(([title, rows]) => (
              <Card key={title} title={title}>
                {rows.length === 0 ? (
                  <p className="text-sm text-slate-500">No payments this month.</p>
                ) : (
                  <ul className="space-y-2">
                    {rows.map((r) => (
                      <li key={r.key} className="flex justify-between text-sm">
                        <span className="text-slate-700">{r.label}</span>
                        <span className="font-semibold tabular-nums">{formatMoney(r.amount)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            ))}
          </div>
          {report.data.daily.length > 0 && (
            <Card className="mt-4" title="Daily collection">
              <ul className="space-y-1.5">
                {report.data.daily.map((d) => (
                  <li key={d.key} className="flex items-center gap-3 text-sm">
                    <span className="w-24 shrink-0 tabular-nums text-slate-500">{formatDate(d.key)}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${(d.amount / maxDaily) * 100}%` }} />
                    </div>
                    <span className="w-24 shrink-0 text-right font-medium tabular-nums">{formatMoney(d.amount)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </>
  );
}
