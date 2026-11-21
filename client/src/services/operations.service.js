import { api, downloadFile, unwrap } from './api';

const clean = (params = {}) => Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v != null));

export const attendanceService = {
  mySections: () => api.get('/attendance/sections').then(unwrap),
  sheet: (params) => api.get('/attendance/sheet', { params }).then(unwrap),
  record: (data) => api.post('/attendance', data).then(unwrap),
  updateDay: (data) => api.put('/attendance', data).then(unwrap),
  report: (params) => api.get('/attendance/reports', { params: clean(params) }).then(unwrap),
  exportReport: (params) => downloadFile('/attendance/reports', { ...params, format: 'csv' }, 'attendance.csv'),
  studentSummary: (studentId, params) => api.get(`/students/${studentId}/attendance`, { params: clean(params) }).then(unwrap),
};

export const timetableService = {
  list: (params) => api.get('/timetables', { params: clean(params) }).then(unwrap),
  mine: (studentId) => api.get('/timetables/me', { params: clean({ studentId }) }).then(unwrap),
  create: (data) => api.post('/timetables', data).then(unwrap),
  update: (id, data) => api.patch(`/timetables/${id}`, data).then(unwrap),
  remove: (id) => api.delete(`/timetables/${id}`).then(unwrap),
};
