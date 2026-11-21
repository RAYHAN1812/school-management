import { useEffect, useState } from 'react';
import { Alert, Button, Card, ConfirmDialog, EmptyState, LoadError, PageHeader, Spinner, Tabs } from '../../components/common/ui';
import { TextAreaField, TextField } from '../../components/forms/fields';
import { useAsync } from '../../hooks/useAsync';
import { useAuth, useToast } from '../../hooks/useAuth';
import { schoolDetailsService } from '../../services/school-details.service';
import { getErrorMessage } from '../../utils/errors';
import { ROLES } from '../../utils/roles';
import { SCHOOL } from '../../config/school';

const SECTIONS = [
  { value: 'identity', label: 'About the School', fields: [
    ['nameBn', 'Bengali school name'], ['aboutUs', 'About Us'], ['introduction', 'School introduction'],
    ['history', 'History and background'], ['educationalPhilosophy', 'Educational philosophy'],
    ['objectives', 'Objectives and motives'], ['mission', 'Mission'], ['vision', 'Vision'],
    ['coreValues', 'Core values'], ['principalMessage', 'Message from the Headmaster/Principal'],
  ] },
  { value: 'academic', label: 'Academic Information', fields: [
    ['academicPrograms', 'Academic programmes'], ['educationLevels', 'Education levels and classes'],
    ['teachingApproach', 'Teaching and learning approach'], ['academicCalendar', 'Academic calendar'],
    ['examinationInfo', 'Examination information'], ['achievements', 'Academic achievements'],
    ['specialPrograms', 'Special educational programmes'],
  ] },
  { value: 'activities', label: 'Activities & Events', fields: [
    ['activities', 'Scouts, study tours, sports, cultural programmes, science fairs, debates, national day celebrations and other activities'],
  ] },
  { value: 'awards', label: 'Awards & Achievements', fields: [
    ['awards', 'School, student, teacher, academic and sports awards, competition results and milestones'],
  ] },
];

export default function SchoolDetailsPage() {
  const { user } = useAuth();
  const toast = useToast();
  const canManage = user?.role?.key === ROLES.SUPER_ADMIN;
  const details = useAsync(() => schoolDetailsService.get(), []);
  const [tab, setTab] = useState('identity');
  const [values, setValues] = useState({});
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(null);
  const [deletingDetails, setDeletingDetails] = useState(false);

  useEffect(() => {
    if (details.data) setValues(details.data);
  }, [details.data]);

  const section = SECTIONS.find((item) => item.value === tab);

  async function save(payload = values) {
    if (!canManage) return;
    setSaving(true);
    try {
      await schoolDetailsService.update(payload);
      toast.success('School information saved.');
      details.reload();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function uploadImage(event, category) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const result = await schoolDetailsService.upload(file, category);
      await schoolDetailsService.update(category === 'logo' ? { logoUrl: result.imageUrl } : { coverUrl: result.imageUrl });
      toast.success(`${category === 'logo' ? 'School logo' : 'Cover image'} uploaded.`);
      details.reload();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      event.target.value = '';
    }
  }

  async function deleteDetails() {
    if (!canManage) return;
    setDeletingDetails(true);
    try {
      await schoolDetailsService.delete();
      toast.success('School details removed. Gallery entries and stored images are unchanged.');
      setRemoving(null);
      details.reload();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setDeletingDetails(false);
    }
  }

  if (details.loading && !details.data) return <Spinner />;
  if (details.error) return <LoadError error={details.error} onRetry={details.reload} />;

  const logoUrl = values.logoUrl ? `/api/school-details/image/${encodeURIComponent(values.logoUrl)}?t=${Date.now()}` : null;
  const coverUrl = values.coverUrl ? `/api/school-details/image/${encodeURIComponent(values.coverUrl)}?t=${Date.now()}` : null;

  return (
    <>
      <PageHeader
        title="School Details"
        description={`${SCHOOL.name} · ${SCHOOL.nameBn} · ${canManage ? 'Super Admin management' : 'Published information'}`}
        actions={canManage && <Button variant="danger" onClick={() => setRemoving(true)}>Delete school details</Button>}
      />
      <Tabs tabs={SECTIONS.map(({ value, label }) => ({ value, label }))} value={tab} onChange={setTab} />

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card title="Identity" className="lg:col-span-1">
          <div className="space-y-4">
            {coverUrl && (
              <img src={coverUrl} alt="Ratonpur Central School cover" className="h-32 w-full rounded-lg object-cover" />
            )}
            {logoUrl && (
              <img src={logoUrl} alt="Ratonpur Central School logo" className="h-20 w-20 rounded-lg object-contain" />
            )}
            <div>
              <p className="text-xs text-slate-500">English name</p>
              <p className="font-semibold text-slate-900">{SCHOOL.name}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Bengali name</p>
              <p className="font-semibold text-slate-900">{SCHOOL.nameBn}</p>
            </div>
            {canManage && (
              <div className="space-y-3">
                <label className="block">
                  <span className="label">School logo</span>
                  <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => uploadImage(event, 'logo')} className="mt-1 block w-full text-sm" />
                </label>
                <label className="block">
                  <span className="label">Cover / banner</span>
                  <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => uploadImage(event, 'cover')} className="mt-1 block w-full text-sm" />
                </label>
              </div>
            )}
            {canManage && (
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={Boolean(values.published)}
                  onChange={(event) => setValues((current) => ({ ...current, published: event.target.checked }))}
                />
                Published
              </label>
            )}
          </div>
        </Card>

        <Card title={section.label} className="lg:col-span-2">
          {canManage ? (
            <div className="space-y-4">
              {section.fields.map(([key, label]) => (
                key === 'nameBn'
                  ? <TextField key={key} label={label} value={values[key] ?? ''} onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value }))} />
                  : <TextAreaField key={key} label={label} rows={5} value={values[key] ?? ''} onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value }))} />
              ))}
              <Button onClick={() => save()} loading={saving}>Save information</Button>
            </div>
          ) : (
            <div className="space-y-5">
              {section.fields.map(([key, label]) => (
                <div key={key}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{values[key] || 'Information to be added.'}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <GallerySection details={details.data} canManage={canManage} onChanged={() => details.reload()} />
      <ConfirmDialog
        open={Boolean(removing)}
        title="Delete school details?"
        message="This removes the school introduction, academic information, mission and vision. Gallery entries and stored images are preserved."
        confirmLabel="Delete details"
        loading={deletingDetails}
        onConfirm={deleteDetails}
        onCancel={() => setRemoving(null)}
      />
    </>
  );
}

function GallerySection({ details, canManage, onChanged }) {
  const toast = useToast();
  const [uploading, setUploading] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [busy, setBusy] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('Events and celebrations');
  const albums = details?.albums ?? [];
  const galleryImages = details?.galleryImages ?? [];
  const galleryCategories = [
    'Campus',
    'Classrooms',
    'Teachers and staff',
    'Scouts',
    'Study tours',
    'Sports',
    'Cultural programmes',
    'Events and celebrations',
    'National day celebrations',
    'Awards and ceremonies',
  ];

  async function uploadGallery(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const category = event.target.dataset.category || 'School activities';
      const uploaded = await schoolDetailsService.upload(file, category);
      await schoolDetailsService.createImage({
        title: file.name.replace(/\.[^.]+$/, ''),
        caption: '',
        category,
        imageUrl: uploaded.imageUrl,
        published: true,
      });
      toast.success('Gallery image uploaded.');
      onChanged();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  }

  async function removeConfirmed() {
    setBusy(true);
    try {
      await schoolDetailsService.deleteImage(pendingDelete.id);
      toast.success('Gallery image deleted.');
      setPendingDelete(null);
      onChanged();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  function renderImage(image) {
    return (
      <div key={image.id} className="overflow-hidden rounded-lg border border-slate-200">
        <img
          src={`/api/school-details/image/${encodeURIComponent(image.imageUrl)}`}
          alt={image.caption || image.title}
          className="h-40 w-full bg-slate-100 object-cover"
        />
        <div className="p-3">
          <p className="font-medium text-slate-900">{image.title}</p>
          {image.caption && <p className="mt-1 text-sm text-slate-500">{image.caption}</p>}
          {canManage && <Button size="sm" variant="ghost" className="mt-2" onClick={() => setPendingDelete(image)}>Delete</Button>}
        </div>
      </div>
    );
  }

  return (
    <Card title="Photo Gallery" description="Campus, classrooms, teachers, students, sports, cultural events, awards and special occasions." className="mt-6">
      {canManage && (
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="block">
            <span className="label">Public photo category</span>
            <select className="input sm:w-64" value={selectedCategory} onChange={(event) => setSelectedCategory(event.target.value)}>
              {galleryCategories.map((category) => <option key={category} value={category}>{category}</option>)}
            </select>
          </label>
          <label className="inline-flex cursor-pointer items-center rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700">
            <input data-category={selectedCategory} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={uploadGallery} disabled={uploading} />
            Upload gallery image
          </label>
        </div>
      )}
      {albums.length === 0 && galleryImages.length === 0 ? (
        <EmptyState title="No published gallery images" description="The Super Admin can add school photos and albums here." />
      ) : (
        <div className="space-y-6">
          {albums.map((album) => (
            <section key={album.id} className="space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">{album.title}</h3>
                {album.description && <p className="mt-1 text-sm text-slate-500">{album.description}</p>}
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {(album.images ?? []).map(renderImage)}
              </div>
            </section>
          ))}
          {galleryImages.length > 0 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {galleryImages.map(renderImage)}
            </div>
          )}
        </div>
      )}
      <ConfirmDialog open={Boolean(pendingDelete)} title="Delete gallery image?" message="This removes the gallery entry and its stored image." confirmLabel="Delete" loading={busy} onConfirm={removeConfirmed} onCancel={() => setPendingDelete(null)} />
    </Card>
  );
}
