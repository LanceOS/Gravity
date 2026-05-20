import React, { useState } from 'react';
import { useTickets } from '../context/TicketContext';
import { 
  Sparkles, Database, Layers, CheckCircle, Terminal, 
  ChevronRight, ChevronLeft, Check, HelpCircle
} from 'lucide-react';

interface OnboardingModalProps {
  onComplete: () => void;
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({ onComplete }) => {
  const { currentUser } = useTickets();
  const [step, setStep] = useState(0); // 0: Question, 1-4: Tour steps

  const handleSkip = async () => {
    try {
      const res = await fetch(`/api/v1/users/${currentUser?.id}/tutorial`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: true })
      });
      if (res.ok) {
        onComplete();
      }
    } catch (e) {
      console.error(e);
      onComplete(); // fallback
    }
  };

  const handleNext = () => {
    if (step < 4) {
      setStep(step + 1);
    } else {
      handleSkip(); // Finish behaves the same: saves state
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
    } else {
      setStep(0);
    }
  };

  return (
    <div style={overlayStyle}>
      <div style={modalStyle} className="glass">
        {step === 0 ? (
          <div style={contentContainerStyle}>
            <div style={iconContainerStyle}>
              <HelpCircle size={40} color="var(--accent)" />
            </div>
            <h2 style={titleStyle}>Welcome to Gravity, {currentUser?.name}!</h2>
            <p style={descriptionStyle}>
              Would you like a quick 1-minute tour of your new production-grade, multi-tenant project management workspace?
            </p>
            <div style={buttonGroupStyle}>
              <button onClick={handleSkip} className="clickable" style={skipButtonStyle}>
                No thanks, skip it
              </button>
              <button onClick={() => setStep(1)} className="clickable" style={startButtonStyle}>
                <Sparkles size={16} />
                Let's do it!
              </button>
            </div>
          </div>
        ) : (
          <div style={contentContainerStyle}>
            {/* Step Indicators */}
            <div style={indicatorContainerStyle}>
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  style={{
                    ...indicatorDotStyle,
                    background: i === step ? 'var(--accent)' : i < step ? 'var(--text-heading)' : 'var(--border)',
                  }}
                />
              ))}
            </div>

            {step === 1 && (
              <>
                <div style={iconContainerStyle}>
                  <Database size={40} color="var(--accent)" />
                </div>
                <h3 style={stepTitleStyle}>Multi-Tenant Project Databases</h3>
                <p style={descriptionStyle}>
                  Every workspace in Gravity runs on its own isolated PostgreSQL boundary. This keeps projects, tickets, and members scoped cleanly while supporting a production-grade multi-tenant architecture.
                </p>
              </>
            )}

            {step === 2 && (
              <>
                <div style={iconContainerStyle}>
                  <Layers size={40} color="var(--accent)" />
                </div>
                <h3 style={stepTitleStyle}>Cycles & Specialized Domains</h3>
                <p style={descriptionStyle}>
                  Organize your tickets into active sprint cycles and assign them to specialized technical domains like Frontend, Backend, DevOps, or Design. This ensures structured sorting and readability.
                </p>
              </>
            )}

            {step === 3 && (
              <>
                <div style={iconContainerStyle}>
                  <Sparkles size={40} color="var(--accent)" />
                </div>
                <h3 style={stepTitleStyle}>Local Ollama AI Assistant</h3>
                <p style={descriptionStyle}>
                  Chat with a completely local Ollama language model directly in your sidebar! Ask it to summarize your backlog, write code snippets, or analyze open tickets without leaking any sensitive data.
                </p>
              </>
            )}

            {step === 4 && (
              <>
                <div style={iconContainerStyle}>
                  <Terminal size={40} color="var(--accent)" />
                </div>
                <h3 style={stepTitleStyle}>MCP Agent Integrations</h3>
                <p style={descriptionStyle}>
                  Gravity features full Model Context Protocol (MCP) integrations! Using the built-in MCP simulator, AI agents like Copilot or web agents can read, create, and resolve tickets just like regular users.
                </p>
              </>
            )}

            <div style={navigationContainerStyle}>
              <button onClick={handleBack} className="clickable" style={navButtonStyle}>
                <ChevronLeft size={16} />
                Back
              </button>
              
              <button onClick={handleNext} className="clickable" style={{ ...navButtonStyle, background: 'var(--text-heading)', color: 'var(--bg)' }}>
                {step === 4 ? (
                  <>
                    <Check size={16} />
                    Finish Tour
                  </>
                ) : (
                  <>
                    Next
                    <ChevronRight size={16} />
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: 'rgba(0, 0, 0, 0.8)',
  backdropFilter: 'blur(8px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
  fontFamily: 'var(--sans)'
};

const modalStyle: React.CSSProperties = {
  width: '460px',
  background: 'var(--card-bg)',
  border: '1px solid var(--border)',
  borderRadius: '16px',
  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
  padding: '40px',
  overflow: 'hidden'
};

const contentContainerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  textAlign: 'center',
  gap: '16px'
};

const iconContainerStyle: React.CSSProperties = {
  padding: '16px',
  borderRadius: '16px',
  background: 'var(--accent-glow)',
  border: '1px solid var(--accent-border)',
  marginBottom: '8px'
};

const titleStyle: React.CSSProperties = {
  fontSize: '22px',
  fontWeight: 600,
  color: 'var(--text-heading)',
  letterSpacing: '-0.3px'
};

const stepTitleStyle: React.CSSProperties = {
  fontSize: '18px',
  fontWeight: 600,
  color: 'var(--text-heading)'
};

const descriptionStyle: React.CSSProperties = {
  fontSize: '13px',
  color: 'var(--text-muted)',
  lineHeight: '1.6',
  maxWidth: '360px',
  marginBottom: '8px'
};

const buttonGroupStyle: React.CSSProperties = {
  display: 'flex',
  width: '100%',
  gap: '12px',
  marginTop: '12px'
};

const startButtonStyle: React.CSSProperties = {
  flex: 1,
  padding: '10px',
  background: 'var(--text-heading)',
  border: 'none',
  borderRadius: '8px',
  color: 'var(--bg)',
  fontSize: '13px',
  fontWeight: 600,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px'
};

const skipButtonStyle: React.CSSProperties = {
  flex: 1,
  padding: '10px',
  background: 'transparent',
  border: '1px solid var(--border)',
  borderRadius: '8px',
  color: 'var(--text)',
  fontSize: '13px',
  fontWeight: 500,
  cursor: 'pointer'
};

const indicatorContainerStyle: React.CSSProperties = {
  display: 'flex',
  gap: '6px',
  marginBottom: '8px'
};

const indicatorDotStyle: React.CSSProperties = {
  width: '6px',
  height: '6px',
  borderRadius: '50%',
  transition: 'all 0.2s ease'
};

const navigationContainerStyle: React.CSSProperties = {
  display: 'flex',
  width: '100%',
  justifyContent: 'space-between',
  marginTop: '20px'
};

const navButtonStyle: React.CSSProperties = {
  padding: '8px 16px',
  background: 'var(--card-bg)',
  border: '1px solid var(--border)',
  borderRadius: '8px',
  color: 'var(--text)',
  fontSize: '12px',
  fontWeight: 500,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: '6px'
};
