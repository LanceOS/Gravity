import React from 'react';
import { useProjectContext } from '../../../context/project/ProjectContext';
import { useActiveTicket } from '../../../context/ticket/ActiveTicketContext';
import { useUserDirectory } from '../../../context/user/UserDirectoryContext';
import type { Ticket } from '../../../context/TicketContextContext';
import { FileText, ListPlus, Sparkles, Wifi } from 'lucide-react';
import { AIChatWindow } from '@library';
import type { LocalAIChatProps, QuickActionType, TicketAttachmentScopeMode } from '../types/LocalAIChat';
import { buildAttachedTicketModelContext, buildQuickActionPrompt } from '../utils/LocalAIChat';
import { ChatContextProvider, useChat } from '../context/ChatContext';
import { TicketContextAttachmentBar } from './TicketContextAttachmentBar';

const CLOUD_MODELS: Record<string, string[]> = {
  openai: ['gpt-4o-mini', 'gpt-4o'],
  anthropic: ['claude-3-5-sonnet', 'claude-3-haiku'],
  gemini: ['gemini-1.5-flash', 'gemini-1.5-pro'],
  deepseek: ['deepseek-chat'],
};

function buildAttachmentScopeKey(scopeMode: TicketAttachmentScopeMode | undefined, scopeId: string) {
  return `${scopeMode ?? 'none'}:${scopeId}`;
}

const LocalAIChatInner: React.FC<LocalAIChatProps> = ({
  onClose,
  isClosing,
  variant = 'floating',
  settings,
  ticketAttachmentScopeMode,
  ticketAttachmentProjects,
  ticketAttachmentTeams = [],
  ticketAttachmentDefaultScopeId,
}) => {
  const { activeTicket } = useActiveTicket();
  const { users } = useUserDirectory();
  const { projects } = useProjectContext();
  const [manualAttachmentScopeId, setManualAttachmentScopeId] = React.useState('');
  const [attachedTicketState, setAttachedTicketState] = React.useState<{ scopeKey: string; tickets: Ticket[] }>({
    scopeKey: '',
    tickets: [],
  });

  const isThirdParty = settings.agentIntegration === 'third_party';
  const cloudModelsList = CLOUD_MODELS[settings.aiProvider] || ['gpt-4o-mini'];
  const attachmentProjects = ticketAttachmentProjects ?? projects;
  const attachmentScopeIds = React.useMemo(
    () => new Set((ticketAttachmentScopeMode === 'team' ? ticketAttachmentTeams : attachmentProjects).map((scope) => scope.id)),
    [attachmentProjects, ticketAttachmentScopeMode, ticketAttachmentTeams],
  );
  const selectedAttachmentScopeId = React.useMemo(() => {
    if (!ticketAttachmentScopeMode) {
      return '';
    }

    if (manualAttachmentScopeId && attachmentScopeIds.has(manualAttachmentScopeId)) {
      return manualAttachmentScopeId;
    }

    if (ticketAttachmentDefaultScopeId && attachmentScopeIds.has(ticketAttachmentDefaultScopeId)) {
      return ticketAttachmentDefaultScopeId;
    }

    return ticketAttachmentScopeMode === 'team'
      ? ticketAttachmentTeams[0]?.id || ''
      : attachmentProjects[0]?.id || '';
  }, [
    attachmentProjects,
    attachmentScopeIds,
    manualAttachmentScopeId,
    ticketAttachmentDefaultScopeId,
    ticketAttachmentScopeMode,
    ticketAttachmentTeams,
  ]);
  const attachmentScopeKey = buildAttachmentScopeKey(ticketAttachmentScopeMode, selectedAttachmentScopeId);
  const attachedTickets = attachedTicketState.scopeKey === attachmentScopeKey ? attachedTicketState.tickets : [];

  const handleAttachmentScopeChange = React.useCallback((scopeId: string) => {
    setManualAttachmentScopeId(scopeId);
    setAttachedTicketState({
      scopeKey: buildAttachmentScopeKey(ticketAttachmentScopeMode, scopeId),
      tickets: [],
    });
  }, [ticketAttachmentScopeMode]);

  const handleAttachedTicketsChange = React.useCallback((tickets: Ticket[]) => {
    setAttachedTicketState({
      scopeKey: attachmentScopeKey,
      tickets,
    });
  }, [attachmentScopeKey]);

  const {
    messages,
    isGenerating,
    error,
    model,
    setModel,
    modelStatus,
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

  const handleSendMessage = (text: string) => {
    const modelContext = buildAttachedTicketModelContext({
      tickets: attachedTickets,
      projects: attachmentProjects,
      users,
    });

    void sendMessage(text, modelContext ? { modelContext } : undefined);
  };

  return (
    <AIChatWindow
      isClosing={isClosing}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Wifi size={14} style={{ color: modelStatus === 'connected' ? 'var(--color-success)' : 'var(--color-text-disabled)' }} />
          <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>{modelStatus === 'connected' ? 'Active' : modelStatus === 'checking' ? 'Checking' : 'Offline'}</span>
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
        </div>
      }
      onClose={onClose}
      messages={messages}
      onSendMessage={handleSendMessage}
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
      inputAccessory={
        ticketAttachmentScopeMode ? (
          <TicketContextAttachmentBar
            scopeMode={ticketAttachmentScopeMode}
            projects={attachmentProjects}
            teams={ticketAttachmentTeams}
            selectedScopeId={selectedAttachmentScopeId}
            onScopeChange={handleAttachmentScopeChange}
            attachedTickets={attachedTickets}
            onAttachedTicketsChange={handleAttachedTicketsChange}
          />
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
