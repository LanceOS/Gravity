/**
 * Performs an HTTP fetch request with a specified timeout and exponential backoff retry.
 * @param {string} url - The URL to request.
 * @param {RequestInit} init - Standard fetch request parameters.
 * @param {number} timeoutMs - Timeout in milliseconds.
 * @param {number} maxRetries - Maximum number of retry attempts for network/timeout errors or transient codes (429, 5xx).
 * @return {Promise<Response>} The fetch response.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 10000,
  maxRetries = 0,
): Promise<Response> {
  let attempt = 0;
  while (true) {
    attempt++;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      
      const isTransient = response.status === 429 || [502, 503, 504].includes(response.status);
      if (isTransient && attempt <= maxRetries) {
        const delay = Math.min(10000, 500 * Math.pow(2, attempt - 1)) + Math.random() * 200;
        clearTimeout(timer);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      
      clearTimeout(timer);
      return response;
    } catch (error) {
      const isAbort = error instanceof DOMException && error.name === 'AbortError';
      const isNetwork = error instanceof Error && !isAbort;
      
      if ((isAbort || isNetwork) && attempt <= maxRetries) {
        const delay = Math.min(10000, 500 * Math.pow(2, attempt - 1)) + Math.random() * 200;
        clearTimeout(timer);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      
      clearTimeout(timer);
      throw error;
    }
  }
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
