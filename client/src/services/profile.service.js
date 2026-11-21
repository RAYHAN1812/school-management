import { api, unwrap } from './api';

export const profilePhotoService = {
  upload: (file, onUploadProgress) => {
    const form = new FormData();
    form.append('photo', file);
    return api.post('/profile/photo', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress,
    }).then(unwrap);
  },
  remove: () => api.delete('/profile/photo').then(unwrap),
  supabaseStatus: () => api.get('/supabase/status').then(unwrap),
};
