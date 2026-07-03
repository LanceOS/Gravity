import React, { useEffect, useRef, useState } from 'react';
import { ChatSidebar } from '@library';
import { LocalAIChat, type Message } from '../../ai';
import type { WorkspaceSettings } from '../../../utils/settings';
import { useChatSessionsList } from '../hooks/useChatSessionsList';
import { getChatSession } from '../utils/chatSessionsApi';

interface WorkspaceChatDockProps {
  initialOllamaUrl: string;
  initialModel: string;
  settings: WorkspaceSettings;
  workspaceId?: string;
  projectId?: string;
  isMobile?: boolean;
  variant?: 'embedded' | 'framed';
  className?: string;
  style?: React.CSSProperties;
}

export function WorkspaceChatDock({
  initialOllamaUrl,
  initialModel,
  settings,
  workspaceId,
  projectId,
  isMobile = false,
  variant = 'embedded',
  className,
  style,
}: WorkspaceChatDockProps) {
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

  const [selectedChatId, setSelectedChatId] = useState('');
  const [liveChatId, setLiveChatId] = useState('');
  const [activeMessages, setActiveMessages] = useState<Message[] | undefined>(undefined);
  const [isLoadingSession, setIsLoadingSession] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [chatViewVersion, setChatViewVersion] = useState(0);
  const hasResolvedProjectIdRef = useRef(false);

  useEffect(() => {
    if (!hasResolvedProjectIdRef.current) {
      hasResolvedProjectIdRef.current = true;
      return;
    }

    setSelectedChatId('');
    setLiveChatId('');
    setActiveMessages(undefined);
    setChatViewVersion((current) => current + 1);
  }, [resolvedProjectId]);

  const activeSidebarChatId = selectedChatId || liveChatId;

  const handleSelectSession = async (chatId: string) => {
    if (!resolvedProjectId || chatId === activeSidebarChatId) {
      return;
    }

    setIsLoadingSession(true);
    try {
      const detail = await getChatSession(resolvedProjectId, chatId);
      const transcript: Message[] = detail.messages
        .filter((message) => message.role === 'user' || message.role === 'assistant')
        .map((message) => ({ role: message.role, content: message.content }));
      setActiveMessages(transcript);
      setSelectedChatId(chatId);
      setLiveChatId(chatId);
      setChatViewVersion((current) => current + 1);
    } catch (error) {
      console.error('Failed to load chat session:', error);
    } finally {
      setIsLoadingSession(false);
    }
  };

  const handleCreateSession = async () => {
    if (!resolvedProjectId) {
      return;
    }

    try {
      const created = await createSession();
      setSelectedChatId(created.id);
      setLiveChatId(created.id);
      setActiveMessages([]);
      setChatViewVersion((current) => current + 1);
    } catch (error) {
      console.error('Failed to create chat session:', error);
    }
  };

  const handleDeleteSession = (chatId: string) => {
    deleteSession(chatId);
    if (chatId === selectedChatId || chatId === liveChatId) {
      setSelectedChatId('');
      setLiveChatId('');
      setActiveMessages(undefined);
      setChatViewVersion((current) => current + 1);
    }
  };

  const handleSessionCreatedFromChatWindow = (chatId: string) => {
    setLiveChatId(chatId);
    refreshSessions();
  };

  const sidebarSessions = sessions.map((session) => ({
    id: session.id,
    title: session.title,
    lastMessagePreview: session.lastMessagePreview,
    updatedAt: session.updatedAt,
  }));

  const resolvedSidebarCollapsed = isMobile ? false : sidebarCollapsed;
  const isEmbedded = variant === 'embedded';
  const sidebarStyle: React.CSSProperties = {
    flex: isMobile ? '0 0 auto' : '0 0 auto',
    width: isMobile ? '100%' : undefined,
    minWidth: isMobile ? 0 : undefined,
    height: isMobile ? '280px' : '100%',
    borderRight: isMobile ? 'none' : '1px solid var(--color-border-default)',
    borderBottom: isEmbedded ? 'none' : (isMobile ? '1px solid var(--color-border-default)' : undefined),
  };

  return (
    <div
      className={className}
      style={{
        ...style,
        minWidth: 0,
        minHeight: 0,
        height: '100%',
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        overflow: 'hidden',
        border: isEmbedded ? 'none' : '1px solid var(--color-border-default)',
        borderRadius: isEmbedded ? 0 : '20px',
        background: isEmbedded ? 'transparent' : 'var(--color-surface-elevated)',
        boxShadow: isEmbedded ? 'none' : 'var(--shadow-xl)',
      }}
    >
      <ChatSidebar
        sessions={sidebarSessions}
        activeSessionId={activeSidebarChatId}
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
        collapsed={resolvedSidebarCollapsed}
        onToggleCollapsed={isMobile ? undefined : () => setSidebarCollapsed((prev) => !prev)}
        style={sidebarStyle}
      />

      <div style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
        <LocalAIChat
          key={`${resolvedProjectId || 'no-project'}:${chatViewVersion}`}
          initialOllamaUrl={initialOllamaUrl}
          initialModel={initialModel}
          settings={settings}
          workspaceId={workspaceId}
          projectId={resolvedProjectId}
          seedChatSessionId={selectedChatId}
          seedMessages={activeMessages}
          onSessionCreated={handleSessionCreatedFromChatWindow}
          variant="embedded"
        />
      </div>
    </div>
  );
}
