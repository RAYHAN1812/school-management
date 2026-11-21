// Date-only values (DOB, admission date) are stored at UTC midnight, so format
// them in UTC or they'd show as the previous day west of Greenwich.
const dateFmt = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
const moneyFmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });

export const formatMoney = (value) => (value == null || value === '' ? '—' : `৳${moneyFmt.format(Number(value))}`);

/** ISO timestamp → "YYYY-MM-DD" for <input type="date">. */
export const toDateInput = (value) => (value ? String(value).slice(0, 10) : '');

/** MALE → "Male", FULL_TIME → "Full time" */
export function titleCase(value = '') {
  const s = String(value).toLowerCase().replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}
const dateTimeFmt = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export const formatDate = (value) => (value ? dateFmt.format(new Date(value)) : '—');
export const formatDateTime = (value) => (value ? dateTimeFmt.format(new Date(value)) : '—');

export function timeAgo(value) {
  if (!value) return '—';
  const seconds = Math.round((Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(value);
}

export function initials(name = '') {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');
}

// AUTH_LOGIN_FAILED → "Auth login failed"
export function humanizeAction(action = '') {
  const s = action.toLowerCase().replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}
