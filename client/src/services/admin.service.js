import { api, unwrap, unwrapWithMeta } from './api';

// Drop empty filters so they don't end up as ?role= in the URL.
const clean = (params) => Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v != null));

export const adminService = {
  listUsers: (params) => api.get('/users', { params: clean(params) }).then(unwrapWithMeta),
  setUserStatus: (id, status) => api.patch(`/users/${id}/status`, { status }).then(unwrap),
  listSchools: () => api.get('/schools').then(unwrap),
  listAuditLogs: (params) => api.get('/audit-logs', { params: clean(params) }).then(unwrapWithMeta),
};

// The browser's local date, so "today" matches the user's timezone.
const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const dashboardService = {
  summary: () => api.get('/dashboard/summary', { params: { date: localToday() } }).then(unwrap),
};

export const reportService = {
  types: () => api.get('/reports').then(unwrap),
  run: (type, params) => api.get(`/reports/${type}`, { params: clean(params) }).then(unwrap),
};
