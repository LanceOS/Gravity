import { Link } from 'react-router-dom';

export default function WorkspaceAccessDeniedView() {
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
        aria-labelledby="workspace-access-denied-title"
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
          Access denied
        </p>
        <h1
          id="workspace-access-denied-title"
          style={{ margin: '0 0 12px', fontSize: '28px', lineHeight: 1.2 }}
        >
          You are not part of this workspace
        </h1>
        <p style={{ margin: '0 0 24px', fontSize: '16px', lineHeight: 1.6, color: 'var(--color-text-secondary)' }}>
          This ticket link belongs to a workspace your current account cannot access.
          Ask a workspace owner for an invitation, or switch to an account that is already a member.
        </p>
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
          Open my workspaces
        </Link>
      </section>
    </main>
  );
}
