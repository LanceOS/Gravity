import React, { useEffect, useRef, useState } from 'react';
import { Cpu, Send, X, Sparkles } from 'lucide-react';
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
  inputAccessory?: React.ReactNode;
  error?: React.ReactNode;
  onRetry?: () => void;
  onRegenerate?: () => void;
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
  inputAccessory,
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

  const isStartingOut = messages.length === 0 && !isGenerating;
  const generatingIconAnimation = isReduced ? 'none' : 'chat-generating-pulse 1.8s ease-in-out infinite';
  const generatingSparkleAnimation = isReduced ? 'none' : 'chat-generating-twinkle 1.2s ease-in-out infinite';
  const generatingHaloAnimation = isReduced ? 'none' : 'chat-generating-halo 1.8s ease-in-out infinite';

  return (
    <div
      ref={windowRef}
      style={getWindowStyle(variant, isMobile, isClosing)}
    >
      <style>{`
        @keyframes chat-generating-pulse {
          0%, 100% { transform: scale(1) rotate(0deg); }
          35% { transform: scale(1.08) rotate(-6deg); }
          70% { transform: scale(0.96) rotate(4deg); }
        }
        @keyframes chat-generating-twinkle {
          0%, 100% { opacity: 0.45; transform: scale(0.85) rotate(0deg); }
          50% { opacity: 1; transform: scale(1.18) rotate(12deg); }
        }
        @keyframes chat-generating-halo {
          0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--color-primary) 18%, transparent); }
          50% { box-shadow: 0 0 0 8px color-mix(in srgb, var(--color-primary) 0%, transparent); }
        }
      `}</style>
      <div
        style={{
          padding: '14px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          background: 'transparent',
        }}
      >
        <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--color-text-primary)', letterSpacing: '-0.01em', display: 'flex', alignItems: 'center' }}>
          {!isStartingOut && title}
        </div>

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
          flex: isStartingOut ? 0 : 1,
          overflowY: 'auto',
          padding: isStartingOut ? 0 : '20px 16px',
          display: isStartingOut ? 'none' : 'flex',
          flexDirection: 'column',
          gap: '18px',
          background: 'transparent',
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
            <div
              data-testid="chat-generating-icon"
              aria-hidden="true"
              style={{
                position: 'relative',
                width: '22px',
                height: '22px',
                borderRadius: '999px',
                display: 'grid',
                placeItems: 'center',
                background: 'var(--color-state-selected-bg)',
                border: '1px solid var(--color-border-focus)',
                color: 'var(--color-primary)',
                animation: generatingHaloAnimation,
                flexShrink: 0,
              }}
            >
              <Cpu
                size={12}
                style={{
                  animation: generatingIconAnimation,
                  transformOrigin: 'center',
                }}
              />
              <Sparkles
                size={9}
                style={{
                  position: 'absolute',
                  top: '-4px',
                  right: '-4px',
                  color: 'var(--color-primary)',
                  animation: generatingSparkleAnimation,
                  transformOrigin: 'center',
                }}
              />
            </div>
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
          background: 'transparent',
          ...(isStartingOut ? {
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            maxWidth: '600px',
            margin: '0 auto',
            width: '100%',
          } : {})
        }}
      >
        {isStartingOut && (
          <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'center' }}>
            {title}
          </div>
        )}
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
            width: isStartingOut ? '100%' : undefined,
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
        {inputAccessory && (
          <div
            style={{
              marginTop: '8px',
              width: '100%',
            }}
          >
            {inputAccessory}
          </div>
        )}
      </div>
    </div>
  );
}
