import { Users } from 'lucide-react';
import { Card, EmptyState, LoadError, PageHeader, Spinner } from '../../components/common/ui';
import { usePortalChild } from '../../hooks/usePortalChild';

/**
 * Shared frame for portal pages: resolves the selected child, shows a switcher
 * for parents with several children, and renders `children(child, helpers)`.
 */
export default function PortalShell({ title, description, children: render }) {
  const portal = usePortalChild();

  if (portal.loading && portal.children.length === 0) return <Spinner />;
  if (portal.error) return <LoadError error={portal.error} onRetry={portal.reload} />;
  if (!portal.child) {
    return (
      <>
        <PageHeader title={title} />
        <Card>
          <EmptyState icon={Users} title="No student linked to this account" description="Ask the school office to link your child's record to your login." />
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={title}
        description={description}
        actions={
          portal.children.length > 1 && (
            <select className="input w-56" value={portal.child.id} onChange={(e) => portal.selectChild(e.target.value)} aria-label="Choose child">
              {portal.children.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.fullName}
                </option>
              ))}
            </select>
          )
        }
      />
      {render(portal.child, portal)}
    </>
  );
}
