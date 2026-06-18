import { Link, useParams } from 'react-router-dom';
import PlaceholderLayout from '../../layouts/PlaceholderLayout/PlaceholderLayout';

export default function WorkspaceExportView() {
  const { workspaceId } = useParams();
  const workspacePath = workspaceId ? `/workspaces/${workspaceId}` : '/workspaces';
  const settingsPath = workspaceId ? `/workspaces/${workspaceId}/settings` : '/workspaces';

  return (
    <PlaceholderLayout
      breadcrumbs={[
        { label: 'Workspaces', path: '/workspaces' },
        { label: workspaceId ?? 'Workspace', path: workspacePath },
        { label: 'Settings', path: settingsPath },
        { label: 'Export' },
      ]}
      title="Workspace Export"
      description="This route is still a stub while export tooling is folded into the main workspace shell."
      params={{ workspaceId }}
      degradation={{
        message:
          'Export actions are not implemented on this standalone page yet. Use the workspace settings screen as the current management entry point.',
        targetPath: settingsPath,
        targetLabel: 'Workspace Settings',
      }}
    >
      <section className="placeholder-card">
        <div className="card-title">Current Status</div>
        <p style={{ margin: 0, color: '#cbd5e1', lineHeight: 1.7 }}>
          The production export UI has not been wired to this route yet. The application now renders a
          stable placeholder instead of failing the frontend bundle.
        </p>
      </section>

      <section className="placeholder-card" style={{ marginTop: '20px' }}>
        <div className="card-title">Next Step</div>
        <p style={{ margin: '0 0 16px', color: '#cbd5e1', lineHeight: 1.7 }}>
          Return to workspace settings to continue configuration, or navigate back to the workspace shell.
        </p>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <Link to={settingsPath} className="degradation-btn" style={{ textDecoration: 'none' }}>
            Go to Settings
          </Link>
          <Link
            to={workspacePath}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '6px 12px',
              borderRadius: '6px',
              border: '1px solid rgba(148, 163, 184, 0.3)',
              color: '#e2e8f0',
              textDecoration: 'none',
              fontWeight: 600,
            }}
          >
            Back to Workspace
          </Link>
        </div>
      </section>
    </PlaceholderLayout>
  );
}
