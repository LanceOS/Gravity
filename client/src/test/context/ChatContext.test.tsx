import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { ChatContextProvider, useChat } from '../../modules/ai';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

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

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
}));

function createJsonResponse(body: unknown, ok = true) {
  return {
    ok,
    json: vi.fn().mockResolvedValue(body),
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
            {m.name ? `[${m.name}] ` : ''}{m.content}
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
          result: { tools: [{ name: 'list_tickets', description: 'Lists tickets' }] }
        }));
      }
      return Promise.resolve(createJsonResponse({}));
    });

    render(
      <Wrapper>
        <ChatContextProvider
          initialOllamaUrl="http://localhost:11434"
          initialModel="llama3"
          settings={mockSettings}
          workspaceId="w-1"
        >
          <TestComponent />
        </ChatContextProvider>
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByTestId('tools-count')).toHaveTextContent('1');
    });

    const calls = mocks.fetch.mock.calls;
    const mcpCall = calls.find(call => call[0] === '/api/v1/mcp/sse');
    expect(mcpCall).toBeDefined();
    expect(JSON.parse(mcpCall![1]?.body as string)).toMatchObject({
      method: 'tools/list',
    });
  });

  it('coordinates a successful tool execution loop and returns results to LLM', async () => {
    let chatCount = 0;
    mocks.fetch.mockImplementation((url: string) => {
      if (url === '/api/v1/mcp/sse') {
        // First call is tools/list, subsequent is tools/call
        const body = JSON.parse(mocks.fetch.mock.calls.find(call => call[0] === url && JSON.parse(call[1]?.body as string).id === 1)?.[1]?.body as string || '{}');
        const reqBody = JSON.parse(mocks.fetch.mock.calls[mocks.fetch.mock.calls.length - 1][1]?.body as string);
        if (reqBody.method === 'tools/list') {
          return Promise.resolve(createJsonResponse({ result: { tools: [{ name: 'list_workspace_members' }] } }));
        }
        return Promise.resolve(createJsonResponse({ result: { content: [{ type: 'text', text: 'Alice, Bob' }] } }));
      }
      if (url === '/api/v1/ai/chat') {
        chatCount++;
        if (chatCount === 1) {
          return Promise.resolve(createJsonResponse({
            message: {
              role: 'assistant',
              content: '',
              tool_calls: [{ id: 'tc-1', name: 'list_workspace_members', arguments: {} }]
            }
          }));
        }
        return Promise.resolve(createJsonResponse({
          message: {
            role: 'assistant',
            content: 'Members are Alice and Bob.'
          }
        }));
      }
      return Promise.resolve(createJsonResponse({}));
    });

    render(
      <Wrapper>
        <ChatContextProvider
          initialOllamaUrl="http://localhost:11434"
          initialModel="llama3"
          settings={mockSettings}
          workspaceId="w-1"
        >
          <TestComponent />
        </ChatContextProvider>
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByTestId('tools-count')).toHaveTextContent('1');
    });

    fireEvent.click(screen.getByTestId('send-btn'));

    await waitFor(() => {
      expect(screen.getByText('Members are Alice and Bob.')).toBeInTheDocument();
    });

    // Check all intermediate messages were saved
    expect(screen.getByText('Hello')).toBeInTheDocument();
    expect(screen.getByText('[list_workspace_members] Alice, Bob')).toBeInTheDocument();
    expect(screen.getByTestId('is-generating')).toHaveTextContent('no');
  });

  it('prevents runaway tool calling loop when depth limit is exceeded', async () => {
    mocks.fetch.mockImplementation((url: string) => {
      if (url === '/api/v1/mcp/sse') {
        const reqBody = JSON.parse(mocks.fetch.mock.calls[mocks.fetch.mock.calls.length - 1][1]?.body as string);
        if (reqBody.method === 'tools/list') {
          return Promise.resolve(createJsonResponse({ result: { tools: [{ name: 'list_tickets' }] } }));
        }
        return Promise.resolve(createJsonResponse({ result: { content: [{ type: 'text', text: 'Result' }] } }));
      }
      if (url === '/api/v1/ai/chat') {
        // Always reply with a tool call to simulate a loop
        return Promise.resolve(createJsonResponse({
          message: {
            role: 'assistant',
            content: '',
            tool_calls: [{ id: `tc-${Date.now()}`, name: 'list_tickets', arguments: {} }]
          }
        }));
      }
      return Promise.resolve(createJsonResponse({}));
    });

    render(
      <Wrapper>
        <ChatContextProvider
          initialOllamaUrl="http://localhost:11434"
          initialModel="llama3"
          settings={mockSettings}
          workspaceId="w-1"
        >
          <TestComponent />
        </ChatContextProvider>
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByTestId('tools-count')).toHaveTextContent('1');
    });

    fireEvent.click(screen.getByTestId('send-btn'));

    await waitFor(() => {
      expect(screen.getByText(/Agentic loop stopped/)).toBeInTheDocument();
    }, { timeout: 8000 });

    expect(screen.getByTestId('is-generating')).toHaveTextContent('no');
  });

  it('handles tool call failures gracefully and records the error', async () => {
    let chatCount = 0;
    mocks.fetch.mockImplementation((url: string) => {
      if (url === '/api/v1/mcp/sse') {
        const reqBody = JSON.parse(mocks.fetch.mock.calls[mocks.fetch.mock.calls.length - 1][1]?.body as string);
        if (reqBody.method === 'tools/list') {
          return Promise.resolve(createJsonResponse({ result: { tools: [{ name: 'list_tickets' }] } }));
        }
        return Promise.resolve(createJsonResponse({ error: { code: -32603, message: 'API error occurred' } }));
      }
      if (url === '/api/v1/ai/chat') {
        chatCount++;
        if (chatCount === 1) {
          return Promise.resolve(createJsonResponse({
            message: {
              role: 'assistant',
              content: '',
              tool_calls: [{ id: 'tc-1', name: 'list_tickets', arguments: {} }]
            }
          }));
        }
        return Promise.resolve(createJsonResponse({
          message: { role: 'assistant', content: 'Failing tool call output seen.' }
        }));
      }
      return Promise.resolve(createJsonResponse({}));
    });

    render(
      <Wrapper>
        <ChatContextProvider
          initialOllamaUrl="http://localhost:11434"
          initialModel="llama3"
          settings={mockSettings}
          workspaceId="w-1"
        >
          <TestComponent />
        </ChatContextProvider>
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByTestId('tools-count')).toHaveTextContent('1');
    });

    fireEvent.click(screen.getByTestId('send-btn'));

    await waitFor(() => {
      expect(screen.getByText('[list_tickets] Error: API error occurred')).toBeInTheDocument();
      expect(screen.getByText('Failing tool call output seen.')).toBeInTheDocument();
    });
  });
});
