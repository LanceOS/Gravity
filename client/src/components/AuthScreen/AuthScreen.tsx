import React, { useState } from 'react';
import { useTickets } from '../../context/TicketContext';
import { LogIn } from 'lucide-react';
import { getAuthFailureMessage, isAuthSubmissionInvalid } from './utils';
import { Button, TextInput, PasswordInput } from '@library';

export const AuthScreen: React.FC = () => {
  const { signIn, signUp } = useTickets();
  const [isSignUp, setIsSignUp] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (isAuthSubmissionInvalid(isSignUp, name, email, password)) {
      setErrorMsg('Please fill in all required fields.');
      return;
    }

    setLoading(true);
    try {
      let success = false;
      if (isSignUp) {
        success = await signUp(name, email, password);
      } else {
        success = await signIn(email, password);
      }

      if (!success) {
        setErrorMsg(getAuthFailureMessage(isSignUp));
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'An error occurred during authentication.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={containerStyle}>
      <div style={cardStyle} className="glass">
        {/* Logo/Icon */}
        <div style={headerStyle}>
          <div style={logoContainerStyle}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="12" cy="12" r="10" stroke="var(--color-text-primary)" strokeWidth="2.5" />
              <circle cx="12" cy="12" r="6" stroke="var(--color-primary)" strokeWidth="2" strokeDasharray="4 2" />
              <circle cx="12" cy="12" r="2" fill="var(--color-text-primary)" />
            </svg>
          </div>
          <h1 style={titleStyle}>Gravity</h1>
          <p style={subtitleStyle}>Production-grade Project Management Workspace</p>
        </div>

        {errorMsg && <div style={errorStyle}>{errorMsg}</div>}

        <form onSubmit={handleSubmit} style={formStyle}>
          {isSignUp && (
            <TextInput
              label="Full Name"
              placeholder="John Doe"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          )}

          <TextInput
            label="Email Address"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <PasswordInput
            label="Password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          <Button
            type="submit"
            loading={loading}
            variant="primary"
            fullWidth
            leftIcon={loading ? undefined : <LogIn size={16} />}
            style={{ marginTop: '8px' }}
          >
            {isSignUp ? 'Create Account' : 'Sign In'}
          </Button>
        </form>

        <div style={footerStyle}>
          <button
            onClick={() => {
              setIsSignUp(!isSignUp);
              setErrorMsg('');
            }}
            style={toggleButtonStyle}
          >
            {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
          </button>
        </div>
      </div>
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

const cardStyle: React.CSSProperties = {
  width: '400px',
  padding: '40px',
  borderRadius: '8px',
  border: '1px solid var(--color-border-default)',
  background: 'var(--color-surface-card)',
  zIndex: 10,
  boxShadow: 'var(--shadow-lg)',
  display: 'flex',
  flexDirection: 'column',
  gap: '24px'
};

const headerStyle: React.CSSProperties = {
  textAlign: 'center',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '8px'
};

const logoContainerStyle: React.CSSProperties = {
  padding: '12px',
  borderRadius: '8px',
  background: 'var(--color-base50)',
  border: '1px solid var(--color-border-default)',
  marginBottom: '8px'
};

const titleStyle: React.CSSProperties = {
  fontSize: '24px',
  fontWeight: 600,
  color: 'var(--color-text-primary)',
  letterSpacing: '-0.5px'
};

const subtitleStyle: React.CSSProperties = {
  fontSize: '13px',
  color: 'var(--color-text-disabled)',
  lineHeight: '1.4'
};

const errorStyle: React.CSSProperties = {
  padding: '10px 14px',
  background: 'rgba(239, 68, 68, 0.08)',
  border: '1px solid rgba(239, 68, 68, 0.18)',
  borderRadius: '6px',
  color: '#ef4444',
  fontSize: '12px',
  lineHeight: '1.4'
};

const formStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '16px'
};

const footerStyle: React.CSSProperties = {
  textAlign: 'center',
  marginTop: '8px'
};

const toggleButtonStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--color-primary)',
  fontSize: '12px',
  cursor: 'pointer',
  outline: 'none',
  transition: 'color var(--transition-fast)'
};
