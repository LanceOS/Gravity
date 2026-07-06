import { History, Loader2, MessageSquareText } from 'lucide-react';
import { useState } from 'react';
import { Popover, formatRelativeTime } from '@library';
import type { ChatSession } from '../types/ChatSession';

interface ChatHistoryMenuButtonProps {
  sessions: ChatSession[];
  activeSessionId?: string;
  isLoading?: boolean;
  isFetchingMoreSessions?: boolean;
  hasMoreSessions?: boolean;
  onLoadMoreSessions?: () => void;
  onSelectSession: (sessionId: string) => void;
}

export function ChatHistoryMenuButton({
  sessions,
  activeSessionId,
  isLoading = false,
  isFetchingMoreSessions = false,
  hasMoreSessions = false,
  onLoadMoreSessions,
  onSelectSession,
}: ChatHistoryMenuButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleSelectSession = (sessionId: string) => {
    setIsOpen(false);
    onSelectSession(sessionId);
  };

  return (
    <Popover
      align="right"
      isOpen={isOpen}
      onOpenChange={setIsOpen}
      contentClassName="workspace-header-chat-menu-popover"
      trigger={
        <button
          type="button"
          className="workspace-header-chat-menu-trigger"
          aria-label="View previous chats"
          aria-haspopup="dialog"
          aria-expanded={isOpen}
          title="View previous chats"
        >
          {isLoading && sessions.length === 0 ? (
            <Loader2 size={15} aria-hidden="true" className="workspace-header-chat-menu-trigger__spinner" />
          ) : (
            <History size={15} aria-hidden="true" />
          )}
          {sessions.length > 0 ? (
            <span className="workspace-header-chat-menu-trigger__badge" aria-hidden="true">
              {Math.min(sessions.length, 99)}
            </span>
          ) : null}
        </button>
      }
    >
      <div className="workspace-header-chat-menu" aria-label="Previous chats">
        <div className="workspace-header-chat-menu__header">
          <span className="workspace-header-chat-menu__title">Previous chats</span>
          <span className="workspace-header-chat-menu__count">
            {isLoading ? 'Loading' : `${sessions.length}`}
          </span>
        </div>

        <div className="workspace-header-chat-menu__list">
          {isLoading && sessions.length === 0 ? (
            <div className="workspace-header-chat-menu__empty">Loading chats...</div>
          ) : sessions.length > 0 ? (
            sessions.map((session) => {
              const isActive = session.id === activeSessionId;
              const preview = session.lastMessagePreview?.trim();

              return (
                <button
                  key={session.id}
                  type="button"
                  className={`workspace-header-chat-menu__item${isActive ? ' workspace-header-chat-menu__item--active' : ''}`}
                  aria-current={isActive ? 'page' : undefined}
                  aria-label={preview ? `${session.title}: ${preview}` : session.title}
                  onClick={() => handleSelectSession(session.id)}
                >
                  <MessageSquareText size={14} aria-hidden="true" className="workspace-header-chat-menu__item-icon" />
                  <span className="workspace-header-chat-menu__item-body">
                    <span className="workspace-header-chat-menu__item-title">{session.title}</span>
                    {preview ? (
                      <span className="workspace-header-chat-menu__item-preview">{preview}</span>
                    ) : null}
                  </span>
                  <span className="workspace-header-chat-menu__item-time">
                    {formatRelativeTime(session.updatedAt)}
                  </span>
                </button>
              );
            })
          ) : (
            <div className="workspace-header-chat-menu__empty">No previous chats</div>
          )}
        </div>

        {hasMoreSessions && onLoadMoreSessions ? (
          <div className="workspace-header-chat-menu__footer">
            <button
              type="button"
              className="workspace-header-chat-menu__load-more"
              disabled={isFetchingMoreSessions}
              onClick={onLoadMoreSessions}
            >
              {isFetchingMoreSessions ? 'Loading more...' : 'Load more'}
            </button>
          </div>
        ) : null}
      </div>
    </Popover>
  );
}
