import { Link, useLocation } from 'react-router-dom';

export default function NotFoundView() {
  const location = useLocation();

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: '32px',
        background: 'linear-gradient(180deg, #f8fafc 0%, #e2e8f0 100%)',
        color: '#0f172a',
      }}
    >
      <section
        style={{
          width: 'min(560px, 100%)',
          borderRadius: '20px',
          padding: '32px',
          background: 'rgba(255, 255, 255, 0.92)',
          boxShadow: '0 20px 45px rgba(15, 23, 42, 0.12)',
        }}
      >
        <p
          style={{
            margin: '0 0 12px',
            fontSize: '12px',
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: '#475569',
          }}
        >
          404
        </p>
        <h1 style={{ margin: '0 0 12px', fontSize: '32px', lineHeight: 1.1 }}>
          Page not found
        </h1>
        <p style={{ margin: '0 0 20px', fontSize: '16px', lineHeight: 1.6, color: '#334155' }}>
          Gravity could not find a route for <code>{location.pathname}</code>.
        </p>
        <Link
          to="/workspaces"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '999px',
            padding: '10px 16px',
            background: '#0f172a',
            color: '#f8fafc',
            textDecoration: 'none',
            fontWeight: 600,
          }}
        >
          Open workspaces
        </Link>
      </section>
    </main>
  );
}
