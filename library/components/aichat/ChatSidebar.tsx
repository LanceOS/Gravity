import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronsLeft, ChevronsRight, MessageSquarePlus, Trash2, X } from 'lucide-react';
import { Button } from '../button';
import { SearchInput } from '../searchinput';
import { EmptyState } from '../emptystate';
import { formatRelativeTime } from '../../utilities';

export interface ChatSidebarSession {
  id: string;
  title: string;
  lastMessagePreview?: string | null;
  updatedAt: string;
}

export interface ChatSidebarProps {
  sessions: ChatSidebarSession[];
  activeSessionId?: string;
  isLoading?: boolean;
  isFetchingNextPage?: boolean;
  hasNextPage?: boolean;
  onLoadMore?: () => void;
  searchValue: string;
  onSearchChange: (value: string) => void;
  onSelectSession: (sessionId: string) => void;
  onCreateSession: () => void;
  isCreatingSession?: boolean;
  onRenameSession: (sessionId: string, title: string) => void;
  onDeleteSession: (sessionId: string) => void;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  style?: React.CSSProperties;
  className?: string;
}

const COLLAPSED_WIDTH = 52;
const EXPANDED_WIDTH = 268;

export function ChatSidebar({
  sessions,
  activeSessionId,
  isLoading = false,
  isFetchingNextPage = false,
  hasNextPage = false,
  onLoadMore,
  searchValue,
  onSearchChange,
  onSelectSession,
  onCreateSession,
  isCreatingSession = false,
  onRenameSession,
  onDeleteSession,
  collapsed = false,
  onToggleCollapsed,
  style,
  className,
}: ChatSidebarProps) {
  const [editingSessionId, setEditingSessionId] = useState('');
  const [editingTitle, setEditingTitle] = useState('');
  const [confirmingDeleteId, setConfirmingDeleteId] = useState('');
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (collapsed || !onLoadMore) {
      return;
    }

    const node = sentinelRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting) && hasNextPage && !isFetchingNextPage && !isLoading) {
          onLoadMore();
        }
      },
      { root: node.parentElement, threshold: 0 }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [collapsed, hasNextPage, isFetchingNextPage, isLoading, onLoadMore, sessions.length]);

  const startEditing = (session: ChatSidebarSession) => {
    setEditingSessionId(session.id);
    setEditingTitle(session.title);
  };

  const commitEditing = () => {
    const trimmed = editingTitle.trim();
    const originalTitle = sessions.find((session) => session.id === editingSessionId)?.title;
    if (editingSessionId && trimmed && trimmed !== originalTitle) {
      onRenameSession(editingSessionId, trimmed);
    }
    setEditingSessionId('');
    setEditingTitle('');
  };

  const cancelEditing = () => {
    setEditingSessionId('');
    setEditingTitle('');
  };

  const trimmedSearch = searchValue.trim();
  const showEmptyState = !isLoading && sessions.length === 0;

  return (
    <div
      className={className}
      data-testid="chat-sidebar"
      data-collapsed={collapsed ? 'true' : 'false'}
      style={{
        width: collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH,
        minWidth: collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        borderRight: '1px solid var(--color-border-default)',
        background: 'var(--color-surface-app)',
        transition: 'width 0.22s cubic-bezier(0.2, 0, 0.38, 1), min-width 0.22s cubic-bezier(0.2, 0, 0.38, 1)',
        overflow: 'hidden',
        ...style,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '12px 10px',
          borderBottom: '1px solid var(--color-border-default)',
          justifyContent: collapsed ? 'center' : 'flex-start',
        }}
      >
        {onToggleCollapsed && (
          <button
            type="button"
            className="clickable"
            aria-label={collapsed ? 'Expand chat history' : 'Collapse chat history'}
            onClick={onToggleCollapsed}
            style={{
              border: 'none',
              background: 'transparent',
              color: 'var(--color-text-disabled)',
              display: 'flex',
              alignItems: 'center',
              padding: '4px',
              cursor: 'pointer',
              flexShrink: 0,
              borderRadius: 'var(--radius-sm)',
              transition: 'color var(--transition-fast), background-color var(--transition-fast)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-text-secondary)'; e.currentTarget.style.backgroundColor = 'var(--color-base100)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-disabled)'; e.currentTarget.style.backgroundColor = 'transparent'; }}
          >
            {collapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
          </button>
        )}

        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={onCreateSession}
          loading={isCreatingSession}
          aria-label="New Chat"
          style={collapsed ? { flex: 'none', width: '32px', height: '32px', padding: 0, borderRadius: '50%' } : { flex: 1 }}
        >
          <MessageSquarePlus size={14} />
          {!collapsed && <span>New Chat</span>}
        </Button>
      </div>

      {!collapsed && (
        <div style={{ padding: '8px' }}>
          <SearchInput
            placeholder="Search chats..."
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
            aria-label="Search chats"
          />
        </div>
      )}

      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: collapsed ? '12px 0' : '0 6px 6px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: collapsed ? 'center' : 'stretch',
          gap: collapsed ? '8px' : '2px',
        }}
      >
        {isLoading && sessions.length === 0 ? (
          <div style={{ padding: '16px 8px', fontSize: '12px', color: 'var(--color-text-disabled)', textAlign: 'center' }}>
            {collapsed ? '...' : 'Loading chats...'}
          </div>
        ) : showEmptyState ? (
          collapsed ? null : trimmedSearch ? (
            <div
              style={{
                padding: '24px 8px',
                fontSize: '12px',
                color: 'var(--color-text-disabled)',
                textAlign: 'center',
              }}
            >
              No chats match your search.
            </div>
          ) : (
            <EmptyState
              title="No conversations yet."
              description="Start a new chat."
              style={{ border: 'none', background: 'transparent', padding: '32px 12px' }}
            />
          )
        ) : (
          <>
            {sessions.map((session) => {
              const isActive = session.id === activeSessionId;
              const isEditing = session.id === editingSessionId;
              const isConfirmingDelete = session.id === confirmingDeleteId;

              if (collapsed) {
                const initials = session.title.trim().substring(0, 2).toUpperCase() || 'CH';
                return (
                  <div
                    key={session.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => onSelectSession(session.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onSelectSession(session.id);
                      }
                    }}
                    className="clickable"
                    title={session.title}
                    style={{
                      position: 'relative',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '36px',
                      height: '36px',
                      borderRadius: 'var(--radius-full)',
                      background: isActive
                        ? 'var(--color-primary)'
                        : 'var(--color-surface-card)',
                      color: isActive
                        ? 'var(--color-text-on-accent)'
                        : 'var(--color-text-secondary)',
                      border: isActive
                        ? '1px solid var(--color-primary)'
                        : '1px solid var(--color-border-default)',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      boxShadow: isActive ? '0 0 0 2px var(--color-state-selected-bg)' : 'none',
                      transition: 'all var(--transition-fast)',
                    }}
                  >
                    {isActive && (
                      <div
                        style={{
                          position: 'absolute',
                          left: '-6px',
                          width: '3px',
                          height: '16px',
                          borderRadius: '0 4px 4px 0',
                          background: 'var(--color-primary)',
                        }}
                      />
                    )}
                    <span>{initials}</span>
                  </div>
                );
              }

              return (
                <div
                  key={session.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => !isEditing && !isConfirmingDelete && onSelectSession(session.id)}
                  onKeyDown={(event) => {
                    if (!isEditing && !isConfirmingDelete && (event.key === 'Enter' || event.key === ' ')) {
                      event.preventDefault();
                      onSelectSession(session.id);
                    }
                  }}
                  className="clickable"
                  style={{
                    position: 'relative',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '3px',
                    padding: '10px 12px 10px 18px',
                    borderRadius: 'var(--radius-sm)',
                    background: isActive ? 'var(--color-state-selected-bg)' : 'transparent',
                    marginBottom: '3px',
                    cursor: 'pointer',
                    transition: 'all var(--transition-fast)',
                    border: '1px solid transparent',
                    borderColor: isActive ? 'var(--color-border-focus)' : 'transparent',
                  }}
                >
                  {isActive && (
                    <div
                      style={{
                        position: 'absolute',
                        left: '4px',
                        top: '10px',
                        bottom: '10px',
                        width: '3px',
                        borderRadius: 'var(--radius-full)',
                        background: 'var(--color-primary)',
                      }}
                    />
                  )}

                  {isConfirmingDelete ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                      <span style={{ fontSize: '12px', color: 'var(--color-text-primary)' }}>Delete this chat?</span>
                      <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                        <button
                          type="button"
                          aria-label="Cancel delete"
                          onClick={(event) => {
                            event.stopPropagation();
                            setConfirmingDeleteId('');
                          }}
                          className="btn btn-sm clickable"
                          style={{ padding: '2px 6px', minHeight: 'auto', display: 'flex', alignItems: 'center' }}
                        >
                          <X size={12} />
                        </button>
                        <button
                          type="button"
                          aria-label={`Confirm delete ${session.title}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            onDeleteSession(session.id);
                            setConfirmingDeleteId('');
                          }}
                          className="btn btn-sm btn-primary clickable"
                          style={{ padding: '2px 6px', minHeight: 'auto', display: 'flex', alignItems: 'center' }}
                        >
                          <Check size={12} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {isEditing ? (
                          <input
                            autoFocus
                            value={editingTitle}
                            onChange={(event) => setEditingTitle(event.target.value)}
                            onClick={(event) => event.stopPropagation()}
                            onBlur={commitEditing}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.preventDefault();
                                commitEditing();
                              } else if (event.key === 'Escape') {
                                event.preventDefault();
                                cancelEditing();
                              }
                            }}
                            aria-label="Chat title"
                            style={{
                              flex: 1,
                              minWidth: 0,
                              fontSize: '12.5px',
                              fontWeight: 600,
                              color: 'var(--color-text-primary)',
                              background: 'var(--color-surface-card)',
                              border: '1px solid var(--color-border-focus)',
                              borderRadius: '4px',
                              padding: '2px 4px',
                            }}
                          />
                        ) : (
                          <span
                            onClick={(event) => {
                              event.stopPropagation();
                              startEditing(session);
                            }}
                            title="Click to rename"
                            style={{
                              flex: 1,
                              minWidth: 0,
                              fontSize: '12.5px',
                              fontWeight: 600,
                              color: isActive ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              transition: 'color var(--transition-fast)',
                            }}
                          >
                            {session.title}
                          </span>
                        )}

                        <button
                          type="button"
                          aria-label={`Delete ${session.title}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            setConfirmingDeleteId(session.id);
                          }}
                          className="clickable"
                          style={{
                            flexShrink: 0,
                            border: 'none',
                            background: 'transparent',
                            color: 'var(--color-text-disabled)',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            padding: '2px',
                            transition: 'color var(--transition-fast)',
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-error)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-disabled)'; }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>

                      {session.lastMessagePreview && (
                        <span
                          style={{
                            fontSize: '11.5px',
                            color: 'var(--color-text-disabled)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            opacity: 0.85,
                          }}
                        >
                          {session.lastMessagePreview}
                        </span>
                      )}

                      <span style={{ fontSize: '10.5px', color: 'var(--color-text-disabled)', opacity: 0.6 }}>
                        {formatRelativeTime(session.updatedAt)}
                      </span>
                    </>
                  )}
                </div>
              );
            })}

            {hasNextPage && (
              <div
                ref={sentinelRef}
                style={{ padding: '8px', textAlign: 'center', fontSize: '11px', color: 'var(--color-text-disabled)' }}
              >
                {isFetchingNextPage ? 'Loading more…' : ''}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
