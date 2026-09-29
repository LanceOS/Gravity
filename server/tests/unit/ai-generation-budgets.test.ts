import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchWithTimeout } from '../../src/modules/ai/utils/utils.js';
import { OpenAiProvider } from '../../src/modules/ai/providers/openai-provider.js';
import { AnthropicProvider } from '../../src/modules/ai/providers/anthropic-provider.js';
import { GeminiProvider } from '../../src/modules/ai/providers/gemini-provider.js';
import { acquireGeneration, boundedMaxTokens, GenerationBudget, GENERATION_LIMITS } from '../../src/modules/ai/utils/generation-budget.js';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('provider transport cancellation', () => {
  it('keeps the deadline active while consuming a stalled response body', async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new ReadableStream({ cancel }))));
    const response = await fetchWithTimeout('https://fixture.invalid', {}, 100);
    const reading = expect(response.text()).rejects.toMatchObject({ name: 'TimeoutError' });
    await vi.advanceTimersByTimeAsync(101);
    await reading;
    expect(cancel).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('preserves caller cancellation during a body read', async () => {
    const controller = new AbortController();
    const cancel = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new ReadableStream({ cancel }))));
    const response = await fetchWithTimeout('https://fixture.invalid', { signal: controller.signal });
    const reading = expect(response.json()).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await reading;
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('does not retry a caller-aborted wait for headers', async () => {
    const controller = new AbortController();
    const fetchStub = vi.fn().mockImplementation(() => new Promise(() => {}));
    vi.stubGlobal('fetch', fetchStub);
    const reading = expect(fetchWithTimeout('https://fixture.invalid', { signal: controller.signal }, 10000, 3))
      .rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await reading;
    expect(fetchStub).toHaveBeenCalledOnce();
  });

  it('cancels retry backoff and disposes the rejected response body', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const cancel = vi.fn();
    const fetchStub = vi.fn().mockResolvedValue(new Response(new ReadableStream({ cancel }), { status: 503 }));
    vi.stubGlobal('fetch', fetchStub);
    const reading = expect(fetchWithTimeout('https://fixture.invalid', { signal: controller.signal }, 10000, 3))
      .rejects.toMatchObject({ name: 'AbortError' });
    await vi.advanceTimersByTimeAsync(1);
    controller.abort();
    await reading;
    expect(cancel).toHaveBeenCalledOnce();
    expect(fetchStub).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    ['openai', new OpenAiProvider(), 'max_completion_tokens'],
    ['deepseek', new OpenAiProvider(true), 'max_tokens'],
    ['anthropic', new AnthropicProvider(), 'max_tokens'],
    ['gemini', new GeminiProvider(), 'maxOutputTokens'],
  ] as const)('maps %s token limits and forwards cancellation', async (_name, provider, parameter) => {
    const controller = new AbortController();
    const fetchStub = vi.fn().mockResolvedValue(new Response('{}'));
    vi.stubGlobal('fetch', fetchStub);
    await provider.chat({ model: 'fixture', messages: [], apiKey: 'fixture-key', maxTokens: 123, signal: controller.signal });
    const request = fetchStub.mock.calls[0][1];
    const body = JSON.parse(request.body);
    expect(parameter === 'maxOutputTokens' ? body.generationConfig[parameter] : body[parameter]).toBe(123);
    expect(request.signal).toBeInstanceOf(AbortSignal);
  });

  it.each([new OpenAiProvider(), new OpenAiProvider(true), new AnthropicProvider(), new GeminiProvider()])
    ('does not retry a billable generation on transient provider errors', async provider => {
      const fetchStub = vi.fn().mockResolvedValue(new Response('{"error":"unavailable"}', { status: 503 }));
      vi.stubGlobal('fetch', fetchStub);
      await expect(provider.chat({ model: 'fixture', messages: [], apiKey: 'fixture' })).rejects.toThrow('unavailable');
      expect(fetchStub).toHaveBeenCalledOnce();
    });

  it('stops processing buffered streaming events immediately after cancellation', async () => {
    const controller = new AbortController();
    const event = 'data: {"choices":[{"delta":{"content":"chunk"}}]}\n\n';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(event + event)));
    const onChunk = vi.fn(() => controller.abort());
    await expect(new OpenAiProvider().chat({ model: 'fixture', messages: [], apiKey: 'fixture', signal: controller.signal, onChunk }))
      .rejects.toMatchObject({ name: 'AbortError' });
    expect(onChunk).toHaveBeenCalledOnce();
  });

  it('cancels an OpenAI streaming read and never forwards late content', async () => {
    const controller = new AbortController();
    const cancel = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new ReadableStream({ cancel }))));
    const onChunk = vi.fn();
    const result = expect(new OpenAiProvider().chat({ model: 'fixture', messages: [], apiKey: 'fixture', signal: controller.signal, onChunk }))
      .rejects.toMatchObject({ name: 'AbortError' });
    await Promise.resolve();
    await Promise.resolve();
    controller.abort();
    await result;
    expect(onChunk).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledOnce();
  });
});

describe('server-owned budgets', () => {
  it('bounds invalid and excessive output budgets', () => {
    for (const value of [undefined, 0, -1, Infinity, NaN, 1.5, 999999999]) expect(boundedMaxTokens(value)).toBe(4096);
    expect(boundedMaxTokens(1)).toBe(1);
  });

  it('reserves a finite cumulative allowance even without provider usage reports', () => {
    const budget = new GenerationBudget();
    try {
      for (let i = 0; i < GENERATION_LIMITS.providerCalls; i++) expect(budget.reserveProviderCall({ messages: [] })).toBe(4096);
      expect(() => budget.reserveProviderCall({ messages: [] })).toThrow('budget limit');
    } finally { budget.dispose(); }
  });

  it('rejects oversized context before a provider call', () => {
    const budget = new GenerationBudget();
    try {
      expect(() => budget.reserveProviderCall({ messages: [{ role: 'user', content: 'x'.repeat(256001) }] })).toThrow('budget limit');
    } finally { budget.dispose(); }
  });

  it('limits both per-user and process-wide concurrent generations and releases slots', () => {
    const release: Array<() => void> = [];
    try {
      release.push(acquireGeneration('one', 'chat-1'), acquireGeneration('one', 'chat-2'));
      expect(() => acquireGeneration('one', 'chat-3')).toThrow('concurrency limit');
      for (let i = 2; i < 16; i++) release.push(acquireGeneration(`user-${i}`, `chat-${i + 1}`));
      expect(() => acquireGeneration('last', 'overflow')).toThrow('concurrency limit');
    } finally { release.forEach(fn => fn()); }
    acquireGeneration('one', 'chat-1')();
  });
});
