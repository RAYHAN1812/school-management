import { Card, PageHeader } from '../../components/common/ui';
import ProfilePhotoUpload from '../../components/profile/ProfilePhotoUpload';
import { useAuth } from '../../hooks/useAuth';
import { formatDateTime } from '../../utils/format';

export default function ProfilePage() {
  const { user, refresh } = useAuth();
  if (!user) return null;

  return (
    <>
      <PageHeader title="My profile" description="Manage your account and profile photo." />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card title="Profile photo" className="lg:col-span-2">
          <ProfilePhotoUpload
            userId={user.id}
            name={user.fullName}
            onUploaded={refresh}
            onRemoved={refresh}
          />
        </Card>
        <Card title="Account details">
          <dl className="space-y-4 text-sm">
            <div>
              <dt className="text-xs text-slate-500">Name</dt>
              <dd className="mt-0.5 font-medium text-slate-900">{user.fullName}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Email</dt>
              <dd className="mt-0.5 break-words font-medium text-slate-900">{user.email}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Role</dt>
              <dd className="mt-0.5 font-medium text-slate-900">{user.role?.name}</dd>
            </div>
            {user.lastLoginAt && (
              <div>
                <dt className="text-xs text-slate-500">Last login</dt>
                <dd className="mt-0.5 font-medium text-slate-900">{formatDateTime(user.lastLoginAt)}</dd>
              </div>
            )}
          </dl>
        </Card>
      </div>
    </>
  );
}
