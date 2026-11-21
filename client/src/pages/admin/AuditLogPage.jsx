import { ScrollText } from 'lucide-react';
import { useState } from 'react';
import { Alert, Button, Card, EmptyState, PageHeader, Pagination, Spinner } from '../../components/common/ui';
import { useAsync } from '../../hooks/useAsync';
import { adminService } from '../../services/admin.service';
import { getErrorMessage } from '../../utils/errors';
import { formatDateTime, humanizeAction } from '../../utils/format';

const ACTIONS = [
  'AUTH_LOGIN',
  'AUTH_LOGIN_FAILED',
  'AUTH_LOGOUT',
  'AUTH_PASSWORD_CHANGED',
  'AUTH_PASSWORD_RESET_REQUESTED',
  'AUTH_PASSWORD_RESET',
  'USER_CREATED',
  'USER_ACTIVATED',
  'USER_DEACTIVATED',
  'SCHOOL_CREATED',
];

export default function AuditLogPage() {
  const [action, setAction] = useState('');
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useAsync(() => adminService.listAuditLogs({ action, page, limit: 20 }), [action, page]);

  return (
    <>
      <PageHeader title="Audit log" description="Security and administrative events, newest first." />
      <Card bodyClassName="p-0">
        <div className="border-b border-slate-100 p-4">
          <select
            className="input sm:w-72"
            value={action}
            onChange={(e) => {
              setAction(e.target.value);
              setPage(1);
            }}
            aria-label="Filter by event"
          >
            <option value="">All events</option>
            {ACTIONS.map((a) => (
              <option key={a} value={a}>
                {humanizeAction(a)}
              </option>
            ))}
          </select>
        </div>
        {error ? (
          <div className="p-4">
            <Alert type="error" action={<Button size="sm" variant="secondary" onClick={reload}>Retry</Button>}>
              {getErrorMessage(error)}
            </Alert>
          </div>
        ) : loading && !data ? (
          <Spinner />
        ) : data.items.length === 0 ? (
          <EmptyState icon={ScrollText} title="No events" />
        ) : (
          <>
            <div className="relative overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  <tr>
                    <th scope="col" className="px-5 py-3">When</th>
                    <th scope="col" className="px-5 py-3">Event</th>
                    <th scope="col" className="px-5 py-3">By</th>
                    <th scope="col" className="px-5 py-3">IP address</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.items.map((log) => (
                    <tr key={log.id}>
                      <td className="whitespace-nowrap px-5 py-3 text-slate-500">{formatDateTime(log.createdAt)}</td>
                      <td className="px-5 py-3 font-medium text-slate-800">{humanizeAction(log.action)}</td>
                      <td className="px-5 py-3 text-slate-600">{log.user?.fullName ?? '—'}</td>
                      <td className="whitespace-nowrap px-5 py-3 font-mono text-xs text-slate-500">{log.ipAddress ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination meta={data.meta} onPageChange={setPage} />
          </>
        )}
      </Card>
    </>
  );
}
