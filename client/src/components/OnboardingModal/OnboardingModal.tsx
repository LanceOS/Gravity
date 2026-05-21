import React, { useState } from 'react';
import { useTickets } from '../../context/TicketContext';
import { 
  Sparkles, Database, Layers, CheckCircle, Terminal, 
  ChevronRight, ChevronLeft, Check, HelpCircle
} from 'lucide-react';
import type { OnboardingModalProps } from './types';
import { getNextOnboardingStep, getPreviousOnboardingStep, LAST_ONBOARDING_STEP } from './utils';
import { Button, Modal, Stack, Flex } from '@library';

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
    if (step < LAST_ONBOARDING_STEP) {
      setStep(getNextOnboardingStep(step));
    } else {
      handleSkip(); // Finish behaves the same: saves state
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(getPreviousOnboardingStep(step));
    } else {
      setStep(0);
    }
  };

  const renderContent = () => {
    if (step === 0) {
      return (
        <Stack gap="var(--space-4)" align="center" style={{ textAlign: 'center', padding: '10px 0' }}>
          <div style={iconContainerStyle}>
            <HelpCircle size={40} color="var(--accent)" />
          </div>
          <h2 style={titleStyle}>Welcome to Gravity, {currentUser?.name}!</h2>
          <p style={descriptionStyle}>
            Would you like a quick 1-minute tour of your new production-grade, multi-tenant project management workspace?
          </p>
          <Flex gap="var(--space-3)" style={{ width: '100%', marginTop: '12px' }}>
            <Button variant="default" fullWidth onClick={handleSkip}>
              No thanks, skip it
            </Button>
            <Button variant="primary" fullWidth onClick={() => setStep(1)} leftIcon={<Sparkles size={16} />}>
              Let's do it!
            </Button>
          </Flex>
        </Stack>
      );
    }

    return (
      <Stack gap="var(--space-4)" align="center" style={{ textAlign: 'center', padding: '10px 0' }}>
        {/* Step Indicators */}
        <Flex gap="var(--space-2)" justify="center" style={{ marginBottom: '8px' }}>
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              style={{
                width: '8px',
                height: '8px',
                borderRadius: 'var(--radius-full)',
                backgroundColor: i === step ? 'var(--accent)' : i < step ? 'var(--text-heading)' : 'var(--border)',
                transition: 'all var(--transition-fast)'
              }}
            />
          ))}
        </Flex>

        {step === 1 && (
          <Stack gap="var(--space-2)" align="center">
            <div style={iconContainerStyle}>
              <Database size={40} color="var(--accent)" />
            </div>
            <h3 style={stepTitleStyle}>Multi-Tenant Project Databases</h3>
            <p style={descriptionStyle}>
              Every workspace in Gravity runs on its own isolated PostgreSQL boundary. This keeps projects, tickets, and members scoped cleanly while supporting a production-grade multi-tenant architecture.
            </p>
          </Stack>
        )}

        {step === 2 && (
          <Stack gap="var(--space-2)" align="center">
            <div style={iconContainerStyle}>
              <Layers size={40} color="var(--accent)" />
            </div>
            <h3 style={stepTitleStyle}>Cycles & Specialized Domains</h3>
            <p style={descriptionStyle}>
              Organize your tickets into active sprint cycles and assign them to specialized technical domains like Frontend, Backend, DevOps, or Design. This ensures structured sorting and readability.
            </p>
          </Stack>
        )}

        {step === 3 && (
          <Stack gap="var(--space-2)" align="center">
            <div style={iconContainerStyle}>
              <Sparkles size={40} color="var(--accent)" />
            </div>
            <h3 style={stepTitleStyle}>Local Ollama AI Assistant</h3>
            <p style={descriptionStyle}>
              Chat with a completely local Ollama language model directly in your sidebar! Ask it to summarize your backlog, write code snippets, or analyze open tickets without leaking any sensitive data.
            </p>
          </Stack>
        )}

        {step === 4 && (
          <Stack gap="var(--space-2)" align="center">
            <div style={iconContainerStyle}>
              <Terminal size={40} color="var(--accent)" />
            </div>
            <h3 style={stepTitleStyle}>MCP Agent Integrations</h3>
            <p style={descriptionStyle}>
              Gravity features full Model Context Protocol (MCP) integrations! Using the built-in MCP simulator, AI agents like Copilot or web agents can read, create, and resolve tickets just like regular users.
            </p>
          </Stack>
        )}

        <Flex justify="space-between" align="center" style={{ width: '100%', marginTop: '20px' }}>
          <Button variant="default" onClick={handleBack} leftIcon={<ChevronLeft size={16} />}>
            Back
          </Button>
          
          <Button 
            variant="primary" 
            onClick={handleNext}
            rightIcon={step === LAST_ONBOARDING_STEP ? <Check size={16} /> : <ChevronRight size={16} />}
          >
            {step === LAST_ONBOARDING_STEP ? 'Finish Tour' : 'Next'}
          </Button>
        </Flex>
      </Stack>
    );
  };

  return (
    <Modal isOpen={true} onClose={handleSkip} title={step === 0 ? "Welcome to Gravity" : `Workspace Tour - Step ${step}`}>
      {renderContent()}
    </Modal>
  );
};

const iconContainerStyle: React.CSSProperties = {
  padding: '16px',
  borderRadius: '16px',
  background: 'var(--accent-glow)',
  border: '1px solid var(--accent-border)',
  marginBottom: '8px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center'
};

const titleStyle: React.CSSProperties = {
  fontSize: '22px',
  fontWeight: 600,
  color: 'var(--text-heading)',
  letterSpacing: '-0.3px',
  margin: 0
};

const stepTitleStyle: React.CSSProperties = {
  fontSize: '18px',
  fontWeight: 600,
  color: 'var(--text-heading)',
  margin: 0
};

const descriptionStyle: React.CSSProperties = {
  fontSize: '13px',
  color: 'var(--text-muted)',
  lineHeight: '1.6',
  maxWidth: '360px',
  margin: '0 auto',
};
