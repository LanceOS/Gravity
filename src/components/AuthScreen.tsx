import React, { useState } from 'react';
import { useTickets } from '../context/TicketContext';
import { Sparkles, Mail, Lock, User as UserIcon } from 'lucide-react';

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
    if (!email || !password || (isSignUp && !name)) {
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
        setErrorMsg(isSignUp ? 'Registration failed. Email might already exist.' : 'Invalid email or password.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'An error occurred during authentication.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={containerStyle}>
      {/* Background ambient glow circles */}
      <div style={glowCircle1} />
      <div style={glowCircle2} />

      <div style={cardStyle} className="glass">
        {/* Logo/Icon */}
        <div style={headerStyle}>
          <div style={logoContainerStyle}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="12" cy="12" r="10" stroke="var(--text-heading)" strokeWidth="2.5" />
              <circle cx="12" cy="12" r="6" stroke="var(--accent)" strokeWidth="2" strokeDasharray="4 2" />
              <circle cx="12" cy="12" r="2" fill="var(--text-heading)" />
            </svg>
          </div>
          <h1 style={titleStyle}>Gravity</h1>
          <p style={subtitleStyle}>Production-grade Project Management Workspace</p>
        </div>

        {errorMsg && <div style={errorStyle}>{errorMsg}</div>}

        <form onSubmit={handleSubmit} style={formStyle}>
          {isSignUp && (
            <div style={formGroupStyle}>
              <label style={labelStyle}>Full Name</label>
              <div style={inputWrapperStyle}>
                <UserIcon size={16} style={inputIconStyle} />
                <input
                  type="text"
                  placeholder="John Doe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  style={inputStyle}
                  required
                />
              </div>
            </div>
          )}

          <div style={formGroupStyle}>
            <label style={labelStyle}>Email Address</label>
            <div style={inputWrapperStyle}>
              <Mail size={16} style={inputIconStyle} />
              <input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={inputStyle}
                required
              />
            </div>
          </div>

          <div style={formGroupStyle}>
            <label style={labelStyle}>Password</label>
            <div style={inputWrapperStyle}>
              <Lock size={16} style={inputIconStyle} />
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={inputStyle}
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            style={buttonStyle}
            className="clickable"
          >
            {loading ? (
              <span>Connecting...</span>
            ) : (
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
                <Sparkles size={16} />
                {isSignUp ? 'Create Account' : 'Sign In'}
              </span>
            )}
          </button>
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
  background: '#09090b',
  overflow: 'hidden',
  position: 'relative',
  fontFamily: 'var(--sans)'
};

const glowCircle1: React.CSSProperties = {
  position: 'absolute',
  top: '20%',
  left: '30%',
  width: '400px',
  height: '400px',
  borderRadius: '50%',
  background: 'radial-gradient(circle, rgba(192, 132, 252, 0.08) 0%, rgba(0,0,0,0) 70%)',
  transform: 'translate(-50%, -50%)',
  zIndex: 1,
  pointerEvents: 'none'
};

const glowCircle2: React.CSSProperties = {
  position: 'absolute',
  bottom: '20%',
  right: '30%',
  width: '500px',
  height: '500px',
  borderRadius: '50%',
  background: 'radial-gradient(circle, rgba(59, 130, 246, 0.05) 0%, rgba(0,0,0,0) 70%)',
  transform: 'translate(50%, 50%)',
  zIndex: 1,
  pointerEvents: 'none'
};

const cardStyle: React.CSSProperties = {
  width: '400px',
  padding: '40px',
  borderRadius: '16px',
  border: '1px solid #1f2028',
  zIndex: 10,
  boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.4)',
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
  borderRadius: '12px',
  background: 'rgba(255, 255, 255, 0.02)',
  border: '1px solid #1f2028',
  marginBottom: '8px'
};

const titleStyle: React.CSSProperties = {
  fontSize: '24px',
  fontWeight: 600,
  color: '#f4f4f5',
  letterSpacing: '-0.5px'
};

const subtitleStyle: React.CSSProperties = {
  fontSize: '13px',
  color: '#71717a',
  lineHeight: '1.4'
};

const errorStyle: React.CSSProperties = {
  padding: '10px 14px',
  background: 'rgba(239, 68, 68, 0.1)',
  border: '1px solid rgba(239, 68, 68, 0.2)',
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

const formGroupStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '6px'
};

const labelStyle: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 600,
  textTransform: 'uppercase',
  color: '#71717a',
  letterSpacing: '0.05em'
};

const inputWrapperStyle: React.CSSProperties = {
  position: 'relative',
  display: 'flex',
  alignItems: 'center'
};

const inputIconStyle: React.CSSProperties = {
  position: 'absolute',
  left: '12px',
  color: '#71717a',
  pointerEvents: 'none'
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px 10px 38px',
  background: '#121214',
  border: '1px solid #1f2028',
  borderRadius: '8px',
  color: '#f4f4f5',
  fontSize: '13px',
  outline: 'none',
  transition: 'all 0.15s ease'
};

const buttonStyle: React.CSSProperties = {
  width: '100%',
  padding: '11px',
  background: '#f4f4f5',
  border: 'none',
  borderRadius: '8px',
  color: '#09090b',
  fontSize: '13px',
  fontWeight: 600,
  cursor: 'pointer',
  marginTop: '8px',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center'
};

const footerStyle: React.CSSProperties = {
  textAlign: 'center',
  marginTop: '8px'
};

const toggleButtonStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#c084fc',
  fontSize: '12px',
  cursor: 'pointer',
  outline: 'none'
};
