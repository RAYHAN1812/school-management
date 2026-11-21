import { useEffect, useState } from 'react';
import { Alert, Button } from '../common/ui';
import { profilePhotoService } from '../../services/profile.service';
import { getErrorMessage } from '../../utils/errors';

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export default function ProfilePhotoUpload({ userId, name, onUploaded, onRemoved }) {
  const [preview, setPreview] = useState('');
  const [file, setFile] = useState(null);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview]);

  function selectFile(event) {
    const selected = event.target.files?.[0];
    if (!selected) return;
    setMessage(null);
    if (!ALLOWED_TYPES.has(selected.type)) {
      setMessage({ type: 'error', text: 'Only JPG, JPEG, PNG and WebP images are supported.' });
      event.target.value = '';
      return;
    }
    if (selected.size > 2 * 1024 * 1024) {
      setMessage({ type: 'error', text: 'Profile photo must be 2 MB or smaller.' });
      event.target.value = '';
      return;
    }
    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(selected));
    setFile(selected);
  }

  async function upload() {
    if (!file) return;
    setUploading(true);
    setProgress(0);
    setMessage(null);
    try {
      await profilePhotoService.upload(file, (event) => {
        if (event.total) setProgress(Math.round((event.loaded * 100) / event.total));
      });
      setMessage({ type: 'success', text: 'Profile photo uploaded.' });
      setFile(null);
      onUploaded?.();
    } catch (error) {
      setMessage({ type: 'error', text: getErrorMessage(error) });
    } finally {
      setUploading(false);
    }
  }

  async function remove() {
    setRemoving(true);
    setMessage(null);
    try {
      await profilePhotoService.remove();
      if (preview) URL.revokeObjectURL(preview);
      setPreview('');
      setFile(null);
      setMessage({ type: 'success', text: 'Profile photo removed.' });
      onRemoved?.();
    } catch (error) {
      setMessage({ type: 'error', text: getErrorMessage(error) });
    } finally {
      setRemoving(false);
    }
  }

  const initials = String(name ?? '').split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  const photoSrc = preview || (userId ? `/api/profile/photo/${encodeURIComponent(userId)}?t=${Date.now()}` : '');

  return (
    <div className="space-y-4">
      {message && <Alert type={message.type}>{message.text}</Alert>}
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
        <div className="h-24 w-24 overflow-hidden rounded-full bg-brand-100">
          {photoSrc ? (
            <img src={photoSrc} alt={`${name} profile`} className="h-full w-full object-cover" onError={(event) => event.currentTarget.style.display = 'none'} />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-2xl font-semibold text-brand-700">{initials || 'U'}</div>
          )}
        </div>
        <div className="space-y-2">
          <label className="inline-flex cursor-pointer items-center rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <input type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" className="sr-only" onChange={selectFile} disabled={uploading || removing} />
            Choose photo
          </label>
          <p className="text-xs text-slate-500">JPG, JPEG, PNG or WebP · Maximum 2 MB</p>
        </div>
      </div>
      {(file || preview) && (
        <div className="flex flex-wrap gap-2">
          {file && <Button onClick={upload} loading={uploading}>Upload photo</Button>}
          <Button variant="secondary" onClick={remove} loading={removing} disabled={uploading}>Remove photo</Button>
        </div>
      )}
      {uploading && (
        <div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full bg-brand-600 transition-all" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-1 text-xs text-slate-500">Uploading {progress}%</p>
        </div>
      )}
    </div>
  );
}
