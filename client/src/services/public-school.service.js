import { api, unwrap } from './api';

export const publicSchoolService = {
  get: () => api.get('/public/school').then(unwrap),
};

export const publicSchoolImageUrl = (imagePath) =>
  `${(api.defaults.baseURL ?? '/api').replace(/\/$/, '')}/public/school/image/${encodeURIComponent(imagePath)}`;
