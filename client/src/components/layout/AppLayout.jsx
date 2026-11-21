import { GraduationCap, LogOut, Menu, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { ROLE_LABELS } from '../../utils/roles';
import { useSchool } from '../../context/SchoolContext';
import { ConfirmDialog, Spinner } from '../common/ui';
import { navFor } from './navConfig';
import { SCHOOL } from '../../config/school';
import ProfileAvatar from '../common/ProfileAvatar';

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white">
        <GraduationCap className="h-5 w-5" aria-hidden="true" />
      </div>
      <div className="leading-tight">
        <p className="text-sm font-semibold text-slate-900">{SCHOOL.name}</p>
        <p className="text-xs text-slate-500">{SCHOOL.nameBn}</p>
      </div>
    </div>
  );
}

function Sidebar({ roleKey, onNavigate }) {
  return (
    <nav aria-label="Main" className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
      {navFor(roleKey).map((group) => (
        <div key={group.section}>
          <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{group.section}</p>
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const Icon = item.icon;
              if (item.soon) {
                return (
                  <li key={item.label}>
                    <span
                      className="flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-400"
                      title="Coming in a later phase"
                      aria-disabled="true"
                    >
                      <Icon className="h-4 w-4" aria-hidden="true" />
                      <span className="flex-1">{item.label}</span>
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">Soon</span>
                    </span>
                  </li>
                );
              }
              return (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                        isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                      }`
                    }
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    {item.label}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export default function AppLayout() {
  const { user, logout } = useAuth();
  const { schools, schoolId, school, canSwitch, ready, selectSchool } = useSchool();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => setMobileOpen(false), [location.pathname]);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      setLoggingOut(false);
      setConfirmLogout(false);
      navigate('/login', { replace: true });
    }
  }

  const roleKey = user?.role?.key;

  return (
    <div className="min-h-screen lg:pl-64 print:pl-0">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-slate-200 bg-white lg:flex print:hidden">
        <div className="flex h-16 items-center border-b border-slate-100 px-5">
          <Brand />
        </div>
        <Sidebar roleKey={roleKey} />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setMobileOpen(false)} aria-hidden="true" />
          <aside className="relative flex h-full w-72 max-w-[85vw] flex-col bg-white shadow-xl">
            <div className="flex h-16 items-center justify-between border-b border-slate-100 px-5">
              <Brand />
              <button type="button" onClick={() => setMobileOpen(false)} className="rounded-md p-1 text-slate-500" aria-label="Close menu">
                <X className="h-5 w-5" />
              </button>
            </div>
            <Sidebar roleKey={roleKey} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <header className="sticky top-0 z-30 flex h-16 print:hidden items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-6">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="-ml-1 rounded-md p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          {canSwitch ? (
            <select
              className="-ml-1 max-w-full truncate rounded-md border-0 bg-transparent py-0.5 pl-1 pr-7 text-sm font-medium text-slate-900 focus:ring-2 focus:ring-brand-500"
              value={schoolId ?? ''}
              onChange={(e) => selectSchool(e.target.value)}
              aria-label="Working on school"
            >
              {schools.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          ) : (
            <p className="truncate text-sm font-medium text-slate-900">{school?.name ?? user?.school?.name ?? 'All schools'}</p>
          )}
          <p className="truncate text-xs text-slate-500">{ROLE_LABELS[roleKey]}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden text-right sm:block">
            <p className="text-sm font-medium text-slate-900">{user?.fullName}</p>
            <p className="text-xs text-slate-500">{user?.email}</p>
          </div>
          <NavLink to="/account/profile" aria-label="Open my profile">
            <ProfileAvatar userId={user?.id} name={user?.fullName} size="sm" />
          </NavLink>
          <button
            type="button"
            onClick={() => setConfirmLogout(true)}
            className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 print:max-w-none print:p-0">
        {/* Remount pages when a super admin switches school so all data reloads. */}
        {ready ? <Outlet key={schoolId ?? 'none'} /> : <Spinner />}
      </main>

      <ConfirmDialog
        open={confirmLogout}
        title="Sign out?"
        message={`You'll need to sign in again to access ${SCHOOL.name}.`}
        confirmLabel="Sign out"
        tone="primary"
        loading={loggingOut}
        onConfirm={handleLogout}
        onCancel={() => setConfirmLogout(false)}
      />
    </div>
  );
}
