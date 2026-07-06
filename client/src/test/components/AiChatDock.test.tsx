import type { ComponentProps } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AiChatDock } from '../../modules/aiChat/components/AiChatDock';

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useUserDirectory: vi.fn(),
  useActiveTicket: vi.fn(),
  useProjectContext: vi.fn(),
  fetch: vi.fn(),
}));

function createJsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  };
}

vi.mock('../../context/auth/AuthContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../context/auth/AuthContext')>();
  return { ...actual, useAuth: mocks.useAuth };
});

vi.mock('../../context/user/UserDirectoryContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../context/user/UserDirectoryContext')>();
  return { ...actual, useUserDirectory: mocks.useUserDirectory };
});

vi.mock('../../context/ticket/ActiveTicketContext', () => ({
  useActiveTicket: mocks.useActiveTicket,
}));

vi.mock('../../context/project/ProjectContext', () => ({
  useProjectContext: mocks.useProjectContext,
}));

vi.mock('../../context/label/LabelContext', () => ({
  useLabels: () => ({ labels: [], globalLabels: [], labelsByProject: new Map(), assignLabelToTicket: vi.fn(), unassignLabelFromTicket: vi.fn(), createLabel: vi.fn(), updateLabel: vi.fn(), deleteLabel: vi.fn() }),
}));

vi.mock('../../context/cycle/CycleContext', () => ({
  useCycles: () => ({ cycles: [] }),
}));

const mockSettings = {
  defaultView: 'board' as const,
  theme: 'dark' as const,
  projectLayout: 'standard' as const,
  apiKey: '',
  aiProvider: 'anthropic' as const,
};

function renderDock(overrides: Partial<ComponentProps<typeof AiChatDock>> = {}) {
  const props = {
    onClose: vi.fn(),
    initialModel: 'claude-3-haiku',
    settings: mockSettings,
    workspaceId: 'workspace-1',
    projectId: 'project-1',
    ...overrides,
  };

  mocks.useAuth.mockReturnValue({
    currentUser: { id: 'user-1', name: 'Casey Carter', email: 'casey@example.com', avatar: '', role: 'owner' },
    loading: false,
    isAuthenticated: true,
    signOut: vi.fn(),
  });
  mocks.useUserDirectory.mockReturnValue({ users: [], isLoading: false });
  mocks.useActiveTicket.mockReturnValue({ activeTicket: null, setActiveTicket: vi.fn() });
  mocks.useProjectContext.mockReturnValue({ projects: [] });

  return render(<AiChatDock {...props} />);
}

describe('AiChatDock', () => {
  beforeEach(() => {
    mocks.useAuth.mockReset();
    mocks.useUserDirectory.mockReset();
    mocks.useActiveTicket.mockReset();
    mocks.useProjectContext.mockReset();
    mocks.fetch.mockReset();
    vi.stubGlobal('fetch', mocks.fetch);

    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the quick chat window without a history sidebar', async () => {
    mocks.fetch.mockImplementation((url: string) => {
      if (url === '/api/v1/mcp/sse') return Promise.resolve(createJsonResponse({ result: { tools: [] } }));
      return Promise.resolve(createJsonResponse({}));
    });

    renderDock();

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Ask AI a question...')).toBeInTheDocument();
    });

    expect(screen.queryByText('No conversations yet.')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New Chat' })).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Search chats...')).not.toBeInTheDocument();
  });

  it('creates a chat session on first send and reuses it for later messages', async () => {
    const user = userEvent.setup();
    mocks.fetch.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/api/v1/mcp/sse') return Promise.resolve(createJsonResponse({ result: { tools: [] } }));
      if (url === '/api/v1/projects/project-1/chats' && init?.method === 'POST') {
        return Promise.resolve(createJsonResponse({
          id: 'chat-new',
          projectId: 'project-1',
          teamId: 'team-1',
          userId: 'user-1',
          title: 'New Chat',
          lastMessagePreview: null,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        }, 201));
      }
      if (url === '/api/v1/projects/project-1/chats/chat-new/stream') {
        return Promise.resolve({
          ok: true,
          status: 200,
          statusText: 'OK',
          text: vi.fn().mockResolvedValue(
            'data: {"type":"done","message":"Hi there","messageId":"msg-1","provider":"anthropic","model":"claude-3-haiku","fallback":false,"toolCalls":null}\n\n'
          ),
        });
      }
      return Promise.resolve(createJsonResponse({}));
    });

    renderDock();

    const chatInput = await screen.findByPlaceholderText('Ask AI a question...');
    await user.type(chatInput, 'Hello');
    await user.click(screen.getByRole('button', { name: 'Send message' }));

    await waitFor(() => {
      expect(screen.getAllByText('Hi there').length).toBeGreaterThan(0);
    });

    const createCallsAfterFirstSend = mocks.fetch.mock.calls.filter(
      (call) => call[0] === '/api/v1/projects/project-1/chats' && call[1]?.method === 'POST'
    );
    expect(createCallsAfterFirstSend).toHaveLength(1);

    await user.type(chatInput, 'Second prompt');
    await user.click(screen.getByRole('button', { name: 'Send message' }));

    await waitFor(() => {
      expect(screen.getAllByText('Hi there').length).toBeGreaterThan(0);
    });

    const createCallsAfterSecondSend = mocks.fetch.mock.calls.filter(
      (call) => call[0] === '/api/v1/projects/project-1/chats' && call[1]?.method === 'POST'
    );
    expect(createCallsAfterSecondSend).toHaveLength(1);

    const streamCalls = mocks.fetch.mock.calls.filter((call) => call[0] === '/api/v1/projects/project-1/chats/chat-new/stream');
    expect(streamCalls).toHaveLength(2);
  });
});
