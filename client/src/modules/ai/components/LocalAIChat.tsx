import React from 'react';
import { useAuth } from '../../../context/auth/AuthContext';
import { useProjectContext } from '../../../context/project/ProjectContext';
import { useActiveTicket } from '../../../context/ticket/ActiveTicketContext';
import { useUserDirectory } from '../../../context/user/UserDirectoryContext';
import { FileText, ListPlus, Sparkles } from 'lucide-react';
import { AIChatWindow } from '@library';
import type { LocalAIChatProps, QuickActionType } from '../types/LocalAIChat';
import { buildQuickActionPrompt } from '../utils/LocalAIChat';
import { ChatContextProvider, useChat } from '../context/ChatContext';

const CLOUD_MODELS: Record<string, string[]> = {
  openai: ['gpt-4o-mini', 'gpt-4o'],
  anthropic: ['claude-3-5-sonnet', 'claude-3-haiku'],
  gemini: ['gemini-1.5-flash', 'gemini-1.5-pro'],
  deepseek: ['deepseek-chat'],
};

const LocalAIChatInner: React.FC<LocalAIChatProps> = ({
  onClose,
  isClosing,
  variant = 'floating',
  settings,
}) => {
  const { activeTicket } = useActiveTicket();
  const { users } = useUserDirectory();
  const { projects } = useProjectContext();

  const isThirdParty = settings.agentIntegration === 'third_party';
  const cloudModelsList = CLOUD_MODELS[settings.aiProvider] || ['gpt-4o-mini'];

  const {
    messages,
    isGenerating,
    error,
    model,
    setModel,
    detectedModels,
    isCheckingModel,
    sendMessage,
    regenerate,
    retry,
    setMessages,
  } = useChat();

  const handleQuickAction = (actionType: QuickActionType) => {
    if (!activeTicket) {
      setMessages((currentMessages) => [
        ...currentMessages,
        {
          role: 'system',
          content: 'Select a ticket from the board or list first, then rerun the quick action.',
        },
      ]);
      return;
    }

    void sendMessage(buildQuickActionPrompt(actionType, { activeTicket, projects, users }));
  };

  return (
    <AIChatWindow
      isClosing={isClosing}
      title={
        <select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          disabled={!isThirdParty && (isCheckingModel || detectedModels.length === 0)}
          style={{
            fontSize: '13px',
            fontWeight: 600,
            background: 'transparent',
            color: 'var(--color-text-primary)',
            border: 'none',
            outline: 'none',
            cursor: 'pointer',
            padding: 0,
            fontFamily: 'inherit',
            letterSpacing: '-0.01em',
            textOverflow: 'ellipsis',
            overflow: 'hidden',
            whiteSpace: 'nowrap',
          }}
          className="clickable"
        >
          {isThirdParty ? (
            cloudModelsList.map((m) => (
              <option key={m} value={m} style={{ background: 'var(--color-surface-card)', color: 'var(--color-text-primary)', fontSize: '12px', fontWeight: 500 }}>
                {m}
              </option>
            ))
          ) : detectedModels.length > 0 ? (
            detectedModels.map((m) => (
              <option key={m} value={m} style={{ background: 'var(--color-surface-card)', color: 'var(--color-text-primary)', fontSize: '12px', fontWeight: 500 }}>
                {m}
              </option>
            ))
          ) : (
            <option value="" style={{ background: 'var(--color-surface-card)', color: 'var(--color-text-disabled)' }}>
              {isCheckingModel ? 'Checking...' : 'No models'}
            </option>
          )}
        </select>
      }
      onClose={onClose}
      messages={messages}
      onSendMessage={(text) => void sendMessage(text)}
      isGenerating={isGenerating}
      placeholder={activeTicket ? "Ask about this ticket..." : "Ask AI a question..."}
      variant={variant}
      error={error}
      onRetry={() => void retry()}
      onRegenerate={() => void regenerate()}
      quickActions={
        activeTicket ? (
          <>
            <button
              onClick={() => handleQuickAction('analyze')}
              className="btn clickable"
              style={{ padding: '4px 8px', fontSize: '10px', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--color-surface-card)', color: 'var(--color-text-primary)' }}
            >
              <FileText size={10} />
              <span>Analyze Ticket</span>
            </button>

            <button
              onClick={() => handleQuickAction('subtasks')}
              className="btn clickable"
              style={{ padding: '4px 8px', fontSize: '10px', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--color-surface-card)', color: 'var(--color-text-primary)' }}
            >
              <ListPlus size={10} />
              <span>Create Checklist</span>
            </button>

            <button
              onClick={() => handleQuickAction('release')}
              className="btn clickable"
              style={{ padding: '4px 8px', fontSize: '10px', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--color-surface-card)', color: 'var(--color-text-primary)' }}
            >
              <Sparkles size={10} />
              <span>Draft Release</span>
            </button>
          </>
        ) : undefined
      }
    />
  );
};

export const LocalAIChat: React.FC<LocalAIChatProps> = (props) => {
  return (
    <ChatContextProvider {...props}>
      <LocalAIChatInner {...props} />
    </ChatContextProvider>
  );
};
