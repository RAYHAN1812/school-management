import { api, unwrap, unwrapWithMeta } from './api';

const clean = (params = {}) => Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v != null));

export const academicService = {
  listYears: () => api.get('/academic-years').then(unwrap),
  createYear: (data) => api.post('/academic-years', data).then(unwrap),
  updateYear: (id, data) => api.patch(`/academic-years/${id}`, data).then(unwrap),

  listClasses: (academicYearId) => api.get('/classes', { params: clean({ academicYearId }) }).then(unwrap),
  getClass: (id) => api.get(`/classes/${id}`).then(unwrap),
  createClass: (data) => api.post('/classes', data).then(unwrap),
  updateClass: (id, data) => api.patch(`/classes/${id}`, data).then(unwrap),
  classStudents: (id, sectionId) => api.get(`/classes/${id}/students`, { params: clean({ sectionId }) }).then(unwrap),
  setClassSubjects: (id, subjects) => api.put(`/classes/${id}/subjects`, { subjects }).then(unwrap),
  addSection: (classId, data) => api.post(`/classes/${classId}/sections`, data).then(unwrap),
  updateSection: (id, data) => api.patch(`/sections/${id}`, data).then(unwrap),
  promote: (data) => api.post('/classes/promote', data).then(unwrap),

  listSubjects: (search) => api.get('/subjects', { params: clean({ search }) }).then(unwrap),
  createSubject: (data) => api.post('/subjects', data).then(unwrap),
  updateSubject: (id, data) => api.patch(`/subjects/${id}`, data).then(unwrap),
};

export const studentService = {
  list: (params) => api.get('/students', { params: clean(params) }).then(unwrapWithMeta),
  get: (id) => api.get(`/students/${id}`).then(unwrap),
  create: (data) => api.post('/students', data).then(unwrap),
  update: (id, data) => api.patch(`/students/${id}`, data).then(unwrap),
  deactivate: (id) => api.delete(`/students/${id}`).then(unwrap),
  setEnrollment: (id, data) => api.put(`/students/${id}/enrollment`, data).then(unwrap),
  addGuardian: (id, data) => api.post(`/students/${id}/guardians`, data).then(unwrap),
  removeGuardian: (id, guardianId) => api.delete(`/students/${id}/guardians/${guardianId}`).then(unwrap),
  searchGuardians: (search) => api.get('/guardians', { params: clean({ search }) }).then(unwrap),
  createLogin: (id, account) => api.post(`/students/${id}/account`, account).then(unwrap),

  /** Download the filtered list as CSV (opens in Excel). */
  async exportCsv(params) {
    const res = await api.get('/students/export', { params: clean(params), responseType: 'blob' });
    const name = /filename="([^"]+)"/.exec(res.headers['content-disposition'] ?? '')?.[1] ?? 'students.csv';
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
};

export const teacherService = {
  list: (params) => api.get('/teachers', { params: clean(params) }).then(unwrapWithMeta),
  get: (id) => api.get(`/teachers/${id}`).then(unwrap),
  create: (data) => api.post('/teachers', data).then(unwrap),
  update: (id, data) => api.patch(`/teachers/${id}`, data).then(unwrap),
  createLogin: (id, account) => api.post(`/teachers/${id}/account`, account).then(unwrap),
};

export const staffService = {
  list: (params) => api.get('/staff', { params: clean(params) }).then(unwrapWithMeta),
  create: (data) => api.post('/staff', data).then(unwrap),
  update: (id, data) => api.patch(`/staff/${id}`, data).then(unwrap),
};
