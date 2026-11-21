import { api, unwrap } from './api';

export const portalService = {
  myStudents: () => api.get('/portal/students').then(unwrap),
  overview: (studentId) => api.get(`/students/${studentId}/overview`).then(unwrap),
};
