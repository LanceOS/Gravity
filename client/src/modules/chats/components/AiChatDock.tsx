import React, { useEffect, useState } from 'react';
import { History, X } from 'lucide-react';
import { ChatSidebar, Portal } from '@library';
import { LocalAIChat, type Message } from '../../ai';
import type { WorkspaceSettings } from '../../../utils/settings';
import { useChatSessionsList } from '../hooks/useChatSessionsList';
import { getChatSession } from '../utils/chatSessionsApi';

const DESKTOP_CHAT_WINDOW_WIDTH = 360;
const DESKTOP_CHAT_WINDOW_RIGHT_OFFSET = 24;
const DESKTOP_SIDEBAR_GAP = 12;
const DESKTOP_PANEL_TOP = '64px';
const DESKTOP_PANEL_HEIGHT = '580px';
const DESKTOP_PANEL_MAX_HEIGHT = 'calc(100vh - 140px)';

export interface AiChatDockProps {
  onClose: () => void;
  initialOllamaUrl: string;
  initialModel: string;
  settings: WorkspaceSettings;
  workspaceId?: string;
  projectId?: string;
  isClosing?: boolean;
  isMobile?: boolean;
}

export function AiChatDock({
  onClose,
  initialOllamaUrl,
  initialModel,
  settings,
  workspaceId,
  projectId,
  isClosing,
  isMobile = false,
}: AiChatDockProps) {
  const resolvedProjectId = projectId?.trim() || '';

  const {
    sessions,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    searchValue,
    setSearchValue,
    createSession,
    isCreatingSession,
    renameSession,
    deleteSession,
    refreshSessions,
  } = useChatSessionsList(resolvedProjectId);

  const [activeChatId, setActiveChatId] = useState('');
  const [activeMessages, setActiveMessages] = useState<Message[] | undefined>(undefined);
  const [isLoadingSession, setIsLoadingSession] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  useEffect(() => {
    setActiveChatId('');
    setActiveMessages(undefined);
  }, [resolvedProjectId]);

  const handleSelectSession = async (chatId: string) => {
    if (!resolvedProjectId || chatId === activeChatId) {
      setIsMobileSidebarOpen(false);
      return;
    }

    setIsLoadingSession(true);
    try {
      const detail = await getChatSession(resolvedProjectId, chatId);
      const transcript: Message[] = detail.messages
        .filter((message) => message.role === 'user' || message.role === 'assistant')
        .map((message) => ({ role: message.role, content: message.content }));
      setActiveChatId(chatId);
      setActiveMessages(transcript);
    } catch (error) {
      console.error('Failed to load chat session:', error);
    } finally {
      setIsLoadingSession(false);
      setIsMobileSidebarOpen(false);
    }
  };

  const handleCreateSession = async () => {
    if (!resolvedProjectId) {
      return;
    }

    try {
      const created = await createSession();
      setActiveChatId(created.id);
      setActiveMessages([]);
    } catch (error) {
      console.error('Failed to create chat session:', error);
    } finally {
      setIsMobileSidebarOpen(false);
    }
  };

  const handleDeleteSession = (chatId: string) => {
    deleteSession(chatId);
    if (chatId === activeChatId) {
      setActiveChatId('');
      setActiveMessages(undefined);
    }
  };

  const handleSessionCreatedFromChatWindow = (chatId: string) => {
    setActiveChatId(chatId);
    refreshSessions();
  };

  const sidebarSessions = sessions.map((session) => ({
    id: session.id,
    title: session.title,
    lastMessagePreview: session.lastMessagePreview,
    updatedAt: session.updatedAt,
  }));

  const renderSidebar = (collapsed: boolean, onToggleCollapsed?: () => void) => (
    <ChatSidebar
      sessions={sidebarSessions}
      activeSessionId={activeChatId}
      isLoading={isLoading || isLoadingSession}
      isFetchingNextPage={isFetchingNextPage}
      hasNextPage={hasNextPage}
      onLoadMore={fetchNextPage}
      searchValue={searchValue}
      onSearchChange={setSearchValue}
      onSelectSession={(chatId) => void handleSelectSession(chatId)}
      onCreateSession={() => void handleCreateSession()}
      isCreatingSession={isCreatingSession}
      onRenameSession={renameSession}
      onDeleteSession={handleDeleteSession}
      collapsed={collapsed}
      onToggleCollapsed={onToggleCollapsed}
      style={{ height: '100%', borderRight: 'none' }}
    />
  );

  const chatWindow = (
    <LocalAIChat
      key={`${resolvedProjectId || 'no-project'}:${activeChatId || 'unstarted'}`}
      onClose={onClose}
      initialOllamaUrl={initialOllamaUrl}
      initialModel={initialModel}
      settings={settings}
      workspaceId={workspaceId}
      projectId={resolvedProjectId}
      isClosing={isClosing}
      seedChatSessionId={activeChatId}
      seedMessages={activeMessages}
      onSessionCreated={handleSessionCreatedFromChatWindow}
    />
  );

  if (isMobile) {
    return (
      <>
        <button
          type="button"
          aria-label="Show chat history"
          onClick={() => setIsMobileSidebarOpen(true)}
          className="clickable"
          style={{
            position: 'fixed',
            top: '20px',
            left: '16px',
            zIndex: 901,
            width: '32px',
            height: '32px',
            borderRadius: '8px',
            border: '1px solid var(--color-border-default)',
            background: 'var(--color-surface-card)',
            color: 'var(--color-text-secondary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <History size={14} />
        </button>

        {chatWindow}

        {isMobileSidebarOpen && (
          <Portal>
            <div style={{ position: 'fixed', inset: 0, zIndex: 950, display: 'flex' }}>
              <div
                onClick={() => setIsMobileSidebarOpen(false)}
                style={{ position: 'absolute', inset: 0, background: 'rgba(0, 0, 0, 0.45)' }}
              />
              <div
                style={{
                  position: 'relative',
                  height: '100%',
                  width: '85%',
                  maxWidth: '320px',
                  boxShadow: 'var(--shadow-xl)',
                }}
              >
                {renderSidebar(false, undefined)}
                <button
                  type="button"
                  aria-label="Close chat history"
                  onClick={() => setIsMobileSidebarOpen(false)}
                  className="clickable"
                  style={{
                    position: 'absolute',
                    top: '10px',
                    right: '10px',
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--color-text-disabled)',
                  }}
                >
                  <X size={16} />
                </button>
              </div>
            </div>
          </Portal>
        )}
      </>
    );
  }

  return (
    <>
      <div
        style={{
          position: 'fixed',
          top: DESKTOP_PANEL_TOP,
          right: `${DESKTOP_CHAT_WINDOW_RIGHT_OFFSET + DESKTOP_CHAT_WINDOW_WIDTH + DESKTOP_SIDEBAR_GAP}px`,
          height: DESKTOP_PANEL_HEIGHT,
          maxHeight: DESKTOP_PANEL_MAX_HEIGHT,
          borderRadius: '16px',
          overflow: 'hidden',
          border: '1px solid var(--color-border-default)',
          boxShadow: 'var(--shadow-xl)',
          zIndex: 900,
        }}
      >
        {renderSidebar(sidebarCollapsed, () => setSidebarCollapsed((prev) => !prev))}
      </div>

      {chatWindow}
    </>
  );
}
