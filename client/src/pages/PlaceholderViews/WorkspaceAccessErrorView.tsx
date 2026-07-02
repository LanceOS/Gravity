import { RefreshCcw } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

export default function WorkspaceAccessErrorView() {
  const location = useLocation();
  const navigate = useNavigate();
  const from = (location.state as { from?: string } | null)?.from;

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: '32px',
        background: 'var(--color-surface-app)',
        color: 'var(--color-text-primary)',
      }}
    >
      <section
        aria-labelledby="workspace-access-error-title"
        style={{
          width: 'min(520px, 100%)',
          border: '1px solid var(--color-border-default)',
          borderRadius: '8px',
          padding: '32px',
          background: 'var(--color-surface-card)',
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        <p
          style={{
            margin: '0 0 12px',
            fontSize: '12px',
            fontWeight: 700,
            textTransform: 'uppercase',
            color: 'var(--color-text-secondary)',
          }}
        >
          Workspace access
        </p>
        <h1
          id="workspace-access-error-title"
          style={{ margin: '0 0 12px', fontSize: '28px', lineHeight: 1.2 }}
        >
          We could not verify access to this workspace
        </h1>
        <p style={{ margin: '0 0 24px', fontSize: '16px', lineHeight: 1.6, color: 'var(--color-text-secondary)' }}>
          This link cannot be opened until the workspace directory responds again.
          The invite may have expired, the workspace may have changed, or the directory request may have failed.
        </p>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <Link
            to="/workspaces"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '8px',
              padding: '10px 16px',
              background: 'var(--color-primary)',
              color: 'var(--color-text-on-accent)',
              textDecoration: 'none',
              fontWeight: 600,
            }}
          >
            Open workspaces
          </Link>
          <button
            type="button"
            onClick={() => navigate(from || '/workspaces', { replace: true })}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              borderRadius: '8px',
              padding: '10px 16px',
              border: '1px solid var(--color-border-default)',
              background: 'var(--color-surface-card)',
              color: 'var(--color-text-primary)',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <RefreshCcw size={14} />
            Try again
          </button>
        </div>
      </section>
    </main>
  );
}
