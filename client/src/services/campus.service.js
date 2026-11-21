import { api, unwrap, unwrapWithMeta } from './api';

const clean = (params = {}) => Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v != null));

export const uploadService = {
  upload(file) {
    const form = new FormData();
    form.append('file', file);
    return api.post('/uploads', form, { timeout: 60000 }).then(unwrap);
  },
};

export const homeworkService = {
  list: (params) => api.get('/assignments', { params: clean(params) }).then(unwrap),
  get: (id) => api.get(`/assignments/${id}`).then(unwrap),
  create: (data) => api.post('/assignments', data).then(unwrap),
  update: (id, data) => api.patch(`/assignments/${id}`, data).then(unwrap),
  remove: (id) => api.delete(`/assignments/${id}`).then(unwrap),
  submissions: (id) => api.get(`/assignments/${id}/submissions`).then(unwrap),
  submit: (id, data) => api.post(`/assignments/${id}/submissions`, data).then(unwrap),
  grade: (submissionId, data) => api.patch(`/submissions/${submissionId}/grade`, data).then(unwrap),
};

export const noticeService = {
  list: (params) => api.get('/notices', { params: clean(params) }).then(unwrapWithMeta),
  get: (id) => api.get(`/notices/${id}`).then(unwrap),
  create: (data) => api.post('/notices', data).then(unwrap),
  update: (id, data) => api.patch(`/notices/${id}`, data).then(unwrap),
  remove: (id) => api.delete(`/notices/${id}`).then(unwrap),
  markRead: (id) => api.post(`/notices/${id}/read`).then(unwrap),
};

export const libraryService = {
  books: (params) => api.get('/books', { params: clean(params) }).then(unwrapWithMeta),
  createBook: (data) => api.post('/books', data).then(unwrap),
  updateBook: (id, data) => api.patch(`/books/${id}`, data).then(unwrap),
  issue: (bookId, data) => api.post(`/books/${bookId}/issue`, data).then(unwrap),
  returnBook: (bookId, studentId) => api.post(`/books/${bookId}/return`, { studentId }).then(unwrap),
  issues: (params) => api.get('/book-issues', { params: clean(params) }).then(unwrapWithMeta),
  stats: () => api.get('/library/stats').then(unwrap),
  studentLibrary: (studentId) => api.get(`/students/${studentId}/library`).then(unwrap),
};

export const transportService = {
  buses: () => api.get('/buses').then(unwrap),
  createBus: (data) => api.post('/buses', data).then(unwrap),
  updateBus: (id, data) => api.patch(`/buses/${id}`, data).then(unwrap),
  routes: () => api.get('/transport-routes').then(unwrap),
  route: (id) => api.get(`/transport-routes/${id}`).then(unwrap),
  createRoute: (data) => api.post('/transport-routes', data).then(unwrap),
  updateRoute: (id, data) => api.patch(`/transport-routes/${id}`, data).then(unwrap),
  assign: (routeId, data) => api.post(`/transport-routes/${routeId}/students`, data).then(unwrap),
  unassign: (studentId) => api.delete(`/transport-assignments/${studentId}`).then(unwrap),
  studentTransport: (studentId) => api.get(`/students/${studentId}/transport`).then(unwrap),
};
