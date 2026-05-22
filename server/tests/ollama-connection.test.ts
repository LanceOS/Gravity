import { describe, expect, it, vi, beforeEach } from 'vitest';
import { api, jsonResponse } from './helpers/test-helpers.js';

/**
 * Builds a mock fetch that fails the first call (simulating localhost unreachable)
 * and succeeds on a subsequent call (simulating Docker host fallback).
 */
function localFailDockerSuccessMock(models: Array<{ name: string }>) {
  return vi
    .fn()
    // 1st call: resolveOllamaUrl probes localhost → connection refused
    .mockRejectedValueOnce(new TypeError('fetch failed'))
    // 2nd call: resolveOllamaUrl probes host.docker.internal → success
    .mockResolvedValueOnce(jsonResponse({ models }))
    // 3rd call: actual fetchOllamaModels (after URL resolved to docker host)
    .mockResolvedValueOnce(jsonResponse({ models }));
}

describe('Ollama connection & AI proxy routes', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ─── Model listing: happy paths ────────────────────────────────────────────

  describe('GET /api/v1/ai/ollama/models — successful connection', () => {
    it('returns connected:true and a populated models array', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(jsonResponse({ models: [{ name: 'llama3' }, { name: 'codellama' }] }));
      vi.stubGlobal('fetch', fetchMock);

      const res = await api()
        .get('/api/v1/ai/ollama/models')
        .query({ ollamaUrl: 'http://ollama.test:11434' });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        connected: true,
        models: expect.arrayContaining(['llama3', 'codellama']),
      });
    });

    it('returns connected:true and empty models when Ollama has none installed', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(jsonResponse({ models: [] })),
      );

      const res = await api()
        .get('/api/v1/ai/ollama/models')
        .query({ ollamaUrl: 'http://ollama.test:11434' });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ connected: true, models: [] });
    });

    it('strips trailing slashes from the ollamaUrl before querying', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(jsonResponse({ models: [{ name: 'mistral' }] }));
      vi.stubGlobal('fetch', fetchMock);

      await api()
        .get('/api/v1/ai/ollama/models')
        .query({ ollamaUrl: 'http://ollama.test:11434/' });

      // The URL that fetch was called with should not have a double slash in the path (after the protocol)
      const calledUrl = String(fetchMock.mock.calls[0][0]);
      const pathPart = calledUrl.replace(/^https?:\/\/[^/]+/, '');
      expect(pathPart).not.toContain('//');
      expect(calledUrl).toMatch(/\/api\/tags$/);
    });

    it('defaults to localhost:11434 when no ollamaUrl query param is provided', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(jsonResponse({ models: [{ name: 'phi3' }] }));
      vi.stubGlobal('fetch', fetchMock);

      const res = await api().get('/api/v1/ai/ollama/models');

      expect(res.status).toBe(200);
      expect(res.body.connected).toBe(true);
      const calledUrl = String(fetchMock.mock.calls[0][0]);
      expect(calledUrl).toMatch(/localhost:11434/);
    });
  });

  // ─── Model listing: failure paths ──────────────────────────────────────────

  describe('GET /api/v1/ai/ollama/models — connection failures', () => {
    it('returns connected:false and an error message when Ollama is unreachable', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockRejectedValue(new TypeError('fetch failed')),
      );

      const res = await api()
        .get('/api/v1/ai/ollama/models')
        .query({ ollamaUrl: 'http://ollama.test:11434' });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        connected: false,
        models: [],
        error: expect.any(String),
      });
      // Error message should be user-friendly, not a raw Node.js stack
      expect(res.body.error).not.toContain('TypeError');
    });

    it('returns connected:false when Ollama responds with a non-200 status', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response(JSON.stringify({ error: 'Internal server error' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          }),
        ),
      );

      const res = await api()
        .get('/api/v1/ai/ollama/models')
        .query({ ollamaUrl: 'http://ollama.test:11434' });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ connected: false, models: [] });
    });

    it('returns connected:false when the request times out', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockRejectedValue(
          Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }),
        ),
      );

      const res = await api()
        .get('/api/v1/ai/ollama/models')
        .query({ ollamaUrl: 'http://ollama.test:11434' });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ connected: false, models: [] });
    });

    it('returns connected:false when Ollama returns malformed JSON', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response('not json at all', {
            status: 200,
            headers: { 'Content-Type': 'text/plain' },
          }),
        ),
      );

      const res = await api()
        .get('/api/v1/ai/ollama/models')
        .query({ ollamaUrl: 'http://ollama.test:11434' });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ connected: false, models: [] });
    });
  });

  // ─── Docker / localhost fallback ────────────────────────────────────────────

  describe('GET /api/v1/ai/ollama/models — Docker host fallback', () => {
    it('falls back to host.docker.internal when localhost connection fails', async () => {
      const fetchMock = localFailDockerSuccessMock([{ name: 'llama3' }]);
      vi.stubGlobal('fetch', fetchMock);

      const res = await api()
        .get('/api/v1/ai/ollama/models')
        .query({ ollamaUrl: 'http://localhost:11434' });

      expect(res.status).toBe(200);
      expect(res.body.connected).toBe(true);
      expect(res.body.models).toContain('llama3');

      // At least one call should have used host.docker.internal
      const calledUrls = fetchMock.mock.calls.map((call) => String(call[0]));
      expect(calledUrls.some((url) => url.includes('host.docker.internal'))).toBe(true);
    });

    it('falls back to host.docker.internal when 127.0.0.1 connection fails', async () => {
      const fetchMock = localFailDockerSuccessMock([{ name: 'phi3' }]);
      vi.stubGlobal('fetch', fetchMock);

      const res = await api()
        .get('/api/v1/ai/ollama/models')
        .query({ ollamaUrl: 'http://127.0.0.1:11434' });

      expect(res.status).toBe(200);
      // Connected via fallback
      const calledUrls = fetchMock.mock.calls.map((call) => String(call[0]));
      expect(calledUrls.some((url) => url.includes('host.docker.internal'))).toBe(true);
    });

    it('does NOT attempt Docker fallback for non-localhost URLs', async () => {
      const fetchMock = vi
        .fn()
        .mockRejectedValue(new TypeError('fetch failed'));
      vi.stubGlobal('fetch', fetchMock);

      const res = await api()
        .get('/api/v1/ai/ollama/models')
        .query({ ollamaUrl: 'http://192.168.1.50:11434' });

      expect(res.status).toBe(200);
      expect(res.body.connected).toBe(false);

      // Should only be called once (the actual fetchOllamaModels call, after resolveOllamaUrl returns the same URL)
      const calledUrls = fetchMock.mock.calls.map((call) => String(call[0]));
      expect(calledUrls.every((url) => !url.includes('host.docker.internal'))).toBe(true);
    });
  });

  // ─── Legacy /ollama/models route ───────────────────────────────────────────

  describe('GET /api/v1/ollama/models — legacy route', () => {
    it('returns the same structured { models, connected } format as the new route', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(jsonResponse({ models: [{ name: 'gemma' }] })),
      );

      const res = await api()
        .get('/api/v1/ollama/models')
        .query({ ollamaUrl: 'http://ollama.test:11434' });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ connected: true, models: ['gemma'] });
    });

    it('returns connected:false when the connection fails', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));

      const res = await api()
        .get('/api/v1/ollama/models')
        .query({ ollamaUrl: 'http://ollama.test:11434' });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ connected: false, models: [] });
    });
  });

  // ─── Chat proxy: Ollama ─────────────────────────────────────────────────────

  describe('POST /api/v1/ai/chat — Ollama provider', () => {
    it('proxies a chat message to Ollama and returns the assistant response', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn()
          // resolveOllamaUrl probe
          .mockResolvedValueOnce(jsonResponse({ models: [] }))
          // actual chat request
          .mockResolvedValueOnce(
            jsonResponse({ message: { role: 'assistant', content: 'Hello from Ollama!' } }),
          ),
      );

      const res = await api()
        .post('/api/v1/ai/chat')
        .send({
          provider: 'ollama',
          ollamaUrl: 'http://localhost:11434',
          model: 'llama3',
          messages: [{ role: 'user', content: 'Hello there' }],
        });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        message: { role: 'assistant', content: 'Hello from Ollama!' },
      });
    });

    it('returns 502 when Ollama is unreachable during chat', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockRejectedValue(new TypeError('fetch failed')),
      );

      const res = await api()
        .post('/api/v1/ai/chat')
        .send({
          provider: 'ollama',
          ollamaUrl: 'http://localhost:11434',
          model: 'llama3',
          messages: [{ role: 'user', content: 'Hello' }],
        });

      expect(res.status).toBe(502);
      expect(res.body.error).toBeTruthy();
    });

    it('returns 400 when model is missing', async () => {
      const res = await api()
        .post('/api/v1/ai/chat')
        .send({
          provider: 'ollama',
          ollamaUrl: 'http://localhost:11434',
          messages: [{ role: 'user', content: 'Hello' }],
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/model/i);
    });

    it('returns 400 when messages array is empty', async () => {
      const res = await api()
        .post('/api/v1/ai/chat')
        .send({
          provider: 'ollama',
          ollamaUrl: 'http://localhost:11434',
          model: 'llama3',
          messages: [],
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/messages/i);
    });
  });

  // ─── Chat proxy: Cloud providers ───────────────────────────────────────────

  describe('POST /api/v1/ai/chat — cloud providers', () => {
    it('proxies OpenAI chat completions and normalizes the response', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValueOnce(
          jsonResponse({
            choices: [{ message: { role: 'assistant', content: 'Hello from GPT!' } }],
          }),
        ),
      );

      const res = await api()
        .post('/api/v1/ai/chat')
        .send({
          provider: 'openai',
          apiKey: 'sk-test-key',
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: 'Hello' }],
        });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ message: { role: 'assistant', content: 'Hello from GPT!' } });
    });

    it('proxies DeepSeek chat and normalizes the response', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValueOnce(
          jsonResponse({
            choices: [{ message: { role: 'assistant', content: 'Hello from DeepSeek!' } }],
          }),
        ),
      );

      const res = await api()
        .post('/api/v1/ai/chat')
        .send({
          provider: 'deepseek',
          apiKey: 'sk-deepseek-key',
          model: 'deepseek-chat',
          messages: [{ role: 'user', content: 'Hello' }],
        });

      expect(res.status).toBe(200);
      expect(res.body.message.content).toBe('Hello from DeepSeek!');
    });

    it('proxies Anthropic messages and normalizes system messages', async () => {
      const fetchMock = vi.fn().mockResolvedValueOnce(
        jsonResponse({
          content: [{ type: 'text', text: 'Hello from Claude!' }],
        }),
      );
      vi.stubGlobal('fetch', fetchMock);

      const res = await api()
        .post('/api/v1/ai/chat')
        .send({
          provider: 'anthropic',
          apiKey: 'sk-ant-test',
          model: 'claude-3-5-sonnet',
          messages: [
            { role: 'system', content: 'You are a helpful assistant.' },
            { role: 'user', content: 'Hello' },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.message.content).toBe('Hello from Claude!');

      // Verify system message was extracted to top-level system field
      const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(requestBody.system).toContain('helpful assistant');
      expect(requestBody.messages.every((m: { role: string }) => m.role !== 'system')).toBe(true);
    });

    it('proxies Gemini generateContent and normalizes message roles', async () => {
      const fetchMock = vi.fn().mockResolvedValueOnce(
        jsonResponse({
          candidates: [{ content: { parts: [{ text: 'Hello from Gemini!' }] } }],
        }),
      );
      vi.stubGlobal('fetch', fetchMock);

      const res = await api()
        .post('/api/v1/ai/chat')
        .send({
          provider: 'gemini',
          apiKey: 'AIza-test-key',
          model: 'gemini-1.5-flash',
          messages: [
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: 'Hi there' },
            { role: 'user', content: 'How are you?' },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.message.content).toBe('Hello from Gemini!');

      // Verify assistant role is mapped to 'model' for Gemini
      const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      const roles = requestBody.contents.map((c: { role: string }) => c.role);
      expect(roles).toContain('model');
      expect(roles).not.toContain('assistant');
    });

    it('returns 400 when a cloud provider is used without an API key', async () => {
      const res = await api()
        .post('/api/v1/ai/chat')
        .send({
          provider: 'openai',
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: 'Hello' }],
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/api key/i);
    });

    it('returns 400 for an unsupported provider', async () => {
      const res = await api()
        .post('/api/v1/ai/chat')
        .send({
          provider: 'some-unknown-llm',
          apiKey: 'test-key',
          model: 'some-model',
          messages: [{ role: 'user', content: 'Hello' }],
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/unsupported provider/i);
    });

    it('returns 502 when a cloud provider API call fails', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValueOnce(
          new Response(JSON.stringify({ error: { message: 'Invalid API key.' } }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          }),
        ),
      );

      const res = await api()
        .post('/api/v1/ai/chat')
        .send({
          provider: 'openai',
          apiKey: 'sk-bad-key',
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: 'Hello' }],
        });

      expect(res.status).toBe(502);
      expect(res.body.error).toBeTruthy();
    });
  });

  // ─── API key testing ────────────────────────────────────────────────────────

  describe('POST /api/v1/ai/test-key & test-connection', () => {
    it('validates an OpenAI API key successfully', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValueOnce(jsonResponse({ data: [{ id: 'gpt-4o-mini' }] })),
      );

      const res = await api()
        .post('/api/v1/ai/test-key')
        .send({ provider: 'openai', apiKey: 'sk-valid' });

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/validated successfully/i);
    });

    it('rejects an empty API key with a 400 error', async () => {
      const res = await api()
        .post('/api/v1/ai/test-key')
        .send({ provider: 'openai', apiKey: '' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/api key/i);
    });

    it('rejects an invalid API key with a 400 error', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValueOnce(
          new Response(JSON.stringify({ error: { message: 'Incorrect API key.' } }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          }),
        ),
      );

      const res = await api()
        .post('/api/v1/ai/test-key')
        .send({ provider: 'openai', apiKey: 'sk-bad' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBeTruthy();
    });

    it('test-connection returns latency_ms on success', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValueOnce(jsonResponse({ data: [{ id: 'gpt-4o' }] })),
      );

      const res = await api()
        .post('/api/v1/ai/test-connection')
        .send({ provider: 'openai', apiKey: 'sk-valid' });

      expect(res.status).toBe(200);
      expect(res.body.connected).toBe(true);
      expect(typeof res.body.latency_ms).toBe('number');
    });

    it('test-connection returns connected:false when connection fails', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockRejectedValueOnce(new TypeError('fetch failed')),
      );

      const res = await api()
        .post('/api/v1/ai/test-connection')
        .send({ provider: 'openai', apiKey: 'sk-valid' });

      expect(res.status).toBe(400);
      expect(res.body.connected).toBe(false);
    });
  });
});
