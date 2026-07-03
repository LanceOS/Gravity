import type { ComponentProps } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { ChatSidebar, type ChatSidebarSession } from '@library';

const sessions: ChatSidebarSession[] = [
  {
    id: 'chat-1',
    title: 'Roadmap Planning',
    lastMessagePreview: 'Let us outline the Q3 roadmap.',
    updatedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'chat-2',
    title: 'Release Notes',
    lastMessagePreview: 'Draft release notes for v2.',
    updatedAt: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
  },
];

function baseProps(overrides: Partial<ComponentProps<typeof ChatSidebar>> = {}) {
  return {
    sessions,
    activeSessionId: undefined,
    isLoading: false,
    isFetchingNextPage: false,
    hasNextPage: false,
    onLoadMore: vi.fn(),
    searchValue: '',
    onSearchChange: vi.fn(),
    onSelectSession: vi.fn(),
    onCreateSession: vi.fn(),
    isCreatingSession: false,
    onRenameSession: vi.fn(),
    onDeleteSession: vi.fn(),
    collapsed: false,
    onToggleCollapsed: vi.fn(),
    ...overrides,
  };
}

describe('ChatSidebar', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders sessions with title, preview, and relative time', () => {
    render(<ChatSidebar {...baseProps()} />);

    expect(screen.getByText('Roadmap Planning')).toBeInTheDocument();
    expect(screen.getByText('Let us outline the Q3 roadmap.')).toBeInTheDocument();
    expect(screen.getByText('Release Notes')).toBeInTheDocument();
    expect(screen.getByText(/hour/)).toBeInTheDocument();
    expect(screen.getByText(/minute/)).toBeInTheDocument();
  });

  it('keeps the sidebar locked to its default expanded width', () => {
    render(<ChatSidebar {...baseProps({
      sessions: [{
        ...sessions[0],
        title: 'An extremely long first message title that would otherwise try to stretch the sidebar beyond its intended width',
        lastMessagePreview: 'A very long preview that should be clipped instead of making the sidebar itself wider than the standard dock size.',
      }],
    })} />);

    expect(screen.getByTestId('chat-sidebar')).toHaveStyle({
      width: '268px',
      minWidth: '268px',
      maxWidth: '268px',
      flexBasis: '268px',
      flexGrow: '0',
      flexShrink: '0',
      overflow: 'hidden',
    });
  });

  it('selects a session when its row is clicked', async () => {
    const user = userEvent.setup();
    const onSelectSession = vi.fn();
    render(<ChatSidebar {...baseProps({ onSelectSession })} />);

    await user.click(screen.getByText('Roadmap Planning'));
    expect(onSelectSession).toHaveBeenCalledWith('chat-1');
  });

  it('creates a new chat when the New Chat button is clicked', async () => {
    const user = userEvent.setup();
    const onCreateSession = vi.fn();
    render(<ChatSidebar {...baseProps({ onCreateSession })} />);

    await user.click(screen.getByRole('button', { name: 'New Chat' }));
    expect(onCreateSession).toHaveBeenCalledTimes(1);
  });

  it('renames a chat inline via double-clicking the title', async () => {
    const user = userEvent.setup();
    const onRenameSession = vi.fn();
    render(<ChatSidebar {...baseProps({ onRenameSession })} />);

    await user.dblClick(screen.getByText('Roadmap Planning'));
    const input = screen.getByLabelText('Chat title');
    await user.clear(input);
    await user.type(input, 'Renamed Roadmap{Enter}');

    expect(onRenameSession).toHaveBeenCalledWith('chat-1', 'Renamed Roadmap');
  });

  it('cancels inline rename on Escape without calling onRenameSession', async () => {
    const user = userEvent.setup();
    const onRenameSession = vi.fn();
    render(<ChatSidebar {...baseProps({ onRenameSession })} />);

    await user.dblClick(screen.getByText('Roadmap Planning'));
    const input = screen.getByLabelText('Chat title');
    await user.type(input, ' extra{Escape}');

    expect(onRenameSession).not.toHaveBeenCalled();
    expect(screen.getByText('Roadmap Planning')).toBeInTheDocument();
  });

  it('deletes a chat after confirming, without triggering selection', async () => {
    const user = userEvent.setup();
    const onDeleteSession = vi.fn();
    const onSelectSession = vi.fn();
    render(<ChatSidebar {...baseProps({ onDeleteSession, onSelectSession })} />);

    await user.click(screen.getByRole('button', { name: 'Delete Roadmap Planning' }));
    expect(onSelectSession).not.toHaveBeenCalled();
    expect(screen.getByText('Delete this chat?')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Confirm delete Roadmap Planning' }));
    expect(onDeleteSession).toHaveBeenCalledWith('chat-1');
    expect(onSelectSession).not.toHaveBeenCalled();
  });

  it('cancels a pending delete confirmation without calling onDeleteSession', async () => {
    const user = userEvent.setup();
    const onDeleteSession = vi.fn();
    render(<ChatSidebar {...baseProps({ onDeleteSession })} />);

    await user.click(screen.getByRole('button', { name: 'Delete Roadmap Planning' }));
    expect(screen.getByText('Delete this chat?')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel delete' }));
    expect(onDeleteSession).not.toHaveBeenCalled();
    expect(screen.queryByText('Delete this chat?')).not.toBeInTheDocument();
    expect(screen.getByText('Roadmap Planning')).toBeInTheDocument();
  });

  it('calls onSearchChange as the user types in the search box', async () => {
    const user = userEvent.setup();
    const onSearchChange = vi.fn();
    render(<ChatSidebar {...baseProps({ onSearchChange })} />);

    await user.type(screen.getByPlaceholderText('Search chats...'), 'roadmap');
    expect(onSearchChange).toHaveBeenCalled();
  });

  it('shows the empty state when there are no sessions and no search term', () => {
    render(<ChatSidebar {...baseProps({ sessions: [] })} />);

    expect(screen.getByText('No conversations yet.')).toBeInTheDocument();
    expect(screen.getByText('Start a new chat.')).toBeInTheDocument();
  });

  it('shows a no-results message when a search yields no sessions', () => {
    render(<ChatSidebar {...baseProps({ sessions: [], searchValue: 'nonexistent' })} />);

    expect(screen.getByText('No chats match your search.')).toBeInTheDocument();
    expect(screen.queryByText('No conversations yet.')).not.toBeInTheDocument();
  });

  it('collapses to an icon-only rail and hides the list and search', () => {
    render(<ChatSidebar {...baseProps({ collapsed: true })} />);

    expect(screen.queryByPlaceholderText('Search chats...')).not.toBeInTheDocument();
    expect(screen.queryByText('Roadmap Planning')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Expand chat history' })).toBeInTheDocument();
    expect(screen.getByTestId('chat-sidebar')).toHaveStyle({
      width: '52px',
      minWidth: '52px',
      maxWidth: '52px',
      flexBasis: '52px',
    });
  });

  it('loads more sessions when the scroll sentinel intersects and more pages remain', () => {
    let capturedCallback: IntersectionObserverCallback | null = null;
    class MockIntersectionObserver {
      constructor(callback: IntersectionObserverCallback) {
        capturedCallback = callback;
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver as unknown as typeof IntersectionObserver);

    const onLoadMore = vi.fn();
    render(<ChatSidebar {...baseProps({ hasNextPage: true, onLoadMore })} />);

    expect(capturedCallback).toBeTruthy();
    capturedCallback!([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);

    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('does not load more while already fetching the next page', () => {
    let capturedCallback: IntersectionObserverCallback | null = null;
    class MockIntersectionObserver {
      constructor(callback: IntersectionObserverCallback) {
        capturedCallback = callback;
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver as unknown as typeof IntersectionObserver);

    const onLoadMore = vi.fn();
    render(<ChatSidebar {...baseProps({ hasNextPage: true, isFetchingNextPage: true, onLoadMore })} />);

    capturedCallback!([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    expect(onLoadMore).not.toHaveBeenCalled();
  });

  it('highlights the active session', () => {
    render(<ChatSidebar {...baseProps({ activeSessionId: 'chat-2' })} />);

    const releaseRow = screen.getByText('Release Notes').closest('[role="button"]');
    expect(releaseRow).toHaveStyle({ background: 'var(--color-state-selected-bg)' });
  });
});
