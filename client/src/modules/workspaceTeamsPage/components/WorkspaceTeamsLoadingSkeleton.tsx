import { Skeleton } from '@library';

export function WorkspaceTeamsLoadingSkeleton() {
  return (
    <div className="workspace-teams-page__layout">
      <div className="workspace-teams-page__teams-card" style={{ padding: 'var(--space-lg) var(--space-md)' }}>
        <Skeleton variant="text" width="40%" height={20} style={{ marginBottom: 'var(--space-md)' }} />
        <div className="workspace-teams-page__team-list">
          {[1, 2, 3].map((item) => (
            <div key={item} className="workspace-teams-page__team-card-item" style={{ cursor: 'default' }}>
              <Skeleton variant="text" width="50%" height={18} />
              <Skeleton variant="text" width="80%" height={14} />
              <Skeleton variant="text" width="60%" height={12} />
            </div>
          ))}
        </div>
      </div>
      <div className="workspace-teams-page__editor-card" style={{ padding: 'var(--space-md)' }}>
        <Skeleton variant="text" width="30%" height={20} style={{ marginBottom: 'var(--space-md)' }} />
        <Skeleton variant="rect" width="100%" height={150} />
      </div>
    </div>
  );
}
