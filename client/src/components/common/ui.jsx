import { AlertCircle, CheckCircle2, Info, Loader2, X } from 'lucide-react';
import { useEffect, useRef } from 'react';

const cx = (...c) => c.filter(Boolean).join(' ');

const BUTTON_VARIANTS = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 disabled:bg-brand-300',
  secondary: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:text-slate-400',
  danger: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300',
  ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
};

export function Button({ variant = 'primary', size = 'md', loading = false, className, children, disabled, ...props }) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed',
        size === 'sm' ? 'px-3 py-1.5 text-sm' : 'px-4 py-2.5 text-sm',
        BUTTON_VARIANTS[variant],
        className,
      )}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}

export function Spinner({ label = 'Loading…', className }) {
  return (
    <div role="status" className={cx('flex items-center justify-center gap-2 py-10 text-sm text-slate-500', className)}>
      <Loader2 className="h-5 w-5 animate-spin text-brand-600" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function FullPageSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Spinner label="Loading Ratonpur Central School…" />
    </div>
  );
}

const ALERT_STYLES = {
  error: { box: 'border-red-200 bg-red-50 text-red-800', Icon: AlertCircle },
  success: { box: 'border-emerald-200 bg-emerald-50 text-emerald-800', Icon: CheckCircle2 },
  info: { box: 'border-sky-200 bg-sky-50 text-sky-800', Icon: Info },
};

export function Alert({ type = 'info', title, children, action, className }) {
  const { box, Icon } = ALERT_STYLES[type];
  return (
    <div role={type === 'error' ? 'alert' : 'status'} className={cx('flex gap-3 rounded-lg border p-3 text-sm', box, className)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="flex-1 space-y-1">
        {title && <p className="font-medium">{title}</p>}
        {children && <div>{children}</div>}
      </div>
      {action}
    </div>
  );
}

export function Badge({ className, children }) {
  return (
    <span className={cx('inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset', className)}>
      {children}
    </span>
  );
}

export function StatusBadge({ status }) {
  const active = status === 'ACTIVE';
  return (
    <Badge className={active ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' : 'bg-slate-100 text-slate-600 ring-slate-500/20'}>
      <span className={cx('mr-1.5 h-1.5 w-1.5 rounded-full', active ? 'bg-emerald-500' : 'bg-slate-400')} />
      {active ? 'Active' : 'Inactive'}
    </Badge>
  );
}

export function PageHeader({ title, description, actions }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, description, actions, children, className, bodyClassName }) {
  return (
    <section className={cx('card', className)}>
      {(title || actions) && (
        <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            {title && <h2 className="text-sm font-semibold text-slate-900">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
          </div>
          {actions}
        </header>
      )}
      <div className={cx('p-5', bodyClassName)}>{children}</div>
    </section>
  );
}

export function StatCard({ label, value, icon: Icon, tone = 'brand', hint }) {
  const tones = {
    brand: 'bg-brand-50 text-brand-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    sky: 'bg-sky-50 text-sky-600',
    slate: 'bg-slate-100 text-slate-600',
    purple: 'bg-purple-50 text-purple-600',
  };
  return (
    <div className="card flex items-center gap-4 p-5">
      {Icon && (
        <div className={cx('flex h-11 w-11 shrink-0 items-center justify-center rounded-lg', tones[tone])}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
      )}
      <div className="min-w-0">
        <p className="truncate text-sm text-slate-500">{label}</p>
        <p className="text-2xl font-semibold tabular-nums text-slate-900">{value ?? '—'}</p>
        {hint && <p className="text-xs text-slate-400">{hint}</p>}
      </div>
    </div>
  );
}

export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
      {Icon && (
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
          <Icon className="h-6 w-6 text-slate-400" aria-hidden="true" />
        </div>
      )}
      <p className="text-sm font-medium text-slate-900">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Modal({ open, onClose, title, description, children, footer, size = 'md' }) {
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-slate-900/50" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className={cx(
          'relative flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-xl outline-none sm:rounded-2xl',
          size === 'sm' ? 'sm:max-w-md' : 'sm:max-w-xl',
        )}
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 id="modal-title" className="text-base font-semibold text-slate-900">
              {title}
            </h2>
            {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">{footer}</footer>}
      </div>
    </div>
  );
}

export function ConfirmDialog({ open, title, message, confirmLabel = 'Confirm', tone = 'danger', loading, onConfirm, onCancel }) {
  return (
    <Modal
      open={open}
      onClose={loading ? undefined : onCancel}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm text-slate-600">{message}</p>
    </Modal>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="mb-5 border-b border-slate-200">
      <nav className="-mb-px flex gap-6 overflow-x-auto" aria-label="Tabs" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={value === t.value}
            onClick={() => onChange(t.value)}
            className={cx(
              'whitespace-nowrap border-b-2 px-1 pb-3 text-sm font-medium transition-colors',
              value === t.value
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700',
            )}
          >
            {t.label}
            {t.count != null && (
              <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{t.count}</span>
            )}
          </button>
        ))}
      </nav>
    </div>
  );
}

/** Label/value pair for profile pages. */
export function Detail({ label, value, className }) {
  return (
    <div className={className}>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-0.5 break-words text-sm font-medium text-slate-900">{value === 0 ? 0 : value || '—'}</dd>
    </div>
  );
}

/** Retryable error block for failed page loads. */
export function LoadError({ error, onRetry, title = "Couldn't load this page", message }) {
  return (
    <Alert
      type="error"
      title={title}
      action={
        onRetry && (
          <Button size="sm" variant="secondary" onClick={onRetry}>
            Retry
          </Button>
        )
      }
    >
      {message ?? error?.response?.data?.error?.message ?? 'Please try again.'}
    </Alert>
  );
}

const EMPLOYMENT_BADGE = {
  ACTIVE: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  INACTIVE: 'bg-slate-100 text-slate-600 ring-slate-500/20',
  ON_LEAVE: 'bg-amber-50 text-amber-800 ring-amber-600/20',
  RESIGNED: 'bg-red-50 text-red-700 ring-red-600/20',
  GRADUATED: 'bg-purple-50 text-purple-700 ring-purple-600/20',
  TRANSFERRED: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  UPCOMING: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  COMPLETED: 'bg-slate-100 text-slate-600 ring-slate-500/20',
  PROMOTED: 'bg-purple-50 text-purple-700 ring-purple-600/20',
  WITHDRAWN: 'bg-slate-100 text-slate-600 ring-slate-500/20',
  PUBLISHED: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  SCHEDULED: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  ONGOING: 'bg-amber-50 text-amber-800 ring-amber-600/20',
  DRAFT: 'bg-slate-100 text-slate-600 ring-slate-500/20',
  PAID: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  PARTIALLY_PAID: 'bg-amber-50 text-amber-800 ring-amber-600/20',
  UNPAID: 'bg-red-50 text-red-700 ring-red-600/20',
  CANCELLED: 'bg-slate-100 text-slate-500 ring-slate-500/20',
  PENDING: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  SUCCESS: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  FAILED: 'bg-red-50 text-red-700 ring-red-600/20',
  ARCHIVED: 'bg-slate-100 text-slate-500 ring-slate-500/20',
  ISSUED: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  RETURNED: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  LOST: 'bg-red-50 text-red-700 ring-red-600/20',
  SUBMITTED: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  LATE: 'bg-amber-50 text-amber-800 ring-amber-600/20',
  GRADED: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
};

/** Badge for any lifecycle status (student, employee, academic year, enrollment). */
export function LifecycleBadge({ status }) {
  const label = String(status ?? '').toLowerCase().replace(/_/g, ' ');
  return (
    <Badge className={EMPLOYMENT_BADGE[status] ?? EMPLOYMENT_BADGE.INACTIVE}>
      {label.charAt(0).toUpperCase() + label.slice(1)}
    </Badge>
  );
}

export function Pagination({ meta, onPageChange }) {
  if (!meta || meta.total === 0) return null;
  const from = (meta.page - 1) * meta.limit + 1;
  const to = Math.min(meta.total, meta.page * meta.limit);
  return (
    <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-100 px-5 py-3 text-sm text-slate-500 sm:flex-row">
      <p>
        Showing <span className="font-medium text-slate-700">{from}</span>–<span className="font-medium text-slate-700">{to}</span> of{' '}
        <span className="font-medium text-slate-700">{meta.total}</span>
      </p>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" disabled={meta.page <= 1} onClick={() => onPageChange(meta.page - 1)}>
          Previous
        </Button>
        <Button variant="secondary" size="sm" disabled={meta.page >= meta.totalPages} onClick={() => onPageChange(meta.page + 1)}>
          Next
        </Button>
      </div>
    </div>
  );
}
