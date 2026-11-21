import { FileText, Loader2, Paperclip, X } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { uploadService } from '../../services/campus.service';
import { getErrorMessage } from '../../utils/errors';

const ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp,.docx,.xlsx';
const MAX = 5 * 1024 * 1024;

/**
 * Upload one attachment and report its server URL via onChange(url | null).
 * `value` is the current URL (e.g. when editing).
 */
export function FileUpload({ label = 'Attachment', value, onChange, hint = 'PDF, image, Word or Excel · up to 5 MB' }) {
  const id = useId();
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [name, setName] = useState('');

  async function pick(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX) {
      setError('That file is larger than 5 MB.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const uploaded = await uploadService.upload(file);
      setName(uploaded.name);
      onChange(uploaded.url);
    } catch (err) {
      setError(getErrorMessage(err, 'Upload failed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <span className="label">{label}</span>
      {value ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
          <AttachmentLink url={value} name={name || 'Attached file'} />
          <button type="button" onClick={() => { onChange(null); setName(''); }} className="rounded p-1 text-slate-400 hover:text-slate-700" aria-label="Remove attachment">
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <>
          <input id={id} ref={input} type="file" accept={ACCEPT} className="sr-only" onChange={pick} />
          <label
            htmlFor={id}
            className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-3 text-sm text-slate-600 hover:border-brand-400 hover:bg-brand-50/40"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
            {busy ? 'Uploading…' : 'Choose a file'}
          </label>
        </>
      )}
      {error ? <p className="mt-1.5 text-xs text-red-600">{error}</p> : <p className="mt-1.5 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

/** Link to an uploaded file. The browser sends the session cookie, so it stays private. */
export function AttachmentLink({ url, name = 'Attachment' }) {
  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex min-w-0 items-center gap-1.5 font-medium text-brand-600 hover:text-brand-700">
      <FileText className="h-4 w-4 shrink-0" />
      <span className="truncate">{name}</span>
    </a>
  );
}
