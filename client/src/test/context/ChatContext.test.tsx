import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ChatContextProvider, useChat } from '../../modules/ai';

const mockSettings = {
  defaultView: 'board' as const,
  theme: 'dark' as const,
  projectLayout: 'standard' as const,
  apiKey: '',
  aiProvider: 'openai' as const,
};

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
}));

function createJsonResponse(body: unknown, ok = true) {
  return {
    ok,
    status: ok ? 200 : 500,
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(JSON.stringify(body)),
    statusText: ok ? 'OK' : 'Error',
  };
}

function createSseResponse(payloads: unknown[], ok = true) {
  return {
    ok,
    status: ok ? 200 : 500,
    json: vi.fn().mockResolvedValue(payloads[0] ?? {}),
    text: vi.fn().mockResolvedValue(payloads.map((payload) => `data: ${JSON.stringify(payload)}\n\n`).join('')),
    statusText: ok ? 'OK' : 'Error',
  };
}

function Wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

const TestComponent = () => {
  const {
    messages,
    sendMessage,
    isGenerating,
    error,
    mcpTools,
  } = useChat();

  return (
    <div>
      <div data-testid="is-generating">{isGenerating ? 'yes' : 'no'}</div>
      <div data-testid="error-state">{error || 'none'}</div>
      <div data-testid="tools-count">{mcpTools.length}</div>
      <button data-testid="send-btn" onClick={() => void sendMessage('Hello')}>Send</button>
      <div data-testid="msg-list">
        {messages.map((m, i) => (
          <div key={i} data-testid={`msg-${m.role}`}>
            {m.content}
          </div>
        ))}
      </div>
    </div>
  );
};

describe('ChatContextProvider integration', () => {
  beforeEach(() => {
    mocks.fetch.mockReset();
    vi.stubGlobal('fetch', mocks.fetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches MCP tools list on mount', async () => {
    mocks.fetch.mockImplementation((url: string) => {
      if (url === '/api/v1/mcp/sse') {
        return Promise.resolve(createJsonResponse({
          result: { tools: [{ name: 'list_tickets', description: 'Lists tickets' }] },
        }));
      }
      return Promise.resolve(createJsonResponse({}));
    });

    render(
      <Wrapper>
        <ChatContextProvider
          initialModel="gpt-4o-mini"
          settings={mockSettings}
          workspaceId="w-1"
          projectId="p-1"
        >
          <TestComponent />
        </ChatContextProvider>
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('tools-count')).toHaveTextContent('1');
    });

    const mcpCall = mocks.fetch.mock.calls.find((call) => call[0] === '/api/v1/mcp/sse');
    expect(mcpCall).toBeDefined();
    expect(JSON.parse(mcpCall![1]?.body as string)).toMatchObject({
      method: 'tools/list',
    });
  });

  it('creates a chat session and appends the streamed assistant response', async () => {
    mocks.fetch.mockImplementation((url: string) => {
      if (url === '/api/v1/mcp/sse') {
        return Promise.resolve(createJsonResponse({ result: { tools: [] } }));
      }
      if (url === '/api/v1/projects/p-1/chats') {
        return Promise.resolve(createJsonResponse({ id: 'chat-1' }));
      }
      if (url === '/api/v1/projects/p-1/chats/chat-1/stream') {
        return Promise.resolve(createSseResponse([{ type: 'done', message: 'Hello from OpenAI.' }]));
      }
      return Promise.resolve(createJsonResponse({}));
    });

    render(
      <Wrapper>
        <ChatContextProvider
          initialModel="gpt-4o-mini"
          settings={mockSettings}
          workspaceId="w-1"
          projectId="p-1"
        >
          <TestComponent />
        </ChatContextProvider>
      </Wrapper>,
    );

    fireEvent.click(screen.getByTestId('send-btn'));

    await waitFor(() => {
      expect(screen.getByText('Hello from OpenAI.')).toBeInTheDocument();
    });
    expect(screen.getByText('Hello')).toBeInTheDocument();
    expect(screen.getByTestId('is-generating')).toHaveTextContent('no');
  });
});
