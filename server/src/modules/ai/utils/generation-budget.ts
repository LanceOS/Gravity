import type { ChatOptions } from '../types.js';

// These limits are server-owned. Clients can only lower the output cap.
export const GENERATION_LIMITS = {
  outputTokensPerCall: 4096,
  outputTokensPerRequest: 28672,
  providerCalls: 7,
  toolCalls: 12,
  durationMs: 120000,
  inputBytesPerCall: 256000,
  inputBytesPerRequest: 1024000,
  concurrentPerUser: 2,
  concurrentPerProcess: 16,
} as const;

export function boundedMaxTokens(value?: number): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
    ? Math.min(value, GENERATION_LIMITS.outputTokensPerCall)
    : GENERATION_LIMITS.outputTokensPerCall;
}

export class GenerationBudget {
  readonly signal: AbortSignal;
  private readonly controller = new AbortController();
  private readonly timer: ReturnType<typeof setTimeout>;
  private outputTokens = 0;
  private inputBytes = 0;
  private providerCalls = 0;
  private toolCalls = 0;
  private readonly cancel = () => this.controller.abort(new DOMException('Generation canceled', 'AbortError'));

  constructor(private readonly callerSignal?: AbortSignal) {
    this.signal = this.controller.signal;
    callerSignal?.addEventListener('abort', this.cancel, { once: true });
    if (callerSignal?.aborted) this.cancel();
    this.timer = setTimeout(() => this.controller.abort(new DOMException('Generation timed out', 'TimeoutError')), GENERATION_LIMITS.durationMs);
    this.timer.unref?.();
  }

  reserveProviderCall(options: Pick<ChatOptions, 'messages' | 'tools' | 'maxTokens'>) {
    this.signal.throwIfAborted();
    const maxTokens = boundedMaxTokens(options.maxTokens);
    const inputBytes = Buffer.byteLength(JSON.stringify({ messages: options.messages, tools: options.tools }));
    if (++this.providerCalls > GENERATION_LIMITS.providerCalls) {
      throw new GenerationLimitError('provider_call_limit');
    }
    if (inputBytes > GENERATION_LIMITS.inputBytesPerCall ||
        (this.inputBytes += inputBytes) > GENERATION_LIMITS.inputBytesPerRequest) {
      throw new GenerationLimitError('input_limit');
    }
    if ((this.outputTokens += maxTokens) > GENERATION_LIMITS.outputTokensPerRequest) {
      throw new GenerationLimitError('token_limit');
    }
    // Reserve the full output allowance before dispatch. This conservatively
    // bounds usage even for providers/streams that omit token usage reports.
    return maxTokens;
  }

  reserveToolCall() {
    this.signal.throwIfAborted();
    if (++this.toolCalls > GENERATION_LIMITS.toolCalls) throw new GenerationLimitError('tool_limit');
  }

  dispose() {
    clearTimeout(this.timer);
    this.callerSignal?.removeEventListener('abort', this.cancel);
  }
}

export class GenerationLimitError extends Error {
  constructor(readonly reason: 'provider_call_limit' | 'input_limit' | 'token_limit' | 'tool_limit') {
    super(`Generation budget limit reached: ${reason}.`);
  }
}

export class GenerationConcurrencyError extends Error {}

// Shared across ChatService instances in this server process; no unbounded queue.
const active = new Map<symbol, { userId: string; chatId?: string }>();
export function acquireGeneration(userId: string, chatId?: string) {
  if (active.size >= GENERATION_LIMITS.concurrentPerProcess ||
      [...active.values()].filter(entry => entry.userId === userId).length >= GENERATION_LIMITS.concurrentPerUser ||
      (chatId !== undefined && [...active.values()].some(entry => entry.chatId === chatId))) {
    throw new GenerationConcurrencyError('Chat generation concurrency limit reached. Please retry shortly.');
  }
  const key = Symbol();
  active.set(key, { userId, chatId });
  return () => { active.delete(key); };
}
