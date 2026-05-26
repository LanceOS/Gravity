import type { CSSProperties, ChangeEvent, InputHTMLAttributes } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalAIChat } from '../../modules/ai';

const mocks = vi.hoisted(() => ({
  useTickets: vi.fn(),
  fetch: vi.fn(),
}));

type MockInputProps = InputHTMLAttributes<HTMLInputElement> & {
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
};

function createJsonResponse(body: unknown, ok = true) {
  return {
    ok,
    json: vi.fn().mockResolvedValue(body),
  };
}

vi.mock('../../context/TicketContext', () => ({
  useTickets: mocks.useTickets,
}));

vi.mock('@library', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../library')>();

  return {
    ...actual,
    DenseTextInput: ({ value, onChange, ...props }: MockInputProps) => (
      <input value={value} onChange={onChange} {...props} />
    ),
  };
});

vi.mock('../../modules/ai/components/LocalAIChat/components', () => ({
  FormattedMarkdown: ({ text }: { text: string }) => <div>{text}</div>,
}));

const activeTicket = {
  id: 'ticket-1',
  key: 'GRA-101',
  title: 'Setup auth gateway',
  description: 'Implement token validation on the API edge.',
  status: 'todo' as const,
  priority: 'high' as const,
  assigneeId: 'user-1',
  projectId: 'project-1',
  domainId: 'domain-1',
  cycleId: null,
  parentId: null,
  prStatus: 'none' as const,
  prUrl: null,
  createdAt: '2026-05-01T00:00:00.000Z',
  updatedAt: '2026-05-01T00:00:00.000Z',
};

const projects = [
  {
    id: 'project-1',
    name: 'Gravity Core',
    description: 'Primary project',
    key: 'GRA',
    status: 'active' as const,
    workspaceId: 'workspace-1',
  },
];

const users = [
  {
    id: 'user-1',
    name: 'Casey Carter',
    email: 'casey@example.com',
    avatar: '',
    role: 'owner',
  },
];

const mockSettings = {
  defaultView: 'board' as const,
  theme: 'dark' as const,
  ollamaModel: '',
  ollamaEndpoint: 'http://localhost:11434',
  projectLayout: 'standard' as const,
  apiKey: '',
  aiProvider: 'openai' as const,
  agentIntegration: 'ollama' as const,
};

function renderLocalAIChat(overrides: Partial<Parameters<typeof LocalAIChat>[0]> = {}, ticketContextOverrides = {}) {
  const props = {
    onClose: vi.fn(),
    initialOllamaUrl: '',
    initialModel: '',
    settings: mockSettings,
    workspaceId: 'workspace-1',
    ...overrides,
  };

  mocks.useTickets.mockReturnValue({
    activeTicket: null,
    projects,
    users,
    ...ticketContextOverrides,
  });

  return {
    ...render(<LocalAIChat {...props} />),
    props,
  };
}

describe('LocalAIChat', () => {
  beforeEach(() => {
    mocks.useTickets.mockReset();
    mocks.fetch.mockReset();
    vi.stubGlobal('fetch', mocks.fetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('checks the initial Ollama status, fills the default model, and sends a typed chat message', async () => {
    const user = userEvent.setup();
    mocks.fetch.mockImplementation((url: string) => {
      if (url === '/api/v1/mcp/sse') return Promise.resolve(createJsonResponse({ result: { tools: [] } }));
      if (url.includes('ollama/models')) return Promise.resolve(createJsonResponse({ models: ['llama3'], connected: true }));
      if (url === '/api/v1/ai/chat') return Promise.resolve(createJsonResponse({ message: { content: 'AI says hello' } }));
      return Promise.resolve(createJsonResponse({}));
    });

    renderLocalAIChat();

    await waitFor(() => {
      expect(screen.getByText('Active')).toBeInTheDocument();
    });

    // Check if ollama models was called
    const modelsCall = mocks.fetch.mock.calls.find(call => call[0].includes('ollama/models'));
    expect(modelsCall).toBeDefined();
    
    expect(screen.getByDisplayValue('llama3')).toBeInTheDocument();

    const chatInput = screen.getByPlaceholderText('Ask AI a question...');
    await user.type(chatInput, 'Summarize the backlog');

    const chatForm = chatInput.closest('form');
    expect(chatForm).not.toBeNull();
    fireEvent.submit(chatForm as HTMLFormElement);

    await waitFor(() => {
      expect(screen.getByText('AI says hello')).toBeInTheDocument();
    });

    const chatRequest = mocks.fetch.mock.calls.find(call => call[0] === '/api/v1/ai/chat');
    expect(chatRequest).toBeDefined();
    expect(chatRequest![1]).toMatchObject({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    expect(JSON.parse(chatRequest![1]?.body as string)).toMatchObject({
      ollamaUrl: 'http://localhost:11434',
      model: 'llama3',
      messages: expect.arrayContaining([
        expect.objectContaining({ role: 'user', content: 'Summarize the backlog' }),
      ]),
    });

    expect(screen.getByText('Summarize the backlog')).toBeInTheDocument();
  });

  it('sends a quick-action prompt from the active ticket context and surfaces Ollama errors', async () => {
    const user = userEvent.setup();
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    mocks.fetch.mockImplementation((url: string) => {
      if (url === '/api/v1/mcp/sse') return Promise.resolve(createJsonResponse({ result: { tools: [] } }));
      if (url.includes('ollama/models')) return Promise.resolve(createJsonResponse({ models: ['codellama'], connected: true }));
      if (url === '/api/v1/ai/chat') return Promise.resolve(createJsonResponse({ error: 'chat exploded' }, false));
      return Promise.resolve(createJsonResponse({}));
    });

    renderLocalAIChat(
      {
        initialOllamaUrl: 'http://ollama.internal:11434',
        initialModel: 'codellama',
      },
      { activeTicket }
    );

    await waitFor(() => {
      expect(screen.getByText('Analyze Ticket')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Analyze Ticket' }));

    await waitFor(() => {
      expect(screen.getByText(/Failed to contact local Ollama/i)).toBeInTheDocument();
    });

    const quickActionRequest = mocks.fetch.mock.calls.find(call => call[0] === '/api/v1/ai/chat');
    expect(quickActionRequest).toBeDefined();

    const payload = JSON.parse(quickActionRequest![1]?.body as string);
    expect(payload).toMatchObject({
      ollamaUrl: 'http://ollama.internal:11434',
      model: 'codellama',
    });
    expect(payload.messages.at(-1)?.content).toContain('Key: GRA-101');
    expect(payload.messages.at(-1)?.content).toContain('Project: Gravity Core');
    expect(payload.messages.at(-1)?.content).toContain('Assignee: Casey Carter');
    expect(screen.getByText(/chat exploded/i)).toBeInTheDocument();

    consoleErrorSpy.mockRestore();
  });

  it('fetches MCP tools on mount and executes them automatically', async () => {
    const user = userEvent.setup();
    let chatCount = 0;
    let sseCount = 0;
    mocks.fetch.mockImplementation((url: string) => {
      if (url === '/api/v1/mcp/sse') {
        sseCount++;
        if (sseCount === 1) {
          return Promise.resolve(createJsonResponse({ result: { tools: [{ name: 'list_tickets' }] } }));
        }
        return Promise.resolve(createJsonResponse({
          result: { content: [{ text: 'Found 1 ticket' }] }
        }));
      }
      if (url.includes('ollama/models')) {
        return Promise.resolve(createJsonResponse({ models: ['llama3'], connected: true }));
      }
      if (url === '/api/v1/ai/chat') {
        chatCount++;
        if (chatCount === 1) {
          return Promise.resolve(createJsonResponse({ 
            message: { 
              role: 'assistant', 
              content: '',
              tool_calls: [{ id: 'call_1', name: 'list_tickets', arguments: '{}' }] 
            } 
          }));
        }
        return Promise.resolve(createJsonResponse({
          message: { role: 'assistant', content: 'You have 1 ticket' }
        }));
      }
      return Promise.resolve(createJsonResponse({}));
    });

    renderLocalAIChat();

    await waitFor(() => {
      expect(screen.getByText('Active')).toBeInTheDocument();
    });

    const chatInput = screen.getByPlaceholderText('Ask AI a question...');
    await user.type(chatInput, 'List my tickets');
    
    const chatForm = chatInput.closest('form');
    fireEvent.submit(chatForm as HTMLFormElement);

    await waitFor(() => {
      expect(screen.getByText('You have 1 ticket')).toBeInTheDocument();
    });

    // Check fetch calls without assuming a fixed startup call order
    const toolsListReq = mocks.fetch.mock.calls.find(([url, init]) => {
      if (url !== '/api/v1/mcp/sse' || !init?.body) {
        return false;
      }

      return JSON.parse(init.body as string).method === 'tools/list';
    });
    expect(toolsListReq).toBeDefined();
    expect(toolsListReq?.[0]).toBe('/api/v1/mcp/sse');
    expect(JSON.parse(toolsListReq?.[1].body as string)).toMatchObject({ method: 'tools/list' });

    const firstChatReq = mocks.fetch.mock.calls.find(([url, init]) => {
      if (url !== '/api/v1/ai/chat' || !init?.body) {
        return false;
      }

      const body = JSON.parse(init.body as string);
      return Array.isArray(body.tools) && body.tools.some((tool: { name?: string }) => tool.name === 'list_tickets');
    });
    expect(firstChatReq).toBeDefined();
    expect(firstChatReq?.[0]).toBe('/api/v1/ai/chat');
    expect(JSON.parse(firstChatReq?.[1].body as string)).toMatchObject({
      tools: [{ name: 'list_tickets' }]
    });

    const toolCallReq = mocks.fetch.mock.calls.find(([url, init]) => {
      if (url !== '/api/v1/mcp/sse' || !init?.body) {
        return false;
      }

      const body = JSON.parse(init.body as string);
      return body.method === 'tools/call' && body.params?.name === 'list_tickets';
    });
    expect(toolCallReq).toBeDefined();
    expect(toolCallReq?.[0]).toBe('/api/v1/mcp/sse');
    expect(JSON.parse(toolCallReq?.[1].body as string)).toMatchObject({
      method: 'tools/call',
      params: { name: 'list_tickets', arguments: {} }
    });

    const secondChatReq = mocks.fetch.mock.calls.find(([url, init]) => {
      if (url !== '/api/v1/ai/chat' || !init?.body) {
        return false;
      }

      const body = JSON.parse(init.body as string);
      return body.messages?.some?.(
        (message: { role?: string; tool_call_id?: string; name?: string; content?: string }) =>
          message.role === 'tool' &&
          message.tool_call_id === 'call_1' &&
          message.name === 'list_tickets' &&
          message.content === 'Found 1 ticket'
      );
    });
    expect(secondChatReq).toBeDefined();
    expect(secondChatReq?.[0]).toBe('/api/v1/ai/chat');
    expect(JSON.parse(secondChatReq?.[1].body as string).messages.at(-1)).toMatchObject({
      role: 'tool',
      tool_call_id: 'call_1',
      name: 'list_tickets',
      content: 'Found 1 ticket'
    });
  });
});