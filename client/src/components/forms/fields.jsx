import { Check, Eye, EyeOff, X } from 'lucide-react';
import { useId, useState } from 'react';
import { PASSWORD_CHECKS } from '../../utils/password';

const cx = (...c) => c.filter(Boolean).join(' ');

function FieldShell({ id, label, error, hint, children, required }) {
  return (
    <div>
      {label && (
        <label htmlFor={id} className="label">
          {label}
          {required && <span className="ml-0.5 text-red-500">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-xs text-red-600">
          {error}
        </p>
      ) : (
        hint && <p className="mt-1.5 text-xs text-slate-500">{hint}</p>
      )}
    </div>
  );
}

export function TextField({ label, error, hint, className, required, ...props }) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} error={error} hint={hint} required={required}>
      <input
        id={id}
        className={cx('input', error && 'input-error', className)}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        required={required}
        {...props}
      />
    </FieldShell>
  );
}

export function SelectField({ label, error, hint, options, placeholder, required, ...props }) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} error={error} hint={hint} required={required}>
      <select
        id={id}
        className={cx('input', error && 'input-error')}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        required={required}
        {...props}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

export function TextAreaField({ label, error, hint, required, rows = 3, ...props }) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} error={error} hint={hint} required={required}>
      <textarea
        id={id}
        rows={rows}
        className={cx('input resize-y', error && 'input-error')}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        required={required}
        {...props}
      />
    </FieldShell>
  );
}

export function CheckboxField({ label, description, checked, onChange, disabled }) {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
      />
      <label htmlFor={id} className="text-sm">
        <span className="font-medium text-slate-800">{label}</span>
        {description && <span className="block text-slate-500">{description}</span>}
      </label>
    </div>
  );
}

/** Form section with a heading, used on long forms. */
export function FormSection({ title, description, children }) {
  return (
    <section className="grid grid-cols-1 gap-x-8 gap-y-4 border-b border-slate-100 py-6 first:pt-0 last:border-0 lg:grid-cols-3">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      <div className="space-y-4 lg:col-span-2">{children}</div>
    </section>
  );
}

export function PasswordField({ label = 'Password', error, hint, showChecks = false, value = '', required, ...props }) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  return (
    <FieldShell id={id} label={label} error={error} hint={showChecks ? undefined : hint} required={required}>
      <div className="relative">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          className={cx('input pr-10', error && 'input-error')}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          value={value}
          required={required}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-slate-600"
          aria-label={visible ? 'Hide password' : 'Show password'}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {showChecks && (
        <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-3" aria-label="Password requirements">
          {PASSWORD_CHECKS.map((c) => {
            const passed = c.test(value);
            return (
              <li key={c.id} className={cx('flex items-center gap-1 text-xs', passed ? 'text-emerald-600' : 'text-slate-400')}>
                {passed ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                {c.label}
              </li>
            );
          })}
        </ul>
      )}
    </FieldShell>
  );
}
