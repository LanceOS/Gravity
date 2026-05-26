import React from 'react';
import { useAuthForm } from '../hooks/useAuthForm';
import { AuthCard } from '../components/AuthCard';

export const AuthScreen: React.FC = () => {
  const formProps = useAuthForm();

  return (
    <div style={containerStyle}>
      <AuthCard {...formProps} />
    </div>
  );
};

// Styles
const containerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '100vw',
  height: '100vh',
  background: 'var(--color-surface-app)',
  overflow: 'hidden',
  position: 'relative',
  fontFamily: 'var(--sans)'
};
