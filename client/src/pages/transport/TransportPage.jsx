import { Bus, MapPin, Pencil, Plus, Trash2, UserPlus, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Alert, Badge, Button, Card, ConfirmDialog, EmptyState, LoadError, Modal, PageHeader, Spinner, Tabs } from '../../components/common/ui';
import { SelectField, TextAreaField, TextField } from '../../components/forms/fields';
import { useAsync } from '../../hooks/useAsync';
import { useAuth, useToast } from '../../hooks/useAuth';
import { isPhone, useForm } from '../../hooks/useForm';
import { transportService } from '../../services/campus.service';
import { staffService, teacherService } from '../../services/school.service';
import ProfileAvatar from '../../components/common/ProfileAvatar';
import { ROLES } from '../../utils/roles';
import { getErrorMessage } from '../../utils/errors';
import { formatMoney } from '../../utils/format';
import { StudentPicker } from '../library/LibraryPage';

export default function TransportPage() {
  const [tab, setTab] = useState('routes');
  return (
    <>
      <PageHeader title="Transport" description="Bus routes, vehicles, drivers and the students who ride." />
      <Tabs
        tabs={[
          { value: 'routes', label: 'Routes' },
          { value: 'buses', label: 'Buses' },
          { value: 'teachers', label: 'Teachers' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'routes' ? <Routes /> : tab === 'buses' ? <Buses /> : <TransportTeachers />}
    </>
  );
}

function TransportTeachers() {
  const { user } = useAuth();
  const canManage = user?.role?.key === ROLES.SUPER_ADMIN;
  const teachers = useAsync(() => teacherService.list({ page: 1, limit: 100 }), []);

  if (teachers.loading && !teachers.data) return <Spinner />;
  if (teachers.error) return <LoadError error={teachers.error} onRetry={teachers.reload} />;
  const items = teachers.data?.items ?? [];

  return (
    <Card
      title="School teachers"
      description="Registered teacher directory for Ratonpur Central School."
      actions={
        canManage ? (
          <Link to="/admin/teachers/new">
            <Button size="sm"><Plus className="h-4 w-4" /> Add teacher</Button>
          </Link>
        ) : null
      }
    >
      {items.length === 0 ? (
        <EmptyState icon={Users} title="No teachers found" description="No active teachers are registered in the school." />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((teacher) => (
            <div key={teacher.id} className="rounded-lg border border-slate-200 p-4">
              <div className="flex items-start gap-3">
                <ProfileAvatar userId={teacher.user?.id} name={teacher.fullName} size="lg" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900">{teacher.fullName}</p>
                  <p className="text-sm text-slate-600">{teacher.designation}</p>
                  {teacher.department && <p className="text-xs text-slate-500">Department: {teacher.department}</p>}
                </div>
              </div>
              <dl className="mt-4 space-y-2 text-sm">
                <div>
                  <dt className="text-xs text-slate-500">Subjects</dt>
                  <dd className="text-slate-700">
                    {teacher.subjects?.length ? teacher.subjects.map((item) => item.subject.name).join(', ') : 'Not assigned'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Phone</dt>
                  <dd className="text-slate-700">{teacher.phone || 'Not provided'}</dd>
                </div>
              </dl>
              {canManage && (
                <div className="mt-4 flex gap-2">
                  <Link to={`/admin/teachers/${teacher.id}/edit`}>
                    <Button size="sm" variant="secondary"><Pencil className="h-4 w-4" /> Edit</Button>
                  </Link>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function Routes() {
  const toast = useToast();
  const routes = useAsync(() => transportService.routes(), []);
  const buses = useAsync(() => transportService.buses(), []);
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(null);
  const route = useAsync(() => (selected ? transportService.route(selected) : Promise.resolve(null)), [selected]);
  const [assigning, setAssigning] = useState(false);
  const [removing, setRemoving] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!selected && routes.data?.length) setSelected(routes.data[0].id);
  }, [routes.data, selected]);

  async function unassign() {
    setBusy(true);
    try {
      await transportService.unassign(removing.student.id);
      toast.success(`${removing.student.fullName} removed from the route.`);
      route.reload();
      routes.reload();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
      setRemoving(null);
    }
  }

  if (routes.loading && !routes.data) return <Spinner />;
  if (routes.error) return <LoadError error={routes.error} onRetry={routes.reload} />;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <Card
        bodyClassName="p-0"
        title="Routes"
        actions={
          <Button size="sm" onClick={() => setEditing('new')}>
            <Plus className="h-4 w-4" /> Route
          </Button>
        }
      >
        {routes.data.length === 0 ? (
          <EmptyState icon={MapPin} title="No routes yet" />
        ) : (
          <ul className="divide-y divide-slate-100">
            {routes.data.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => setSelected(r.id)} className={`w-full px-5 py-3 text-left hover:bg-slate-50 ${selected === r.id ? 'bg-brand-50/60' : ''}`}>
                  <p className="font-medium text-slate-900">
                    <span className="font-mono text-xs text-slate-500">{r.routeCode}</span> {r.name}
                  </p>
                  <p className="text-xs text-slate-500">
                    {r.bus ? `${r.bus.busNumber} · ` : 'No bus · '}
                    {r._count.assignments} riders · {formatMoney(r.monthlyFee)}/month
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="lg:col-span-2">
        {!selected ? null : route.loading && !route.data ? (
          <Spinner />
        ) : route.error ? (
          <LoadError error={route.error} onRetry={route.reload} />
        ) : route.data ? (
          <Card
            title={`${route.data.routeCode} · ${route.data.name}`}
            description={`${formatMoney(route.data.monthlyFee)} per month`}
            bodyClassName="p-0"
            actions={
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => setEditing(route.data)} aria-label="Edit route">
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button size="sm" onClick={() => setAssigning(true)}>
                  <UserPlus className="h-4 w-4" /> Add student
                </Button>
              </div>
            }
          >
            <div className="grid grid-cols-1 gap-4 border-b border-slate-100 p-5 sm:grid-cols-2">
              <div>
                <p className="text-xs text-slate-500">Pickup points</p>
                <p className="text-sm text-slate-800">{route.data.pickupPoints.join(' → ')}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Bus & driver</p>
                <p className="text-sm text-slate-800">
                  {route.data.bus
                    ? `${route.data.bus.busNumber} (${route.data.assignments.length}/${route.data.bus.capacity} seats used) · ${route.data.bus.driver?.fullName ?? route.data.bus.driverName ?? 'No driver'}`
                    : 'No bus assigned'}
                </p>
              </div>
            </div>
            {route.data.assignments.length === 0 ? (
              <EmptyState title="No students on this route" />
            ) : (
              <ul className="divide-y divide-slate-100">
                {route.data.assignments.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div>
                      <p className="font-medium text-slate-900">{a.student.fullName}</p>
                      <p className="text-xs text-slate-500">
                        {a.student.enrollments[0] ? `${a.student.enrollments[0].class.name}-${a.student.enrollments[0].section.name} · ` : ''}
                        Pickup: {a.pickupPoint ?? '—'} · {a.student.phone}
                      </p>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => setRemoving(a)} aria-label={`Remove ${a.student.fullName}`}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ) : null}
      </div>

      <RouteModal
        open={Boolean(editing)}
        route={editing === 'new' ? null : editing}
        buses={buses.data ?? []}
        onClose={() => setEditing(null)}
        onSaved={(r) => {
          toast.success('Route saved.');
          setEditing(null);
          routes.reload();
          setSelected(r.id);
          route.reload();
        }}
      />
      <AssignModal
        open={assigning}
        route={route.data}
        onClose={() => setAssigning(false)}
        onDone={() => {
          toast.success('Student added to the route.');
          setAssigning(false);
          route.reload();
          routes.reload();
        }}
      />
      <ConfirmDialog
        open={Boolean(removing)}
        title="Remove from route?"
        message={`${removing?.student.fullName} will no longer be listed on this bus.`}
        confirmLabel="Remove"
        loading={busy}
        onConfirm={unassign}
        onCancel={() => setRemoving(null)}
      />
    </div>
  );
}

function RouteModal({ open, route, buses, onClose, onSaved }) {
  const f = useForm({ routeCode: '', name: '', pickupPoints: '', dropOffPoints: '', busId: '', monthlyFee: '' });
  useEffect(() => {
    if (!open) return;
    f.setValues(
      route
        ? { routeCode: route.routeCode, name: route.name, pickupPoints: route.pickupPoints.join('\n'), dropOffPoints: route.dropOffPoints.join('\n'), busId: route.bus?.id ?? '', monthlyFee: String(Number(route.monthlyFee)) }
        : { routeCode: '', name: '', pickupPoints: '', dropOffPoints: 'School gate', busId: '', monthlyFee: '1500' },
    );
    f.setErrors({});
    f.setSubmitError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, route]);
  const lines = (s) => s.split('\n').map((x) => x.trim()).filter(Boolean);
  const onSubmit = f.submit(
    (v) => {
      const e = {};
      if (!/^[A-Za-z0-9-]{1,15}$/.test(v.routeCode.trim())) e.routeCode = 'Letters, numbers or dashes';
      if (!v.name.trim()) e.name = 'Enter a name';
      if (lines(v.pickupPoints).length === 0) e.pickupPoints = 'Add at least one stop';
      if (!(Number(v.monthlyFee) >= 0)) e.monthlyFee = 'Enter an amount';
      return e;
    },
    async (v) => {
      const payload = { routeCode: v.routeCode.trim(), name: v.name.trim(), pickupPoints: lines(v.pickupPoints), dropOffPoints: lines(v.dropOffPoints), busId: v.busId || null, monthlyFee: Number(v.monthlyFee) };
      try {
        onSaved(route ? await transportService.updateRoute(route.id, payload) : await transportService.createRoute(payload));
      } catch (err) {
        f.handleApiError(err, { DUPLICATE_ROUTE: 'routeCode', BUS_FULL: 'busId' });
      }
    },
  );
  return (
    <Modal
      open={open}
      onClose={f.submitting ? undefined : onClose}
      title={route ? 'Edit route' : 'New route'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={f.submitting}>
            Cancel
          </Button>
          <Button type="submit" form="route-form" loading={f.submitting}>
            Save
          </Button>
        </>
      }
    >
      <form id="route-form" onSubmit={onSubmit} noValidate className="space-y-4">
        {f.submitError && <Alert type="error">{f.submitError}</Alert>}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <TextField label="Route ID" placeholder="R2" {...f.bind('routeCode')} />
          <div className="sm:col-span-2">
            <TextField label="Name" placeholder="Uttara – Dhanmondi" {...f.bind('name')} />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextAreaField label="Pickup points" hint="One per line, in order" rows={4} {...f.bind('pickupPoints')} />
          <TextAreaField label="Drop-off points" hint="One per line" rows={4} {...f.bind('dropOffPoints')} />
          <SelectField label="Bus" placeholder="No bus yet" options={buses.map((b) => ({ value: b.id, label: `${b.busNumber} (${b.capacity} seats)` }))} {...f.bind('busId')} />
          <TextField label="Monthly fee (৳)" type="number" min="0" {...f.bind('monthlyFee')} />
        </div>
      </form>
    </Modal>
  );
}

function AssignModal({ open, route, onClose, onDone }) {
  const [student, setStudent] = useState(null);
  const [pickup, setPickup] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setStudent(null);
      setPickup(route?.pickupPoints[0] ?? '');
      setError('');
    }
  }, [open, route]);
  async function submit() {
    if (!student) return setError('Choose a student');
    setBusy(true);
    setError('');
    try {
      await transportService.assign(route.id, { studentId: student.id, pickupPoint: pickup || null });
      onDone();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open={open}
      onClose={busy ? undefined : onClose}
      title={`Add student to ${route?.name ?? ''}`}
      description="A student already on another route is moved to this one."
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} loading={busy}>
            Add
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert type="error">{error}</Alert>}
        <StudentPicker value={student} onChange={setStudent} />
        <SelectField label="Pickup point" value={pickup} onChange={(e) => setPickup(e.target.value)} options={(route?.pickupPoints ?? []).map((p) => ({ value: p, label: p }))} />
      </div>
    </Modal>
  );
}

function Buses() {
  const toast = useToast();
  const buses = useAsync(() => transportService.buses(), []);
  const [editing, setEditing] = useState(null);
  if (buses.loading && !buses.data) return <Spinner />;
  if (buses.error) return <LoadError error={buses.error} onRetry={buses.reload} />;
  return (
    <Card
      bodyClassName="p-0"
      title="Buses"
      actions={
        <Button size="sm" onClick={() => setEditing('new')}>
          <Plus className="h-4 w-4" /> Bus
        </Button>
      }
    >
      {buses.data.length === 0 ? (
        <EmptyState icon={Bus} title="No buses yet" />
      ) : (
        <ul className="divide-y divide-slate-100">
          {buses.data.map((b) => (
            <li key={b.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium text-slate-900">
                  {b.busNumber} {b.registrationNumber && <span className="text-xs font-normal text-slate-500">· {b.registrationNumber}</span>}
                </p>
                <p className="text-xs text-slate-500">
                  Driver: {b.driver?.fullName ?? b.driverName ?? '—'}
                  {(b.driver?.phone ?? b.driverPhone) ? ` · ${b.driver?.phone ?? b.driverPhone}` : ''} · Routes: {b.routes.map((r) => r.name).join(', ') || '—'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge className={b.riders >= b.capacity ? 'bg-red-50 text-red-700 ring-red-600/20' : 'bg-slate-100 text-slate-700 ring-slate-500/20'}>
                  {b.riders}/{b.capacity} seats
                </Badge>
                <Button size="sm" variant="ghost" onClick={() => setEditing(b)} aria-label={`Edit ${b.busNumber}`}>
                  <Pencil className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <BusModal
        open={Boolean(editing)}
        bus={editing === 'new' ? null : editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          toast.success('Bus saved.');
          setEditing(null);
          buses.reload();
        }}
      />
    </Card>
  );
}

function BusModal({ open, bus, onClose, onSaved }) {
  const staff = useAsync(() => staffService.list({ status: 'ACTIVE', limit: 100 }).then((r) => r.items), []);
  const f = useForm({ busNumber: '', registrationNumber: '', capacity: '', driverId: '', driverName: '', driverPhone: '' });
  useEffect(() => {
    if (!open) return;
    f.setValues(
      bus
        ? { busNumber: bus.busNumber, registrationNumber: bus.registrationNumber ?? '', capacity: String(bus.capacity), driverId: bus.driver?.id ?? '', driverName: bus.driverName ?? '', driverPhone: bus.driverPhone ?? '' }
        : { busNumber: '', registrationNumber: '', capacity: '40', driverId: '', driverName: '', driverPhone: '' },
    );
    f.setErrors({});
    f.setSubmitError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, bus]);
  const onSubmit = f.submit(
    (v) => {
      const e = {};
      if (!v.busNumber.trim()) e.busNumber = 'Enter the bus number';
      if (!(Number.isInteger(Number(v.capacity)) && Number(v.capacity) > 0)) e.capacity = 'Enter seats';
      if (v.driverPhone && !isPhone(v.driverPhone)) e.driverPhone = 'Enter a valid phone';
      return e;
    },
    async (v) => {
      const driver = (staff.data ?? []).find((s) => s.id === v.driverId);
      const payload = {
        busNumber: v.busNumber.trim(),
        registrationNumber: v.registrationNumber.trim() || null,
        capacity: Number(v.capacity),
        driverId: v.driverId || null,
        driverName: driver?.fullName ?? (v.driverName.trim() || null),
        driverPhone: driver?.phone ?? (v.driverPhone.trim() || null),
      };
      try {
        onSaved(bus ? await transportService.updateBus(bus.id, payload) : await transportService.createBus(payload));
      } catch (err) {
        f.handleApiError(err, { DUPLICATE_BUS: 'busNumber', CAPACITY_BELOW_RIDERS: 'capacity' });
      }
    },
  );
  return (
    <Modal
      open={open}
      onClose={f.submitting ? undefined : onClose}
      title={bus ? `Edit ${bus.busNumber}` : 'Add bus'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={f.submitting}>
            Cancel
          </Button>
          <Button type="submit" form="bus-form" loading={f.submitting}>
            Save
          </Button>
        </>
      }
    >
      <form id="bus-form" onSubmit={onSubmit} noValidate className="space-y-4">
        {f.submitError && <Alert type="error">{f.submitError}</Alert>}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <TextField label="Bus number" placeholder="BUS-2" {...f.bind('busNumber')} />
          <TextField label="Registration" {...f.bind('registrationNumber')} />
          <TextField label="Seats" type="number" min="1" {...f.bind('capacity')} />
        </div>
        <SelectField label="Driver (staff)" placeholder="Not on staff / none" options={(staff.data ?? []).map((s) => ({ value: s.id, label: `${s.fullName} · ${s.designation}` }))} {...f.bind('driverId')} />
        {!f.values.driverId && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TextField label="Driver name" {...f.bind('driverName')} />
            <TextField label="Driver phone" type="tel" {...f.bind('driverPhone')} />
          </div>
        )}
      </form>
    </Modal>
  );
}
