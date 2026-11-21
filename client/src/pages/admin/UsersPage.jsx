import { Plus, Search, Users } from 'lucide-react';
import { useState } from 'react';
import { Alert, Badge, Button, Card, ConfirmDialog, EmptyState, PageHeader, Pagination, Spinner, StatusBadge } from '../../components/common/ui';
import { useAsync, useDebounced } from '../../hooks/useAsync';
import { useAuth, useToast } from '../../hooks/useAuth';
import { adminService } from '../../services/admin.service';
import { getErrorMessage } from '../../utils/errors';
import { formatDateTime } from '../../utils/format';
import ProfileAvatar from '../../components/common/ProfileAvatar';
import { ADMIN_ROLES, ROLE_BADGE, ROLE_LABELS, ROLES } from '../../utils/roles';
import CreateUserModal from './CreateUserModal';

export default function UsersPage() {
  const { user: me } = useAuth();
  const toast = useToast();
  const isSuper = me.role.key === ROLES.SUPER_ADMIN;

  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounced(search);

  const { data, error, loading, reload } = useAsync(
    () => adminService.listUsers({ search: debouncedSearch, role, status, page, limit: 10 }),
    [debouncedSearch, role, status, page],
  );

  const [createOpen, setCreateOpen] = useState(false);
  const [pendingToggle, setPendingToggle] = useState(null);
  const [toggling, setToggling] = useState(false);

  const roleFilterOptions = Object.values(ROLES).filter((r) => isSuper || r !== ROLES.SUPER_ADMIN);

  // School admins can't change other admins; nobody can change themselves.
  const canToggle = (u) => u.id !== me.id && (isSuper || !ADMIN_ROLES.includes(u.role.key));

  async function confirmToggle() {
    const target = pendingToggle;
    const next = target.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    setToggling(true);
    try {
      await adminService.setUserStatus(target.id, next);
      toast.success(`${target.fullName} ${next === 'ACTIVE' ? 'activated' : 'deactivated'}.`);
      setPendingToggle(null);
      reload();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setToggling(false);
    }
  }

  const resetToFirstPage = (setter) => (e) => {
    setter(e.target.value);
    setPage(1);
  };

  const items = data?.items ?? [];

  return (
    <>
      <PageHeader
        title="User accounts"
        description="Create sign-in accounts and control who can access the system."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> New account
          </Button>
        }
      />

      <Card bodyClassName="p-0">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 md:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              className="input pl-9"
              placeholder="Search by name, email or username"
              value={search}
              onChange={resetToFirstPage(setSearch)}
              aria-label="Search accounts"
            />
          </div>
          <select className="input md:w-44" value={role} onChange={resetToFirstPage(setRole)} aria-label="Filter by role">
            <option value="">All roles</option>
            {roleFilterOptions.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
          <select className="input md:w-40" value={status} onChange={resetToFirstPage(setStatus)} aria-label="Filter by status">
            <option value="">Any status</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </div>

        {error ? (
          <div className="p-4">
            <Alert
              type="error"
              title="Couldn't load accounts"
              action={
                <Button size="sm" variant="secondary" onClick={reload}>
                  Retry
                </Button>
              }
            >
              {getErrorMessage(error)}
            </Alert>
          </div>
        ) : loading && !data ? (
          <Spinner label="Loading accounts…" />
        ) : items.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No accounts found"
            description={search || role || status ? 'Try a different search or filter.' : 'Create the first account to get started.'}
          />
        ) : (
          <>
            {/* Table on lg+ (relative keeps sr-only cells inside the scroll box) */}
            <div className={`relative hidden overflow-x-auto lg:block ${loading ? 'opacity-60' : ''}`}>
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  <tr>
                    <th scope="col" className="px-5 py-3">Name</th>
                    <th scope="col" className="px-5 py-3">Role</th>
                    {isSuper && <th scope="col" className="px-5 py-3">School</th>}
                    <th scope="col" className="px-5 py-3">Status</th>
                    <th scope="col" className="hidden px-5 py-3 xl:table-cell">Last sign-in</th>
                    <th scope="col" className="px-5 py-3 text-right">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {items.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50/60">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <ProfileAvatar userId={u.id} name={u.fullName} size="sm" />
                          <div>
                            <p className="font-medium text-slate-900">
                              {u.fullName} {u.id === me.id && <span className="text-xs font-normal text-slate-400">(you)</span>}
                            </p>
                            <p className="text-xs text-slate-500">
                              {u.email}
                              {u.username ? ` · @${u.username}` : ''}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <Badge className={ROLE_BADGE[u.role.key]}>{ROLE_LABELS[u.role.key]}</Badge>
                      </td>
                      {isSuper && <td className="px-5 py-3 text-slate-600">{u.school?.code ?? '—'}</td>}
                      <td className="px-5 py-3">
                        <StatusBadge status={u.status} />
                      </td>
                      <td className="hidden whitespace-nowrap px-5 py-3 text-slate-500 xl:table-cell">{formatDateTime(u.lastLoginAt)}</td>
                      <td className="px-5 py-3 text-right">
                        {canToggle(u) && (
                          <Button
                            size="sm"
                            variant={u.status === 'ACTIVE' ? 'secondary' : 'primary'}
                            onClick={() => setPendingToggle(u)}
                          >
                            {u.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Cards below lg */}
            <ul className={`divide-y divide-slate-100 lg:hidden ${loading ? 'opacity-60' : ''}`}>
              {items.map((u) => (
                <li key={u.id} className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-900">{u.fullName}</p>
                      <p className="truncate text-xs text-slate-500">{u.email}</p>
                    </div>
                    <StatusBadge status={u.status} />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <Badge className={ROLE_BADGE[u.role.key]}>{ROLE_LABELS[u.role.key]}</Badge>
                    {canToggle(u) && (
                      <Button size="sm" variant="secondary" onClick={() => setPendingToggle(u)}>
                        {u.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <Pagination meta={data.meta} onPageChange={setPage} />
          </>
        )}
      </Card>

      <CreateUserModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(created) => {
          setCreateOpen(false);
          toast.success(`Account created for ${created.fullName}.`);
          setPage(1);
          reload();
        }}
      />

      <ConfirmDialog
        open={Boolean(pendingToggle)}
        title={pendingToggle?.status === 'ACTIVE' ? 'Deactivate account?' : 'Activate account?'}
        message={
          pendingToggle?.status === 'ACTIVE'
            ? `${pendingToggle?.fullName} will be signed out immediately and won't be able to sign in until the account is activated again.`
            : `${pendingToggle?.fullName} will be able to sign in again.`
        }
        confirmLabel={pendingToggle?.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
        tone={pendingToggle?.status === 'ACTIVE' ? 'danger' : 'primary'}
        loading={toggling}
        onConfirm={confirmToggle}
        onCancel={() => setPendingToggle(null)}
      />
    </>
  );
}
