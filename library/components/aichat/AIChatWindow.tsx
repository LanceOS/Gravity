import React, { useEffect, useRef, useState } from 'react';
import { Cpu, Loader2, Send, X, Sparkles } from 'lucide-react';
import { DenseTextarea } from '../densetextarea';
import { AIChatMessageBubble } from './AIChatMessage';
import type { AIChatMessage } from './types';
import { getWindowStyle, type AIChatWindowVariant } from './styles';
import anime from 'animejs';

export interface AIChatWindowProps {
  title?: React.ReactNode;
  onClose?: () => void;
  messages: AIChatMessage[];
  onSendMessage: (text: string) => void;
  isGenerating?: boolean;
  settingsPanel?: React.ReactNode;
  quickActions?: React.ReactNode;
  placeholder?: string;
  isClosing?: boolean;
  variant?: AIChatWindowVariant;
}

export function AIChatWindow({
  title = 'AI Assistant',
  onClose,
  messages,
  onSendMessage,
  isGenerating = false,
  settingsPanel,
  quickActions,
  placeholder = 'Ask AI a question...',
  isClosing = false,
  variant = 'floating',
}: AIChatWindowProps) {
  const [chatInput, setChatInput] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = useState(false);
  const windowRef = useRef<HTMLDivElement>(null);
  const isReduced = typeof window === 'undefined'
    ? false
    : window.matchMedia('(prefers-reduced-motion: reduce)').matches || (typeof process !== 'undefined' && process.env.NODE_ENV === 'test');

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isGenerating]);

  useEffect(() => {
    if (isReduced) {
      return;
    }
    if (windowRef.current) {
      if (variant === 'floating' && isClosing) {
        anime({
          targets: windowRef.current,
          opacity: [1, 0],
          translateY: [0, 12],
          duration: 180,
          easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
        });
      } else if (variant === 'floating') {
        windowRef.current.style.opacity = '0';
        windowRef.current.style.transform = 'translateY(12px)';
        anime({
          targets: windowRef.current,
          opacity: [0, 1],
          translateY: [12, 0],
          duration: 220,
          easing: 'cubic-bezier(0.2, 0, 0.38, 1)',
        });
      }
    }
  }, [isClosing, isReduced, variant]);

  useEffect(() => {
    return () => {
      if (windowRef.current) {
        anime.remove(windowRef.current);
      }
    };
  }, []);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!chatInput.trim() || isGenerating) return;
    onSendMessage(chatInput);
    setChatInput('');
  };

  return (
    <div
      ref={windowRef}
      style={getWindowStyle(variant, isMobile, isClosing)}
    >
      <div
        style={{
          padding: '14px 16px',
          borderBottom: '1px solid var(--color-border-default)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          background: 'color-mix(in srgb, var(--color-surface-elevated) 85%, transparent)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
        }}
      >
        <Sparkles size={16} color="var(--color-primary)" style={{ flexShrink: 0 }} />
        <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--color-text-primary)', letterSpacing: '-0.01em' }}>
          {title}
        </span>

        {onClose && (
          <button
            type="button"
            aria-label="Close chat"
            onClick={onClose}
            className="clickable"
            style={{
              marginLeft: 'auto',
              border: 'none',
              background: 'transparent',
              color: 'var(--color-text-disabled)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '6px',
              borderRadius: '50%',
              transition: 'color var(--transition-fast), background-color var(--transition-fast)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-text-primary)'; e.currentTarget.style.backgroundColor = 'var(--color-base100)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-disabled)'; e.currentTarget.style.backgroundColor = 'transparent'; }}
          >
            <X size={15} />
          </button>
        )}
      </div>

      {settingsPanel && (
        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--color-border-default)',
            background: 'var(--color-surface-app)',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            opacity: 0.95,
          }}
        >
          {settingsPanel}
        </div>
      )}

      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '20px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '18px',
          background: 'color-mix(in srgb, var(--color-surface-elevated) 40%, var(--color-surface-app))',
        }}
      >
        {messages.map((m, idx) => (
          <AIChatMessageBubble key={idx} message={m} />
        ))}

        {isGenerating && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              alignSelf: 'flex-start',
              background: 'var(--color-surface-card)',
              border: '1px solid var(--color-border-default)',
              borderRadius: '12px',
              padding: '10px 14px',
              fontSize: '11.5px',
              color: 'var(--color-text-secondary)',
              boxShadow: 'var(--shadow-sm)',
              animation: 'pulse 2s infinite',
            }}
          >
            <Loader2
              size={12}
              className="animate-spin"
              style={{ animation: 'spin 1s linear infinite' }}
            />
            <span style={{ fontWeight: 500 }}>Generating answer...</span>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {quickActions && (
        <div
          style={{
            padding: '10px 16px',
            display: 'flex',
            gap: '8px',
            overflowX: 'auto',
            borderTop: '1px solid var(--color-border-default)',
            background: 'var(--color-surface-app)',
            alignItems: 'center',
          }}
        >
          {quickActions}
        </div>
      )}

      <div
        style={{
          padding: '12px 16px 16px',
          borderTop: '1px solid var(--color-border-default)',
          background: 'var(--color-surface-elevated)',
        }}
      >
        <form
          onSubmit={handleSubmit}
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            gap: '8px',
            background: 'var(--color-surface-card)',
            border: isFocused ? '1px solid var(--color-primary)' : '1px solid var(--color-border-default)',
            borderRadius: '16px',
            padding: '8px 10px 8px 14px',
            boxShadow: isFocused ? '0 0 0 3px var(--color-state-selected-bg)' : 'var(--shadow-sm)',
            transition: 'border-color var(--transition-fast), box-shadow var(--transition-fast)',
          }}
        >
          <DenseTextarea
            placeholder={placeholder}
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (chatInput.trim() && !isGenerating) {
                  onSendMessage(chatInput);
                  setChatInput('');
                }
              }
            }}
            autoGrow
            className="input-seamless"
            style={{
              flex: 1,
              minHeight: '24px',
              maxHeight: '180px',
              fontSize: '12.5px',
              color: 'var(--color-text-primary)',
              background: 'transparent',
              padding: 0,
            }}
          />
          <button
            type="submit"
            aria-label="Send message"
            disabled={!chatInput.trim() || isGenerating}
            className="clickable"
            style={{
              width: '30px',
              height: '30px',
              flexShrink: 0,
              padding: 0,
              borderRadius: '50%',
              border: 'none',
              background: chatInput.trim() && !isGenerating ? 'var(--color-primary)' : 'var(--color-base100)',
              color: chatInput.trim() && !isGenerating ? 'var(--color-text-on-accent)' : 'var(--color-text-disabled)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: chatInput.trim() && !isGenerating ? 'pointer' : 'not-allowed',
              transition: 'background-color var(--transition-fast), color var(--transition-fast)',
            }}
          >
            <Send size={12} />
          </button>
        </form>
      </div>
    </div>
  );
}
