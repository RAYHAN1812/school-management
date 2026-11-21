import { api, unwrap } from './api';

export const authService = {
  login: (identifier, password) => api.post('/auth/login', { identifier, password }).then(unwrap),
  logout: () => api.post('/auth/logout').then(unwrap),
  me: () => api.get('/auth/me').then(unwrap),
  register: (payload) => api.post('/auth/register', payload).then(unwrap),
  forgotPassword: (email) => api.post('/auth/forgot-password', { email }).then(unwrap),
  resetPassword: (token, password) => api.post('/auth/reset-password', { token, password }).then(unwrap),
  changePassword: (currentPassword, newPassword) =>
    api.post('/auth/change-password', { currentPassword, newPassword }).then(unwrap),
};
