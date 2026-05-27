import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { OpenAiProvider } from '../src/modules/ai/providers/openai-provider.js';
import { AnthropicProvider } from '../src/modules/ai/providers/anthropic-provider.js';
import { GeminiProvider } from '../src/modules/ai/providers/gemini-provider.js';
import { OllamaProvider } from '../src/modules/ai/providers/ollama-provider.js';
import { fetchWithTimeout, readErrorMessage } from '../src/modules/ai/utils/utils.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns a minimal Response-like object that globalThis.fetch can resolve to.
 */
function makeResponse(body: unknown, ok = true, status = 200): Response {
  const json = JSON.stringify(body);
  return {
    ok,
    status,
    json: async () => JSON.parse(json),
    text: async () => json,
  } as unknown as Response;
}

// ---------------------------------------------------------------------------
// fetchWithTimeout
// ---------------------------------------------------------------------------

describe('fetchWithTimeout utility', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('resolves with the fetch response on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse({ ok: true })));
    const res = await fetchWithTimeout('http://example.com', {}, 5000);
    expect(res.ok).toBe(true);
  });

  it('aborts and rejects when the request exceeds the timeout', async () => {
    // Simulate a fetch that never resolves until aborted
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(
        (_url: string, init: RequestInit) =>
          new Promise<never>((_res, reject) => {
            const signal = init.signal as AbortSignal;
            signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
          }),
      ),
    );

    await expect(fetchWithTimeout('http://example.com', {}, 1)).rejects.toThrow(/abort/i);
  });
});

// ---------------------------------------------------------------------------
// readErrorMessage utility
// ---------------------------------------------------------------------------

describe('readErrorMessage utility', () => {
  it('extracts a top-level string error field', async () => {
    const response = makeResponse({ error: 'Rate limit exceeded' }, false, 429);
    const msg = await readErrorMessage(response, 'fallback');
    expect(msg).toBe('Rate limit exceeded');
  });

  it('extracts a nested error.message field', async () => {
    const response = makeResponse({ error: { message: 'Invalid API key' } }, false, 401);
    const msg = await readErrorMessage(response, 'fallback');
    expect(msg).toBe('Invalid API key');
  });

  it('falls back to the provided string when no parseable error exists', async () => {
    const response = {
      ok: false,
      status: 500,
      json: async () => { throw new Error('not json'); },
      text: async () => '',
    } as unknown as Response;
    const msg = await readErrorMessage(response, 'server error');
    expect(msg).toBe('server error');
  });
});

// ---------------------------------------------------------------------------
// OpenAiProvider
// ---------------------------------------------------------------------------

describe('OpenAiProvider', () => {
  let provider: OpenAiProvider;

  beforeEach(() => {
    provider = new OpenAiProvider(false);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('throws when apiKey is missing', async () => {
    await expect(
      provider.chat({ model: 'gpt-4o', messages: [{ role: 'user', content: 'hi' }] }),
    ).rejects.toThrow('API key is required for cloud providers.');
  });

  it('resolves content from a standard text response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        makeResponse({ choices: [{ message: { role: 'assistant', content: 'Hello!' } }] }),
      ),
    );

    const result = await provider.chat({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'hi' }],
      apiKey: 'sk-test',
    });
    expect(result.content).toBe('Hello!');
    expect(result.toolCalls).toBeUndefined();
  });

  it('normalizes tool_calls with JSON-string arguments', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        makeResponse({
          choices: [
            {
              message: {
                role: 'assistant',
                tool_calls: [
                  {
                    id: 'call_1',
                    type: 'function',
                    function: { name: 'search', arguments: '{"query":"test"}' },
                  },
                ],
              },
            },
          ],
        }),
      ),
    );

    const result = await provider.chat({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'search for test' }],
      apiKey: 'sk-test',
      tools: [{ name: 'search', description: 'Search', inputSchema: { type: 'object' } }],
    });

    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls![0].name).toBe('search');
    expect(result.toolCalls![0].arguments).toEqual({ query: 'test' });
  });

  it('formats tool list with function wrappers for the OpenAI API', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      makeResponse({ choices: [{ message: { role: 'assistant', content: '' } }] }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await provider.chat({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'hi' }],
      apiKey: 'sk-test',
      tools: [{ name: 'my_tool', description: 'Does stuff', inputSchema: { type: 'object' } }],
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.tools[0]).toEqual({
      type: 'function',
      function: { name: 'my_tool', description: 'Does stuff', parameters: { type: 'object' } },
    });
  });

  it('throws an error when the provider returns a non-OK response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(makeResponse({ error: 'Unauthorized' }, false, 401)),
    );

    await expect(
      provider.chat({ model: 'gpt-4o', messages: [{ role: 'user', content: 'hi' }], apiKey: 'bad-key' }),
    ).rejects.toThrow('Unauthorized');
  });

  it('uses the DeepSeek base URL when constructed with isDeepSeek=true', async () => {
    const deepseekProvider = new OpenAiProvider(true);
    const fetchMock = vi.fn().mockResolvedValue(
      makeResponse({ choices: [{ message: { role: 'assistant', content: 'ok' } }] }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await deepseekProvider.chat({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: 'hi' }],
      apiKey: 'ds-key',
    });

    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('api.deepseek.com');
    expect(url).not.toContain('api.openai.com');
  });

  it('maps tool messages to the OpenAI tool role format', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      makeResponse({ choices: [{ message: { role: 'assistant', content: 'done' } }] }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await provider.chat({
      model: 'gpt-4o',
      messages: [
        { role: 'user', content: 'use tool' },
        { role: 'assistant', content: '', tool_calls: [{ id: 'tc1', name: 'my_tool', arguments: {} }] },
        { role: 'tool', content: 'result', tool_call_id: 'tc1' },
      ],
      apiKey: 'sk-test',
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    const toolResultMessage = body.messages.find((m: any) => m.role === 'tool');
    expect(toolResultMessage).toMatchObject({ role: 'tool', tool_call_id: 'tc1', content: 'result' });
  });
});

// ---------------------------------------------------------------------------
// AnthropicProvider
// ---------------------------------------------------------------------------

describe('AnthropicProvider', () => {
  let provider: AnthropicProvider;

  beforeEach(() => {
    provider = new AnthropicProvider();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('throws when apiKey is missing', async () => {
    await expect(
      provider.chat({ model: 'claude-3-haiku-20240307', messages: [{ role: 'user', content: 'hi' }] }),
    ).rejects.toThrow('API key is required for cloud providers.');
  });

  it('extracts system messages into the Anthropic system field', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      makeResponse({ content: [{ type: 'text', text: 'ok' }] }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await provider.chat({
      model: 'claude-3-haiku-20240307',
      messages: [
        { role: 'system', content: 'You are helpful.' },
        { role: 'user', content: 'hi' },
      ],
      apiKey: 'sk-ant-test',
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.system).toBe('You are helpful.');
    // System messages must NOT appear in the messages array for Anthropic
    expect(body.messages.some((m: any) => m.role === 'system')).toBe(false);
  });

  it('formats tool results as Anthropic tool_result content blocks', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      makeResponse({ content: [{ type: 'text', text: 'done' }] }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await provider.chat({
      model: 'claude-3-haiku-20240307',
      messages: [
        { role: 'user', content: 'run tool' },
        { role: 'assistant', content: '', tool_calls: [{ id: 'tc1', name: 'my_tool', arguments: {} }] },
        { role: 'tool', content: 'result-data', tool_call_id: 'tc1' },
      ],
      apiKey: 'sk-ant-test',
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    const toolResultMsg = body.messages.find((m: any) =>
      Array.isArray(m.content) && m.content[0]?.type === 'tool_result',
    );
    expect(toolResultMsg).toBeDefined();
    expect(toolResultMsg.content[0]).toMatchObject({
      type: 'tool_result',
      tool_use_id: 'tc1',
      content: 'result-data',
    });
  });

  it('formats tools with input_schema (not parameters)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      makeResponse({ content: [{ type: 'text', text: 'ok' }] }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await provider.chat({
      model: 'claude-3-haiku-20240307',
      messages: [{ role: 'user', content: 'hi' }],
      apiKey: 'sk-ant-test',
      tools: [{ name: 'my_tool', description: 'Does stuff', inputSchema: { type: 'object' } }],
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.tools[0]).toEqual({
      name: 'my_tool',
      description: 'Does stuff',
      input_schema: { type: 'object' },
    });
  });

  it('normalizes tool_use blocks from the Anthropic response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        makeResponse({
          content: [
            { type: 'tool_use', id: 'tc_abc', name: 'list_items', input: { limit: 5 } },
          ],
        }),
      ),
    );

    const result = await provider.chat({
      model: 'claude-3-haiku-20240307',
      messages: [{ role: 'user', content: 'list items' }],
      apiKey: 'sk-ant-test',
    });

    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls![0]).toMatchObject({ id: 'tc_abc', name: 'list_items', arguments: { limit: 5 } });
  });
});

// ---------------------------------------------------------------------------
// GeminiProvider
// ---------------------------------------------------------------------------

describe('GeminiProvider', () => {
  let provider: GeminiProvider;

  beforeEach(() => {
    provider = new GeminiProvider();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('throws when apiKey is missing', async () => {
    await expect(
      provider.chat({ model: 'gemini-1.5-flash', messages: [{ role: 'user', content: 'hi' }] }),
    ).rejects.toThrow('API key is required for cloud providers.');
  });

  it('maps system messages to the Gemini systemInstruction field', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      makeResponse({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await provider.chat({
      model: 'gemini-1.5-flash',
      messages: [
        { role: 'system', content: 'Be concise.' },
        { role: 'user', content: 'hi' },
      ],
      apiKey: 'gemini-key',
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.systemInstruction.parts[0].text).toBe('Be concise.');
    // System messages must NOT appear in contents for Gemini
    expect(body.contents.some((c: any) => c.role === 'system')).toBe(false);
  });

  it('formats tools as functionDeclarations inside a tools array', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      makeResponse({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await provider.chat({
      model: 'gemini-1.5-flash',
      messages: [{ role: 'user', content: 'hi' }],
      apiKey: 'gemini-key',
      tools: [{ name: 'my_tool', description: 'Desc', inputSchema: { type: 'object' } }],
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.tools[0].functionDeclarations[0]).toMatchObject({
      name: 'my_tool',
      description: 'Desc',
      parameters: { type: 'object' },
    });
  });

  it('maps functionCall parts into normalised tool calls', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        makeResponse({
          candidates: [
            {
              content: {
                parts: [
                  { functionCall: { name: 'do_thing', args: { x: 1 }, callId: 'cid_1' } },
                ],
              },
            },
          ],
        }),
      ),
    );

    const result = await provider.chat({
      model: 'gemini-1.5-flash',
      messages: [{ role: 'user', content: 'do thing' }],
      apiKey: 'gemini-key',
    });

    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls![0]).toMatchObject({ id: 'cid_1', name: 'do_thing', arguments: { x: 1 } });
  });

  it('maps tool result messages to Gemini functionResponse parts', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      makeResponse({ candidates: [{ content: { parts: [{ text: 'done' }] } }] }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await provider.chat({
      model: 'gemini-1.5-flash',
      messages: [
        { role: 'user', content: 'run tool' },
        { role: 'assistant', content: '', tool_calls: [{ id: 'tc1', name: 'my_fn', arguments: {} }] },
        { role: 'tool', content: '{"status":"ok"}', name: 'my_fn', tool_call_id: 'tc1' },
      ],
      apiKey: 'gemini-key',
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    const fnResponseMsg = body.contents.find(
      (c: any) => c.parts?.[0]?.functionResponse,
    );
    expect(fnResponseMsg).toBeDefined();
    expect(fnResponseMsg.parts[0].functionResponse.name).toBe('my_fn');
  });

  it('appends the api key as a query param on testConnection', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    await provider.testConnection('my-gemini-key');

    const calledUrl = String(fetchMock.mock.calls[0][0]);
    expect(calledUrl).toContain('key=my-gemini-key');
  });
});

// ---------------------------------------------------------------------------
// OllamaProvider — resolveOllamaUrl Docker fallback logic
// ---------------------------------------------------------------------------

describe('OllamaProvider.resolveOllamaUrl', () => {
  let provider: OllamaProvider;

  beforeEach(() => {
    provider = new OllamaProvider();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns non-localhost URLs unchanged without probing', async () => {
    // Should not call fetch at all for remote URLs
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const resolved = await provider.resolveOllamaUrl('http://ollama.internal:11434');
    expect(resolved).toBe('http://ollama.internal:11434');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns the Docker host URL when Docker probe succeeds', async () => {
    const fetchMock = vi
      .fn()
      // First call: Docker internal probe succeeds
      .mockResolvedValueOnce(makeResponse({ models: [] }));
    vi.stubGlobal('fetch', fetchMock);

    const resolved = await provider.resolveOllamaUrl('http://localhost:11434');
    expect(resolved).toContain('host.docker.internal');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to the original localhost URL when Docker probe fails', async () => {
    const fetchMock = vi
      .fn()
      // First call: Docker internal probe fails
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      // Second call: localhost probe succeeds
      .mockResolvedValueOnce(makeResponse({ models: [] }));
    vi.stubGlobal('fetch', fetchMock);

    const resolved = await provider.resolveOllamaUrl('http://localhost:11434');
    expect(resolved).toBe('http://localhost:11434');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns the original URL when both probes fail (best-effort)', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockRejectedValueOnce(new Error('ECONNREFUSED'));
    vi.stubGlobal('fetch', fetchMock);

    const resolved = await provider.resolveOllamaUrl('http://localhost:11434');
    // Returns original so caller can surface a descriptive error to the user
    expect(resolved).toBe('http://localhost:11434');
  });

  it('fetches models and filters out entries without a name', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn()
        // Docker probe fails
        .mockRejectedValueOnce(new Error('ECONNREFUSED'))
        // localhost probe for resolveOllamaUrl
        .mockResolvedValueOnce(makeResponse({ models: [] }))
        // Actual fetchOllamaModels call
        .mockResolvedValueOnce(makeResponse({ models: [{ name: 'llama3' }, {}, { name: 'codellama' }] })),
    );

    const models = await provider.fetchOllamaModels('http://localhost:11434');
    expect(models).toEqual(['llama3', 'codellama']);
  });
});
