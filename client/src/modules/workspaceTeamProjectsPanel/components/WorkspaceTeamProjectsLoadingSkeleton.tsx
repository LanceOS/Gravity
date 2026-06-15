import { Skeleton } from '@library';

export function WorkspaceTeamProjectsLoadingSkeleton() {
  return (
    <div className="workspace-team-projects-page__layout">
      <div className="workspace-team-projects-page__projects-card" style={{ padding: 'var(--space-lg) var(--space-md)' }}>
        <Skeleton variant="text" width="40%" height={20} style={{ marginBottom: 'var(--space-md)' }} />
        <div className="workspace-team-projects-page__project-list">
          {[1, 2, 3].map((item) => (
            <div key={item} className="workspace-team-projects-page__project-card" style={{ cursor: 'default' }}>
              <Skeleton variant="text" width="30%" height={14} style={{ marginBottom: 'var(--space-xs)' }} />
              <Skeleton variant="text" width="60%" height={18} />
              <Skeleton variant="text" width="80%" height={12} />
            </div>
          ))}
        </div>
      </div>
      <div className="workspace-team-projects-page__editor-card" style={{ padding: 'var(--space-md)' }}>
        <Skeleton variant="text" width="30%" height={20} style={{ marginBottom: 'var(--space-md)' }} />
        <Skeleton variant="rect" width="100%" height={150} />
      </div>
    </div>
  );
}

