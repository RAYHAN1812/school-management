import { Archive, Megaphone, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Alert, Badge, Button, Card, ConfirmDialog, EmptyState, LifecycleBadge, LoadError, Modal, PageHeader, Pagination, Spinner, Tabs } from '../../components/common/ui';
import { AttachmentLink, FileUpload } from '../../components/forms/FileUpload';
import { SelectField, TextAreaField, TextField } from '../../components/forms/fields';
import { useArea } from '../../hooks/useArea';
import { useAsync } from '../../hooks/useAsync';
import { useAuth, useToast } from '../../hooks/useAuth';
import { useForm } from '../../hooks/useForm';
import { useClasses } from '../../hooks/useLookups';
import { noticeService } from '../../services/campus.service';
import { getErrorMessage } from '../../utils/errors';
import { formatDate, timeAgo } from '../../utils/format';
import { ROLES } from '../../utils/roles';

const AUDIENCE_LABEL = {
  ALL: 'Everyone',
  STUDENTS: 'Students',
  TEACHERS: 'Teachers',
  PARENTS: 'Parents',
  CLASS: 'Class',
  SECTION: 'Section',
  ADMINS: 'Administrators',
};

const audienceText = (n) =>
  n.audience === 'CLASS' ? `Class: ${n.class?.name}` : n.audience === 'SECTION' ? `${n.section?.class.name} ${n.section?.name}` : AUDIENCE_LABEL[n.audience];

export default function NoticesPage() {
  const { user } = useAuth();
  const canManage = [ROLES.SUPER_ADMIN, ROLES.SCHOOL_ADMIN, ROLES.TEACHER].includes(user.role.key);
  const [tab, setTab] = useState('board');
  return (
    <>
      <PageHeader title="Notices" description="School announcements for you." />
      {canManage && (
        <Tabs
          tabs={[
            { value: 'board', label: 'Notice board' },
            { value: 'manage', label: user.role.key === ROLES.TEACHER ? 'My notices' : 'Manage notices' },
          ]}
          value={tab}
          onChange={setTab}
        />
      )}
      {tab === 'board' ? <Board /> : <Manage />}
    </>
  );
}

function Board() {
  const [page, setPage] = useState(1);
  const list = useAsync(() => noticeService.list({ page, limit: 10 }), [page]);
  const [openId, setOpenId] = useState(null);

  async function open(n) {
    setOpenId(openId === n.id ? null : n.id);
    if (!n.read) {
      await noticeService.markRead(n.id).catch(() => {});
      n.read = true; // optimistic; refreshed on next load
    }
  }

  if (list.loading && !list.data) return <Spinner />;
  if (list.error) return <LoadError error={list.error} onRetry={list.reload} />;
  if (list.data.items.length === 0) {
    return (
      <Card>
        <EmptyState icon={Megaphone} title="No notices right now" />
      </Card>
    );
  }
  return (
    <Card bodyClassName="p-0" title={list.data.meta.unread ? `${list.data.meta.unread} unread` : 'All caught up'}>
      <ul className="divide-y divide-slate-100">
        {list.data.items.map((n) => (
          <li key={n.id}>
            <button type="button" onClick={() => open(n)} className="flex w-full items-start gap-3 px-5 py-4 text-left hover:bg-slate-50" aria-expanded={openId === n.id}>
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read ? 'bg-transparent' : 'bg-brand-600'}`} aria-label={n.read ? undefined : 'Unread'} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className={`text-slate-900 ${n.read ? 'font-medium' : 'font-semibold'}`}>{n.title}</p>
                  <Badge className="bg-slate-100 text-slate-600 ring-slate-500/20">{audienceText(n)}</Badge>
                </div>
                <p className="text-xs text-slate-500">
                  {n.createdBy.fullName} · {timeAgo(n.publishDate)}
                  {n.expiryDate ? ` · until ${formatDate(n.expiryDate)}` : ''}
                </p>
                {openId === n.id ? (
                  <div className="mt-3 space-y-2">
                    <p className="whitespace-pre-line text-sm text-slate-700">{n.description}</p>
                    {n.attachmentUrl && <AttachmentLink url={n.attachmentUrl} name="Attachment" />}
                  </div>
                ) : (
                  <p className="mt-1 line-clamp-1 text-sm text-slate-600">{n.description}</p>
                )}
              </div>
            </button>
          </li>
        ))}
      </ul>
      <Pagination meta={list.data.meta} onPageChange={setPage} />
    </Card>
  );
}

function Manage() {
  const toast = useToast();
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const list = useAsync(() => noticeService.list({ manage: 'true', status, page, limit: 15 }), [status, page]);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);

  async function setNoticeStatus(n, next) {
    try {
      await noticeService.update(n.id, { status: next });
      toast.success(next === 'ARCHIVED' ? 'Notice archived.' : 'Notice published.');
      list.reload();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await noticeService.remove(deleting.id);
      toast.success('Notice deleted.');
      list.reload();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
      setDeleting(null);
    }
  }

  return (
    <>
      <Card
        bodyClassName="p-0"
        title="Notices"
        actions={
          <div className="flex gap-2">
            <select className="input w-36 py-1.5" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label="Status">
              <option value="">Any status</option>
              <option value="PUBLISHED">Published</option>
              <option value="DRAFT">Draft</option>
              <option value="ARCHIVED">Archived</option>
            </select>
            <Button size="sm" onClick={() => setEditing('new')}>
              <Plus className="h-4 w-4" /> New notice
            </Button>
          </div>
        }
      >
        {list.loading && !list.data ? (
          <Spinner />
        ) : list.error ? (
          <div className="p-4">
            <LoadError error={list.error} onRetry={list.reload} />
          </div>
        ) : list.data.items.length === 0 ? (
          <EmptyState icon={Megaphone} title="No notices" />
        ) : (
          <>
            <ul className="divide-y divide-slate-100">
              {list.data.items.map((n) => (
                <li key={n.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">{n.title}</p>
                    <p className="text-xs text-slate-500">
                      {audienceText(n)} · {formatDate(n.publishDate)}
                      {n.isPublic && <span className="ml-2 font-medium text-emerald-700">Public website</span>}
                      {n.expiryDate ? ` → ${formatDate(n.expiryDate)}` : ''} · read by {n._count.reads}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <LifecycleBadge status={n.status} />
                    {n.status !== 'PUBLISHED' && (
                      <Button size="sm" variant="ghost" onClick={() => setNoticeStatus(n, 'PUBLISHED')}>
                        Publish
                      </Button>
                    )}
                    {n.status === 'PUBLISHED' && (
                      <Button size="sm" variant="ghost" onClick={() => setNoticeStatus(n, 'ARCHIVED')} aria-label="Archive">
                        <Archive className="h-4 w-4" />
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => setEditing(n)} aria-label="Edit">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setDeleting(n)} aria-label="Delete">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
            <Pagination meta={list.data.meta} onPageChange={setPage} />
          </>
        )}
      </Card>
      <NoticeModal
        open={Boolean(editing)}
        notice={editing === 'new' ? null : editing}
        onClose={() => setEditing(null)}
        onSaved={(n) => {
          toast.success(editing === 'new' ? (n.status === 'DRAFT' ? 'Draft saved.' : 'Notice published.') : 'Notice updated.');
          setEditing(null);
          list.reload();
        }}
      />
      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete this notice?"
        message={`"${deleting?.title}" will be removed for everyone. Archive it instead to keep a record.`}
        confirmLabel="Delete"
        loading={busy}
        onConfirm={remove}
        onCancel={() => setDeleting(null)}
      />
    </>
  );
}

const localInput = (d) => (d ? new Date(new Date(d).getTime() - new Date(d).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '');

function NoticeModal({ open, notice, onClose, onSaved }) {
  const { isTeacher } = useArea();
  const { user } = useAuth();
  const canSetPublic = [ROLES.SUPER_ADMIN, ROLES.SCHOOL_ADMIN].includes(user.role.key);
  const classes = useClasses();
  const empty = { title: '', description: '', audience: isTeacher ? 'CLASS' : 'ALL', classId: '', sectionId: '', publishDate: '', expiryDate: '', status: 'PUBLISHED', attachmentUrl: null, isPublic: false };
  const f = useForm(empty);

  useEffect(() => {
    if (!open) return;
    f.setValues(
      notice
        ? {
            title: notice.title,
            description: notice.description,
            audience: notice.audience,
            classId: notice.class?.id ?? '',
            sectionId: notice.section?.id ?? '',
            publishDate: localInput(notice.publishDate),
            expiryDate: localInput(notice.expiryDate),
            status: notice.status === 'ARCHIVED' ? 'PUBLISHED' : notice.status,
            attachmentUrl: notice.attachmentUrl,
            isPublic: Boolean(notice.isPublic),
          }
        : empty,
    );
    f.setErrors({});
    f.setSubmitError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, notice]);

  const klass = classes.data?.classes.find((c) => c.id === f.values.classId);
  const audiences = isTeacher ? ['CLASS', 'SECTION'] : Object.keys(AUDIENCE_LABEL);

  const onSubmit = f.submit(
    (v) => {
      const e = {};
      if (!v.title.trim()) e.title = 'Enter a title';
      if (!v.description.trim()) e.description = 'Write the notice';
      if (['CLASS', 'SECTION'].includes(v.audience) && !v.classId) e.classId = 'Choose a class';
      if (v.audience === 'SECTION' && !v.sectionId) e.sectionId = 'Choose a section';
      if (v.expiryDate && v.publishDate && v.expiryDate <= v.publishDate) e.expiryDate = 'Must be after publication';
      return e;
    },
    async (v) => {
      const payload = {
        title: v.title.trim(),
        description: v.description.trim(),
        audience: v.audience,
        classId: ['CLASS', 'SECTION'].includes(v.audience) ? v.classId : null,
        sectionId: v.audience === 'SECTION' ? v.sectionId : null,
        publishDate: v.publishDate ? new Date(v.publishDate).toISOString() : undefined,
        expiryDate: v.expiryDate ? new Date(v.expiryDate).toISOString() : null,
        status: v.status,
        attachmentUrl: v.attachmentUrl,
        ...(canSetPublic ? { isPublic: Boolean(v.isPublic && v.audience === 'ALL') } : {}),
      };
      try {
        onSaved(notice ? await noticeService.update(notice.id, payload) : await noticeService.create(payload));
      } catch (err) {
        f.handleApiError(err);
      }
    },
  );

  return (
    <Modal
      open={open}
      onClose={f.submitting ? undefined : onClose}
      title={notice ? 'Edit notice' : 'New notice'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={f.submitting}>
            Cancel
          </Button>
          <Button type="submit" form="notice-form" loading={f.submitting}>
            {f.values.status === 'DRAFT' ? 'Save draft' : notice ? 'Save' : 'Publish'}
          </Button>
        </>
      }
    >
      <form id="notice-form" onSubmit={onSubmit} noValidate className="space-y-4">
        {f.submitError && <Alert type="error">{f.submitError}</Alert>}
        <TextField label="Title" {...f.bind('title')} />
        <TextAreaField label="Notice" rows={5} {...f.bind('description')} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <SelectField
            label="Audience"
            options={audiences.map((a) => ({ value: a, label: AUDIENCE_LABEL[a] }))}
            {...f.bind('audience')}
            onChange={(e) => {
              f.setValue('audience', e.target.value);
              if (e.target.value !== 'ALL') f.setValue('isPublic', false);
            }}
          />
          {['CLASS', 'SECTION'].includes(f.values.audience) && (
            <SelectField label="Class" placeholder="Select" options={(classes.data?.classes ?? []).map((c) => ({ value: c.id, label: c.name }))} {...f.bind('classId')} />
          )}
          {f.values.audience === 'SECTION' && (
            <SelectField label="Section" placeholder="Select" options={(klass?.sections ?? []).map((s) => ({ value: s.id, label: `Section ${s.name}` }))} {...f.bind('sectionId')} />
          )}
        </div>
        {canSetPublic && f.values.audience === 'ALL' && (
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={Boolean(f.values.isPublic)}
              onChange={(e) => f.setValue('isPublic', e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            <span>
              <span className="block font-medium">Show on public school website</span>
              <span className="block text-xs text-slate-500">The notice text will be visible to anyone visiting the school website.</span>
            </span>
          </label>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <TextField label="Publish at" type="datetime-local" hint="Blank = now" {...f.bind('publishDate')} />
          <TextField label="Expires" type="datetime-local" hint="Optional" {...f.bind('expiryDate')} />
          <SelectField
            label="Status"
            options={[
              { value: 'PUBLISHED', label: 'Published' },
              { value: 'DRAFT', label: 'Draft' },
            ]}
            {...f.bind('status')}
          />
        </div>
        <FileUpload value={f.values.attachmentUrl} onChange={(url) => f.setValue('attachmentUrl', url)} />
      </form>
    </Modal>
  );
}
