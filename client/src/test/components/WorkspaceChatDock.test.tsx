import type { ComponentProps, ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceChatDock } from '../../modules/aiChat/components/WorkspaceChatDock';

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

function renderDock(overrides: Partial<ComponentProps<typeof WorkspaceChatDock>> = {}) {
  const props = {
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

  return render(<WorkspaceChatDock {...props} />, { wrapper: Wrapper });
}

describe('WorkspaceChatDock', () => {
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

  it('renders the history sidebar alongside the embedded chat window', async () => {
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

    const user = userEvent.setup();
    const { container } = renderDock();

    await waitFor(() => {
      expect(screen.getByText('Old Chat')).toBeInTheDocument();
    });

    const dockStyle = (container.firstElementChild as HTMLElement).style.cssText;
    expect(dockStyle).toContain('border-radius: 0');
    expect(dockStyle).toContain('box-shadow: none');
    expect(screen.getByTestId('chat-sidebar')).toHaveStyle({
      borderRight: 'none',
    });

    const sessionRow = screen.getByText('Old Chat').closest('[role="button"]');
    expect(sessionRow).not.toBeNull();

    await user.click(sessionRow as HTMLElement);

    await waitFor(() => {
      expect(screen.getByText('Hello from before')).toBeInTheDocument();
      expect(screen.getAllByText('Hi! How can I help?').length).toBeGreaterThan(0);
    });
  });
});
