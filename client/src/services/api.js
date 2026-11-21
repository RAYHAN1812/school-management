import axios from 'axios';

// In dev Vite proxies /api to the server; in production Vercel/nginx rewrites /api
// to the backend so the auth cookie stays first-party. VITE_API_URL overrides both.
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/api',
  withCredentials: true,
  timeout: 20000,
  // Required by the API's CSRF check for cookie-authenticated writes.
  headers: { 'X-Requested-With': 'XMLHttpRequest' },
});

// A super admin works on one school at a time; school users ignore this
// (the server pins them to their own school).
let activeSchoolId = null;
export function setActiveSchoolId(id) {
  activeSchoolId = id;
}

api.interceptors.request.use((config) => {
  if (activeSchoolId) config.headers['X-School-Id'] = activeSchoolId;
  return config;
});

let onUnauthorized = null;
/** AuthContext registers a handler so an expired session logs the user out everywhere. */
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const url = error.config?.url ?? '';
    const isAuthProbe = url.includes('/auth/login') || url.includes('/auth/me');
    if (status === 401 && !isAuthProbe && onUnauthorized) onUnauthorized();
    return Promise.reject(error);
  },
);

/** GET a file (CSV/PDF/XLSX) from the API and save it with the server's filename. */
export async function downloadFile(url, params, fallbackName = 'download') {
  const clean = Object.fromEntries(Object.entries(params ?? {}).filter(([, v]) => v !== '' && v != null));
  const res = await api.get(url, { params: clean, responseType: 'blob' });
  const name = /filename="([^"]+)"/.exec(res.headers['content-disposition'] ?? '')?.[1] ?? fallbackName;
  const href = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(href);
}

/** Unwrap the { success, data, meta } envelope. */
export const unwrap = (res) => res.data.data;
export const unwrapWithMeta = (res) => ({ items: res.data.data, meta: res.data.meta });
