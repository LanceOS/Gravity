import React, { useEffect, useRef, useState } from 'react';
import { Send, Sparkles, User, Copy, RefreshCw, AlertCircle, Check, Loader2 } from 'lucide-react';
import { DenseTextarea } from '../densetextarea';
import { FormattedMarkdown } from './FormattedMarkdown';
import type { AIChatMessage } from './types';

export interface ChatInterfaceProps {
  sessionId: string;
  messages: AIChatMessage[];
  onSendMessage: (content: string) => void;
  isGenerating?: boolean;
  onRegenerate?: () => void;
  error?: string | null;
  onRetry?: () => void;
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
}

export function ChatInterface({
  sessionId,
  messages,
  onSendMessage,
  isGenerating = false,
  onRegenerate,
  error,
  onRetry,
  placeholder = 'Ask AI a question...',
  className,
  style,
}: ChatInterfaceProps) {
  const [input, setInput] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollPositionsRef = useRef<Record<string, number>>({});
  const isFirstRender = useRef(true);

  // Handle scroll events to save the scroll position for the current session
  const handleScroll = () => {
    if (scrollContainerRef.current && sessionId) {
      scrollPositionsRef.current[sessionId] = scrollContainerRef.current.scrollTop;
    }
  };

  // Restore scroll position when sessionId changes
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    // Save previous scroll position before changing if sessionId is set
    const savedPosition = scrollPositionsRef.current[sessionId];
    if (savedPosition !== undefined) {
      container.scrollTop = savedPosition;
    } else {
      container.scrollTop = container.scrollHeight;
    }
    isFirstRender.current = false;
  }, [sessionId]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (isFirstRender.current) return;
    const container = scrollContainerRef.current;
    if (!container) return;

    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 120;
    const lastMessage = messages[messages.length - 1];

    if (isNearBottom || (lastMessage && lastMessage.role === 'user') || isGenerating) {
      // Small timeout to allow content to render
      setTimeout(() => {
        container.scrollTop = container.scrollHeight;
      }, 50);
    }
  }, [messages.length, isGenerating]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input.trim() || isGenerating) return;
    onSendMessage(input);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (input.trim() && !isGenerating) {
        onSendMessage(input);
        setInput('');
      }
    }
  };

  const handleCopy = async (content: string, index: number) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch (err) {
      console.error('Failed to copy message:', err);
    }
  };

  // Calculate word count
  const wordCount = input.trim().split(/\s+/).filter(Boolean).length;
  const characterCount = input.length;

  return (
    <div
      className={className}
      data-testid="chat-interface"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        minWidth: 0,
        minHeight: 0,
        overflow: 'hidden',
        background: 'var(--color-surface-app)',
        ...style,
      }}
    >
      <style>{`
        @keyframes bounce {
          0%, 80%, 100% { transform: scale(0); }
          40% { transform: scale(1.0); }
        }
      `}</style>

      {/* Messages Scroll Container */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        data-testid="message-list"
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '20px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '24px',
        }}
      >
        {messages.map((m, idx) => {
          if (m.role === 'tool') return null;
          if (m.role === 'assistant' && m.tool_calls && !m.content) return null;

          const isUser = m.role === 'user';
          const isSystem = m.role === 'system';

          return (
            <div
              key={idx}
              style={{
                display: 'flex',
                gap: '12px',
                alignItems: 'flex-start',
                alignSelf: isUser ? 'flex-end' : 'flex-start',
                maxWidth: '85%',
                flexDirection: isUser ? 'row-reverse' : 'row',
              }}
            >
              {/* Avatar */}
              {!isSystem && (
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    background: isUser
                      ? 'linear-gradient(135deg, var(--color-primary) 0%, color-mix(in srgb, var(--color-primary) 85%, #000) 100%)'
                      : 'var(--color-surface-card)',
                    border: isUser ? 'none' : '1px solid var(--color-border-default)',
                    color: isUser ? 'var(--color-text-on-accent)' : 'var(--color-primary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    boxShadow: 'var(--shadow-sm)',
                  }}
                >
                  {isUser ? <User size={14} /> : <Sparkles size={14} />}
                </div>
              )}

              {/* Message Bubble & Buttons Container */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: isUser ? 'flex-end' : 'flex-start',
                }}
              >
                {/* Bubble */}
                <div
                  style={{
                    whiteSpace: 'pre-wrap',
                    overflowWrap: 'anywhere',
                    wordWrap: 'break-word',
                    wordBreak: 'break-word',
                    background: isUser
                      ? 'linear-gradient(135deg, var(--color-primary) 0%, color-mix(in srgb, var(--color-primary) 85%, #000) 100%)'
                      : isSystem
                      ? 'var(--color-bg-error)'
                      : 'var(--color-surface-card)',
                    border: `1px solid ${
                      isUser
                        ? 'transparent'
                        : isSystem
                        ? 'var(--color-border-error)'
                        : 'var(--color-border-default)'
                    }`,
                    borderRadius: isUser ? '16px 16px 4px 16px' : isSystem ? '12px' : '16px 16px 16px 4px',
                    padding: '12px 16px',
                    fontSize: '12.5px',
                    lineHeight: '1.6',
                    color: isUser
                      ? 'var(--color-text-on-accent)'
                      : isSystem
                      ? 'var(--color-text-on-danger)'
                      : 'var(--color-text-primary)',
                    boxShadow: isUser
                      ? '0 4px 12px color-mix(in srgb, var(--color-primary) 15%, transparent)'
                      : 'var(--shadow-sm)',
                  }}
                >
                  {m.content && <FormattedMarkdown text={m.content} />}
                </div>

                {/* Actions (Only for AI Assistant responses) */}
                {m.role === 'assistant' && m.content && (
                  <div
                    style={{
                      display: 'flex',
                      gap: '8px',
                      marginTop: '6px',
                      opacity: 0.8,
                    }}
                  >
                    <button
                      type="button"
                      aria-label="Copy message"
                      onClick={() => handleCopy(m.content, idx)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--color-text-disabled)',
                        fontSize: '11px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        transition: 'color var(--transition-fast), background var(--transition-fast)',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-text-secondary)'; e.currentTarget.style.background = 'var(--color-base100)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-disabled)'; e.currentTarget.style.background = 'transparent'; }}
                    >
                      {copiedIndex === idx ? (
                        <>
                          <Check size={11} style={{ color: 'var(--color-success)' }} />
                          <span style={{ color: 'var(--color-success)' }}>Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy size={11} />
                          <span>Copy</span>
                        </>
                      )}
                    </button>

                    {idx === messages.length - 1 && onRegenerate && (
                      <button
                        type="button"
                        aria-label="Regenerate message"
                        onClick={onRegenerate}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--color-text-disabled)',
                          fontSize: '11px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          transition: 'color var(--transition-fast), background var(--transition-fast)',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-text-secondary)'; e.currentTarget.style.background = 'var(--color-base100)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-disabled)'; e.currentTarget.style.background = 'transparent'; }}
                      >
                        <RefreshCw size={11} />
                        <span>Regenerate</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Streaming / Generating typing indicator */}
        {isGenerating && (
          <div
            style={{
              display: 'flex',
              gap: '12px',
              alignItems: 'flex-start',
              alignSelf: 'flex-start',
              maxWidth: '85%',
            }}
          >
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                background: 'var(--color-surface-card)',
                border: '1px solid var(--color-border-default)',
                color: 'var(--color-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              <Sparkles size={14} />
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: 'var(--color-surface-card)',
                border: '1px solid var(--color-border-default)',
                borderRadius: '16px 16px 16px 4px',
                padding: '10px 14px',
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              <span style={{ fontSize: '11.5px', color: 'var(--color-text-secondary)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                Generating answer
                <span style={{ display: 'inline-flex', gap: '3px', marginLeft: '2px' }} data-testid="typing-dots">
                  <span style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: 'var(--color-text-secondary)', animation: 'bounce 1.4s infinite ease-in-out both', animationDelay: '-0.32s' }} />
                  <span style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: 'var(--color-text-secondary)', animation: 'bounce 1.4s infinite ease-in-out both', animationDelay: '-0.16s' }} />
                  <span style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: 'var(--color-text-secondary)', animation: 'bounce 1.4s infinite ease-in-out both' }} />
                </span>
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Area: Errors & Input Panel */}
      <div
        style={{
          padding: '12px 16px 16px',
          background: 'transparent',
          borderTop: '1px solid var(--color-border-default)',
        }}
      >
        {/* Inline Error State */}
        {error && (
          <div
            data-testid="error-container"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'var(--color-bg-error)',
              border: '1px solid var(--color-border-error)',
              borderRadius: '8px',
              padding: '10px 14px',
              marginBottom: '12px',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-text-error)', fontSize: '12px' }}>
              <AlertCircle size={14} style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="btn btn-sm btn-primary clickable"
                style={{
                  padding: '4px 8px',
                  fontSize: '11px',
                  minHeight: 'auto',
                  flexShrink: 0,
                }}
              >
                Retry
              </button>
            )}
          </div>
        )}

        {/* Input Form */}
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
            width: '100%',
          }}
        >
          <DenseTextarea
            placeholder={placeholder}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            onKeyDown={handleKeyDown}
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
            disabled={!input.trim() || isGenerating}
            className="clickable"
            style={{
              width: '30px',
              height: '30px',
              flexShrink: 0,
              padding: 0,
              borderRadius: '50%',
              border: 'none',
              background: input.trim() && !isGenerating ? 'var(--color-primary)' : 'var(--color-base100)',
              color: input.trim() && !isGenerating ? 'var(--color-text-on-accent)' : 'var(--color-text-disabled)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: input.trim() && !isGenerating ? 'pointer' : 'not-allowed',
              transition: 'background-color var(--transition-fast), color var(--transition-fast)',
            }}
          >
            {isGenerating ? (
              <Loader2 size={12} className="animate-spin" style={{ animation: 'spin 1s linear infinite' }} />
            ) : (
              <Send size={12} />
            )}
          </button>
        </form>

        {/* Helpful text / word & character counters */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '10px',
            color: 'var(--color-text-disabled)',
            marginTop: '6px',
            padding: '0 4px',
          }}
        >
          <span>Press Enter to send, Shift+Enter for newline</span>
          {characterCount > 0 && (
            <span data-testid="char-count">
              {characterCount} characters ({wordCount} words)
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
