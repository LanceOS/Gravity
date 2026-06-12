import React from 'react';
import { useNavigate } from 'react-router-dom';
import { HelpCircle } from 'lucide-react';
import { Button } from '@library';

export default function NotFoundView() {
  const navigate = useNavigate();

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        width: '100vw',
        backgroundColor: 'var(--color-surface-app)',
        color: 'var(--color-text-secondary)',
        fontFamily: 'var(--sans)',
        padding: '24px',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          maxWidth: '400px',
          width: '100%',
          padding: '48px 32px',
          textAlign: 'center',
          border: '1px solid var(--color-border-default)',
          borderRadius: 'var(--radius-lg)',
          backgroundColor: 'var(--color-surface-card)',
          boxShadow: 'var(--shadow-xl)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            backgroundColor: 'var(--color-base100)',
            color: 'var(--color-text-primary)',
            marginBottom: '24px',
          }}
        >
          <HelpCircle size={28} />
        </div>
        <h1
          style={{
            fontSize: '22px',
            fontWeight: 700,
            color: 'var(--color-text-primary)',
            margin: '0 0 10px 0',
            letterSpacing: '-0.02em',
          }}
        >
          Page not found
        </h1>
        <p
          style={{
            fontSize: '13px',
            color: 'var(--color-text-secondary)',
            lineHeight: '1.6',
            margin: '0 0 32px 0',
          }}
        >
          The page you are looking for doesn't exist or has been moved. Please double check the URL or return to the workspace.
        </p>
        <Button
          type="button"
          variant="primary"
          onClick={() => navigate('/')}
          style={{ minWidth: '140px' }}
        >
          Go Back Home
        </Button>
      </div>
    </div>
  );
}
