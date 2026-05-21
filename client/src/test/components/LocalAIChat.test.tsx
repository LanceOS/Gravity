import type { CSSProperties, ChangeEvent, InputHTMLAttributes } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalAIChat } from '../../components/LocalAIChat/LocalAIChat.tsx';

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

vi.mock('../../components/LocalAIChat/components', () => ({
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

function renderLocalAIChat(overrides: Partial<Parameters<typeof LocalAIChat>[0]> = {}, ticketContextOverrides = {}) {
  const props = {
    onClose: vi.fn(),
    initialOllamaUrl: '',
    initialModel: '',
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
    mocks.fetch
      .mockResolvedValueOnce(createJsonResponse({ models: [{ name: 'llama3' }] }))
      .mockResolvedValueOnce(createJsonResponse({ message: { content: 'AI says hello' } }));

    renderLocalAIChat();

    await waitFor(() => {
      expect(screen.getByText('Active')).toBeInTheDocument();
    });

    expect(mocks.fetch).toHaveBeenNthCalledWith(
      1,
      'http://localhost:11434/api/tags',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
    expect(screen.getByDisplayValue('llama3')).toBeInTheDocument();

    const chatInput = screen.getByPlaceholderText('Ask AI a question...');
    await user.type(chatInput, 'Summarize the backlog');

    const chatForm = chatInput.closest('form');
    expect(chatForm).not.toBeNull();
    fireEvent.submit(chatForm as HTMLFormElement);

    await waitFor(() => {
      expect(screen.getByText('AI says hello')).toBeInTheDocument();
    });

    const chatRequest = mocks.fetch.mock.calls[1];
    expect(chatRequest[0]).toBe('/api/v1/ai/chat');
    expect(chatRequest[1]).toMatchObject({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    expect(JSON.parse(chatRequest[1]?.body as string)).toMatchObject({
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
    mocks.fetch
      .mockResolvedValueOnce(createJsonResponse({ models: [{ name: 'codellama' }] }))
      .mockResolvedValueOnce(createJsonResponse({ error: 'chat exploded' }, false));

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

    const quickActionRequest = mocks.fetch.mock.calls[1];
    expect(quickActionRequest[0]).toBe('/api/v1/ai/chat');

    const payload = JSON.parse(quickActionRequest[1]?.body as string);
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
});