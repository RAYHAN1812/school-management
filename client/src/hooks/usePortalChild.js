import { useSearchParams } from 'react-router-dom';
import { portalService } from '../services/portal.service';
import { useAsync } from './useAsync';

/**
 * Parent/student portal: the list of students this login can see and the one
 * currently selected (kept in ?child= so links and refreshes keep the choice).
 */
export function usePortalChild() {
  const [params, setParams] = useSearchParams();
  const list = useAsync(() => portalService.myStudents(), []);
  const children = list.data ?? [];
  const requested = params.get('child');
  const child = children.find((c) => c.id === requested) ?? children[0] ?? null;

  const selectChild = (id) => {
    const next = new URLSearchParams(params);
    next.set('child', id);
    setParams(next, { replace: true });
  };

  /** Append ?child= to an in-portal link so the selection carries over. */
  const withChild = (path) => (child && children.length > 1 ? `${path}${path.includes('?') ? '&' : '?'}child=${child.id}` : path);

  return { children, child, selectChild, withChild, loading: list.loading, error: list.error, reload: list.reload };
}
