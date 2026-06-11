import React, { useEffect, useRef, useState } from 'react';
import { Cpu, Loader2, Send, X } from 'lucide-react';
import { DenseTextarea } from '../densetextarea';
import { AIChatMessageBubble } from './AIChatMessage';
import type { AIChatMessage } from './types';
import { getWindowStyle } from './styles';

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
}: AIChatWindowProps) {
  const [chatInput, setChatInput] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isGenerating]);

  const handleSubmit = (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!chatInput.trim() || isGenerating) return;
    onSendMessage(chatInput);
    setChatInput('');
  };

  return (
    <div
      style={getWindowStyle(isMobile, isClosing)}
    >
      <div
        style={{
          padding: '14px 16px',
          borderBottom: '1px solid var(--color-border-default)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        <Cpu size={16} color="var(--color-primary)" />
        <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--color-text-primary)' }}>
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
            }}
          >
            <X size={16} />
          </button>
        )}
      </div>

      {settingsPanel && (
        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--color-border-default)',
            background: 'var(--color-base50)',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          {settingsPanel}
        </div>
      )}

      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
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
              gap: '6px',
              alignSelf: 'flex-start',
              background: 'var(--color-surface-card)',
              border: '1px solid var(--color-border-default)',
              borderRadius: '8px',
              padding: '10px 12px',
              fontSize: '11px',
              color: 'var(--color-text-disabled)',
            }}
          >
            <Loader2
              size={12}
              className="animate-spin"
              style={{ animation: 'spin 1s linear infinite' }}
            />
            <span>Working...</span>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {quickActions && (
        <div
          style={{
            padding: '8px 12px',
            display: 'flex',
            gap: '6px',
            overflowX: 'auto',
            borderTop: '1px solid var(--color-border-default)',
            background: 'var(--color-base50)',
          }}
        >
          {quickActions}
        </div>
      )}

      <div style={{ padding: '12px', borderTop: '1px solid var(--color-border-default)' }}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', alignItems: 'flex-end', gap: '6px' }}>
          <DenseTextarea
            placeholder={placeholder}
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
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
            style={{ flex: 1 }}
          />
          <button
            type="submit"
            aria-label="Send message"
            className="btn btn-primary clickable"
            style={{ width: '32px', height: '32px', flexShrink: 0, padding: 0 }}
          >
            <Send size={12} />
          </button>
        </form>
      </div>
    </div>
  );
}
