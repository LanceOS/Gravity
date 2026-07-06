import { MessageSquareText } from 'lucide-react';
import { formatRelativeTime } from '@library';
import type { ChatSession } from '../types/ChatSession';

interface ChatHistoryHeaderRowProps {
  sessions: ChatSession[];
  activeSessionId?: string;
  isLoading?: boolean;
  onSelectSession: (sessionId: string) => void;
}

export function ChatHistoryHeaderRow({
  sessions,
  activeSessionId,
  isLoading = false,
  onSelectSession,
}: ChatHistoryHeaderRowProps) {
  if (!isLoading && sessions.length === 0) {
    return null;
  }

  return (
    <div className="workspace-header-chat-history" aria-label="AI chat history">
      {isLoading && sessions.length === 0 ? (
        <span className="workspace-header-chat-history__loading">Loading chats...</span>
      ) : (
        sessions.map((session) => {
          const isActive = session.id === activeSessionId;

          return (
            <button
              key={session.id}
              type="button"
              className={`workspace-header-chat-history__item${isActive ? ' workspace-header-chat-history__item--active' : ''}`}
              onClick={() => onSelectSession(session.id)}
              title={session.lastMessagePreview ? `${session.title}: ${session.lastMessagePreview}` : session.title}
              aria-current={isActive ? 'page' : undefined}
            >
              <MessageSquareText size={13} aria-hidden="true" />
              <span className="workspace-header-chat-history__title">{session.title}</span>
              <span className="workspace-header-chat-history__time">{formatRelativeTime(session.updatedAt)}</span>
            </button>
          );
        })
      )}
    </div>
  );
}
