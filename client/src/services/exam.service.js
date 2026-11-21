import { api, unwrap } from './api';

const clean = (params = {}) => Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v != null));

export const examService = {
  list: (params) => api.get('/exams', { params: clean(params) }).then(unwrap),
  get: (id) => api.get(`/exams/${id}`).then(unwrap),
  create: (data) => api.post('/exams', data).then(unwrap),
  update: (id, data) => api.patch(`/exams/${id}`, data).then(unwrap),
  marksSheet: (id, subjectId, sectionId) => api.get(`/exams/${id}/marks`, { params: clean({ subjectId, sectionId }) }).then(unwrap),
  enterMarks: (id, subjectId, marks) => api.post(`/exams/${id}/marks`, { subjectId, marks }).then(unwrap),
  results: (id, sectionId) => api.get(`/exams/${id}/results`, { params: clean({ sectionId }) }).then(unwrap),
  publish: (id) => api.post(`/exams/${id}/publish`).then(unwrap),
  unpublish: (id) => api.post(`/exams/${id}/unpublish`).then(unwrap),
  reportCard: (id, studentId) => api.get(`/exams/${id}/report-card/${studentId}`).then(unwrap),
  studentResults: (studentId) => api.get(`/students/${studentId}/results`).then(unwrap),
  gradeScale: () => api.get('/grade-scales').then(unwrap),
  setGradeScale: (bands) => api.put('/grade-scales', { bands }).then(unwrap),
};
