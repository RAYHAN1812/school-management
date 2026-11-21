import { api, unwrap } from './api';

export const schoolDetailsService = {
  get: () => api.get('/school-details').then(unwrap),
  update: (payload) => api.patch('/school-details', payload).then(unwrap),
  delete: () => api.delete('/school-details').then(unwrap),
  upload: (file, category) => {
    const form = new FormData();
    form.append('image', file);
    return api.post(`/school-details/upload?category=${encodeURIComponent(category)}`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(unwrap);
  },
  createAlbum: (payload) => api.post('/school-details/albums', payload).then(unwrap),
  updateAlbum: (id, payload) => api.patch(`/school-details/albums/${id}`, payload).then(unwrap),
  deleteAlbum: (id) => api.delete(`/school-details/albums/${id}`).then(unwrap),
  createImage: (payload) => api.post('/school-details/gallery', payload).then(unwrap),
  updateImage: (id, payload) => api.patch(`/school-details/gallery/${id}`, payload).then(unwrap),
  deleteImage: (id) => api.delete(`/school-details/gallery/${id}`).then(unwrap),
};
