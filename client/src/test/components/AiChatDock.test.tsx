import type { ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AiChatDock } from '../../modules/chats/components/AiChatDock';

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
  ollamaModel: '',
  ollamaEndpoint: 'http://localhost:11434',
  projectLayout: 'standard' as const,
  apiKey: '',
  aiProvider: 'anthropic' as const,
  agentIntegration: 'third_party' as const,
};

function Wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function renderDock(overrides: Partial<React.ComponentProps<typeof AiChatDock>> = {}) {
  const props = {
    onClose: vi.fn(),
    initialOllamaUrl: '',
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

  return render(<AiChatDock {...props} />, { wrapper: Wrapper });
}

describe('AiChatDock', () => {
  beforeEach(() => {
    mocks.useAuth.mockReset();
    mocks.useUserDirectory.mockReset();
    mocks.useActiveTicket.mockReset();
    mocks.useProjectContext.mockReset();
    mocks.fetch.mockReset();
    vi.stubGlobal('fetch', mocks.fetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the sidebar empty state alongside the chat window', async () => {
    mocks.fetch.mockImplementation((url: string) => {
      if (url.includes('/chats?')) return Promise.resolve(createJsonResponse([]));
      if (url === '/api/v1/mcp/sse') return Promise.resolve(createJsonResponse({ result: { tools: [] } }));
      return Promise.resolve(createJsonResponse({}));
    });

    renderDock();

    await waitFor(() => {
      expect(screen.getByText('No conversations yet.')).toBeInTheDocument();
    });
    expect(screen.getByPlaceholderText('Ask AI a question...')).toBeInTheDocument();
  });

  it('creates a new chat session and reuses it for the next message instead of creating another', async () => {
    const user = userEvent.setup();
    mocks.fetch.mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/chats?')) return Promise.resolve(createJsonResponse([]));
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

    await waitFor(() => {
      expect(screen.getByText('No conversations yet.')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'New Chat' }));

    await waitFor(() => {
      const createCalls = mocks.fetch.mock.calls.filter(
        (call) => call[0] === '/api/v1/projects/project-1/chats' && call[1]?.method === 'POST'
      );
      expect(createCalls).toHaveLength(1);
    });

    const chatInput = await screen.findByPlaceholderText('Ask AI a question...');
    await user.type(chatInput, 'Hello');
    const form = chatInput.closest('form');
    await user.click(screen.getByRole('button', { name: 'Send message' }));
    void form;

    await waitFor(() => {
      expect(screen.getByText('Hi there')).toBeInTheDocument();
    });

    const createCallsAfterSend = mocks.fetch.mock.calls.filter(
      (call) => call[0] === '/api/v1/projects/project-1/chats' && call[1]?.method === 'POST'
    );
    expect(createCallsAfterSend).toHaveLength(1);

    const streamCalls = mocks.fetch.mock.calls.filter((call) => call[0] === '/api/v1/projects/project-1/chats/chat-new/stream');
    expect(streamCalls).toHaveLength(1);
  });

  it('loads a past session transcript when selected from the sidebar', async () => {
    const user = userEvent.setup();
    mocks.fetch.mockImplementation((url: string) => {
      if (url.includes('/chats?')) {
        return Promise.resolve(createJsonResponse([{
          id: 'chat-old',
          projectId: 'project-1',
          teamId: 'team-1',
          userId: 'user-1',
          title: 'Old Chat',
          lastMessagePreview: 'Hi! How can I help?',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        }]));
      }
      if (url === '/api/v1/mcp/sse') return Promise.resolve(createJsonResponse({ result: { tools: [] } }));
      if (url === '/api/v1/projects/project-1/chats/chat-old') {
        return Promise.resolve(createJsonResponse({
          id: 'chat-old',
          projectId: 'project-1',
          teamId: 'team-1',
          userId: 'user-1',
          title: 'Old Chat',
          lastMessagePreview: 'Hi! How can I help?',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          messages: [
            { id: 'm1', sessionId: 'chat-old', role: 'user', content: 'Hello from before', metadata: {}, createdAt: '2026-01-01T00:00:01.000Z' },
            { id: 'm2', sessionId: 'chat-old', role: 'assistant', content: 'Hi! How can I help?', metadata: {}, createdAt: '2026-01-01T00:00:02.000Z' },
          ],
        }));
      }
      return Promise.resolve(createJsonResponse({}));
    });

    renderDock();

    await waitFor(() => {
      expect(screen.getByText('Old Chat')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Hi! How can I help?'));

    await waitFor(() => {
      expect(mocks.fetch.mock.calls.some((call) => call[0] === '/api/v1/projects/project-1/chats/chat-old')).toBe(true);
    });

    await waitFor(() => {
      expect(screen.getByText('Hello from before')).toBeInTheDocument();
      expect(screen.getAllByText('Hi! How can I help?').length).toBeGreaterThan(0);
    });
  });
});
