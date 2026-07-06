import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ChatHistoryMenuButton } from '../../modules/chats/components/ChatHistoryMenuButton';
import type { ChatSession } from '../../modules/chats';

function makeSession(overrides: Partial<ChatSession> = {}): ChatSession {
  return {
    id: 'chat-1',
    projectId: 'project-1',
    teamId: 'team-1',
    userId: 'user-1',
    title: 'Planning Chat',
    lastMessagePreview: 'Sketch the rollout plan',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    ...overrides,
  };
}

describe('ChatHistoryMenuButton', () => {
  it('opens a previous chat list and selects a chat', async () => {
    const user = userEvent.setup();
    const onSelectSession = vi.fn();

    render(
      <ChatHistoryMenuButton
        sessions={[
          makeSession(),
          makeSession({
            id: 'chat-2',
            title: 'Follow-up Chat',
            lastMessagePreview: 'Review the final notes',
            updatedAt: '2026-01-03T00:00:00.000Z',
          }),
        ]}
        activeSessionId="chat-2"
        onSelectSession={onSelectSession}
      />
    );

    await user.click(screen.getByRole('button', { name: 'View previous chats' }));

    expect(screen.getByText('Previous chats')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Planning Chat: Sketch the rollout plan/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Follow-up Chat: Review the final notes/i })).toHaveAttribute(
      'aria-current',
      'page'
    );

    await user.click(screen.getByRole('button', { name: /Planning Chat: Sketch the rollout plan/i }));

    expect(onSelectSession).toHaveBeenCalledWith('chat-1');
    await waitFor(() => {
      expect(screen.queryByText('Previous chats')).not.toBeInTheDocument();
    });
  });

  it('shows an empty state when there are no previous chats', async () => {
    const user = userEvent.setup();

    render(<ChatHistoryMenuButton sessions={[]} onSelectSession={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'View previous chats' }));

    expect(screen.getByText('No previous chats')).toBeInTheDocument();
  });

  it('loads more previous chats when additional pages are available', async () => {
    const user = userEvent.setup();
    const onLoadMoreSessions = vi.fn();

    render(
      <ChatHistoryMenuButton
        sessions={[makeSession()]}
        hasMoreSessions
        onLoadMoreSessions={onLoadMoreSessions}
        onSelectSession={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: 'View previous chats' }));
    await user.click(screen.getByRole('button', { name: 'Load more' }));

    expect(onLoadMoreSessions).toHaveBeenCalledTimes(1);
  });
});
