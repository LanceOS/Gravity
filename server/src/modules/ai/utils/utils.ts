/** Wait for I/O without losing caller cancellation while it is pending. */
export function withAbort<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => { cleanup(); reject(signal.reason); };
    const cleanup = () => signal.removeEventListener('abort', abort);
    signal.addEventListener('abort', abort, { once: true });
    operation.then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); });
    if (signal.aborted) abort();
  });
}

/** One deadline covers headers, retries, backoff and consumption of the body. */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 10000,
  maxRetries = 0,
): Promise<Response> {
  const controller = new AbortController();
  const abort = () => controller.abort(init.signal?.reason);
  init.signal?.addEventListener('abort', abort, { once: true });
  if (init.signal?.aborted) abort();
  const timer = setTimeout(() => controller.abort(new DOMException('Provider timed out', 'TimeoutError')), timeoutMs);
  timer.unref?.();
  const cleanup = () => {
    clearTimeout(timer);
    init.signal?.removeEventListener('abort', abort);
  };
  const signal = controller.signal;
  try {
    for (let attempt = 0; ; attempt++) {
      signal.throwIfAborted();
      let response: Response;
      try {
        response = await withAbort(fetch(url, { ...init, signal }).then(result => {
          // A transport may resolve headers concurrently with cancellation.
          if (signal.aborted) void result.body?.cancel(signal.reason).catch(() => {});
          return result;
        }), signal);
      } catch (error) {
        signal.throwIfAborted();
        if (attempt >= maxRetries) throw error;
        await backoff(attempt, signal);
        continue;
      }
      if ((response.status === 429 || [502, 503, 504].includes(response.status)) && attempt < maxRetries) {
        if (response.body) await withAbort(response.body.cancel(), signal);
        await backoff(attempt, signal);
        continue;
      }
      if (!response.body) { cleanup(); return response; }
      const reader = response.body.getReader();
      let finished = false;
      const finish = () => {
        finished = true;
        cleanup();
        signal.removeEventListener('abort', abortBody);
      };
      let bodyController: ReadableStreamDefaultController<Uint8Array>;
      const abortBody = () => {
        if (finished) return;
        finish();
        bodyController.error(signal.reason);
        void reader.cancel(signal.reason).catch(() => {});
      };
      const body = new ReadableStream<Uint8Array>({
        start(streamController) {
          bodyController = streamController;
          signal.addEventListener('abort', abortBody, { once: true });
          if (signal.aborted) abortBody();
        },
        async pull(streamController) {
          try {
            const { done, value } = await reader.read();
            if (finished) return;
            if (done) { finish(); streamController.close(); }
            else streamController.enqueue(value);
          } catch (error) {
            if (!finished) { finish(); streamController.error(error); }
          }
        },
        cancel(reason) {
          finish();
          controller.abort(reason);
          void reader.cancel(reason).catch(() => {});
        },
      });
      return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
    }
  } catch (error) {
    cleanup();
    throw error;
  }
}

async function backoff(attempt: number, signal: AbortSignal) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await withAbort(new Promise<void>(resolve => {
      timer = setTimeout(resolve, Math.min(10000, 500 * 2 ** attempt) + Math.random() * 200);
    }), signal);
  } finally { clearTimeout(timer); }
}

/**
 * Attempts to parse an error message from a failed fetch response.
 * @param {Response} response - The failed fetch response.
 * @param {string} fallback - The fallback message if parsing fails.
 * @return {Promise<string>} The parsed error message.
 */
export async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const data = (await response.json()) as { error?: string | { message?: string } };
    if (typeof data.error === 'string') {
      return data.error;
    }
    if (typeof data.error?.message === 'string') {
      return data.error.message;
    }
  } catch {
    // Fall through.
  }

  try {
    const text = await response.text();
    return text || fallback;
  } catch {
    return fallback;
  }
}

export function chooseBestMcpModel(provider: string, models: string[]): string {
  const lowerProvider = provider.toLowerCase();

  if (lowerProvider === 'openai') {
    const mcpModels = ['gpt-4o-mini', 'gpt-4o'];
    for (const m of mcpModels) {
      if (models.includes(m)) return m;
    }
    return 'gpt-4o-mini';
  }

  if (lowerProvider === 'deepseek') {
    const mcpModels = ['deepseek-chat', 'deepseek-reasoner'];
    for (const m of mcpModels) {
      if (models.includes(m)) return m;
    }
    return 'deepseek-chat';
  }

  if (lowerProvider === 'anthropic') {
    const mcpModels = [
      {
        canonical: 'claude-3-haiku',
        aliases: ['claude-3-haiku', 'claude-3-haiku-20240307']
      },
      {
        canonical: 'claude-3-5-haiku',
        aliases: ['claude-3-5-haiku', 'claude-3-5-haiku-20241022']
      },
      {
        canonical: 'claude-3-5-sonnet',
        aliases: ['claude-3-5-sonnet', 'claude-3-5-sonnet-20240620', 'claude-3-5-sonnet-20241022']
      }
    ];
    for (const model of mcpModels) {
      if (model.aliases.some(alias => models.includes(alias))) return model.canonical;
    }
    return 'claude-3-haiku';
  }

  if (lowerProvider === 'gemini') {
    const mcpModels = [
      {
        canonical: 'gemini-1.5-flash',
        aliases: ['gemini-1.5-flash', 'gemini-2.0-flash']
      },
      {
        canonical: 'gemini-1.5-pro',
        aliases: ['gemini-1.5-pro']
      },
      {
        canonical: 'gemini-1.0-pro',
        aliases: ['gemini-1.0-pro']
      }
    ];
    for (const model of mcpModels) {
      const match = models.find(available =>
        model.aliases.some(alias =>
          available === alias ||
          available.replace(/^models\//, '') === alias ||
          available.includes(alias)
        )
      );
      if (match) return model.canonical;
    }
    return 'gemini-1.5-flash';
  }

  return '';
}
