import { normalizeOllamaUrl } from '../platform.js';
import { ChatOptions, IAiProvider } from './types.js';
import { fetchWithTimeout, readErrorMessage } from './utils.js';

export class OllamaProvider implements IAiProvider {
  private readonly resolvedUrlCache = new Map<string, { url: string; resolvedAt: number }>();
  private readonly cacheTtlMs = 60000;

  /**
   * Attempts to connect to the given Ollama URL. If the URL uses localhost/127.0.0.1/0.0.0.0,
   * it attempts connection with host.docker.internal first to support Docker-hosted server
   * environments transparently and instantly, falling back to localhost/loopback if needed.
   * Caches results for 60 seconds to eliminate sequential probe latency.
   */
  async resolveOllamaUrl(rawUrl: string): Promise<string> {
    const normalized = normalizeOllamaUrl(rawUrl);

    // Check cache first
    const cached = this.resolvedUrlCache.get(normalized);
    if (cached && Date.now() - cached.resolvedAt < this.cacheTtlMs) {
      return cached.url;
    }

    // Only attempt fallback for localhost/loopback addresses
    const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:|$)/i.test(normalized);
    if (!isLocalhost) {
      this.resolvedUrlCache.set(normalized, { url: normalized, resolvedAt: Date.now() });
      return normalized;
    }

    // Attempt Docker-internal host fallback first
    const dockerFallback = normalized.replace(
      /^(https?:\/\/)(?:localhost|127\.0\.0\.1|0\.0\.0\.0)/i,
      '$1host.docker.internal',
    );

    try {
      const response = await fetchWithTimeout(`${dockerFallback}/api/tags`, { method: 'GET' }, 3000);
      if (response.ok) {
        this.resolvedUrlCache.set(normalized, { url: dockerFallback, resolvedAt: Date.now() });
        return dockerFallback;
      }
    } catch {
      // Fall through to original URL check
    }

    // Try original URL next
    try {
      const response = await fetchWithTimeout(`${normalized}/api/tags`, { method: 'GET' }, 3000);
      if (response.ok) {
        this.resolvedUrlCache.set(normalized, { url: normalized, resolvedAt: Date.now() });
        return normalized;
      }
    } catch {
      // Both failed — return original so the caller surfaces the correct URL in errors
    }

    return normalized;
  }

  /**
   * Fetches the list of models from Ollama. Throws on connection failure or non-OK response.
   */
  async fetchOllamaModels(rawUrl: string): Promise<string[]> {
    const ollamaUrl = await this.resolveOllamaUrl(rawUrl);

    try {
      const response = await fetchWithTimeout(`${ollamaUrl}/api/tags`, { method: 'GET' }, 5000);
      if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Ollama returned a non-OK response.'));
      }

      const data = (await response.json()) as { models?: Array<{ name?: string }> };
      return (data.models ?? []).map((model) => model.name).filter((name): name is string => Boolean(name));
    } catch (error) {
      this.resolvedUrlCache.delete(normalizeOllamaUrl(rawUrl));
      throw error;
    }
  }

  async chat(options: ChatOptions): Promise<{ content: string; toolCalls?: any[] }> {
    const { model, messages, tools, ollamaUrl: rawOllamaUrl } = options;
    const rawUrl = rawOllamaUrl || 'http://localhost:11434';
    const ollamaUrl = await this.resolveOllamaUrl(rawUrl);

    try {
      const response = await fetchWithTimeout(
        `${ollamaUrl}/api/chat`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            messages: this.mapMessages(messages),
            stream: false,
            ...(tools ? { tools: this.formatTools(tools) } : {}),
          }),
        },
        60000,
      );

      if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Failed to proxy request to Ollama.'));
      }

      const data = (await response.json()) as any;
      const content = data.message?.content || '';
      let toolCalls: any[] | undefined = undefined;

      if (data.message?.tool_calls) {
        toolCalls = data.message.tool_calls.map((tc: any, index: number) => ({
          id: tc.id ?? `${tc.function?.name ?? 'tool'}_${index}`,
          name: tc.function?.name,
          arguments: tc.function?.arguments,
        }));
      }

      return {
        content,
        ...(toolCalls ? { toolCalls } : {}),
      };
    } catch (error) {
      this.resolvedUrlCache.delete(normalizeOllamaUrl(rawUrl));
      throw error;
    }
  }

  async testConnection(options?: { apiKey?: string; ollamaUrl?: string }): Promise<void> {
    const url = options?.ollamaUrl || 'http://localhost:11434';
    const ollamaUrl = await this.resolveOllamaUrl(url);
    try {
      const response = await fetchWithTimeout(`${ollamaUrl}/api/tags`, { method: 'GET' }, 5000);
      if (!response.ok) {
        throw new Error('Connection to Ollama failed.');
      }
    } catch (error) {
      this.resolvedUrlCache.delete(normalizeOllamaUrl(url));
      throw error;
    }
  }

  clearCache(): void {
    this.resolvedUrlCache.clear();
  }

  private mapMessages(messages: any[]): any[] {
    return messages.map((m) => {
      if (m.role === 'tool') {
        return { role: 'tool', tool_call_id: m.tool_call_id, content: m.content };
      }
      if (m.role === 'assistant' && m.tool_calls) {
        return {
          role: 'assistant',
          content: m.content || null,
          tool_calls: m.tool_calls.map((tc: any) => ({
            id: tc.id,
            type: 'function',
            function: {
              name: tc.name,
              arguments: typeof tc.arguments === 'string' ? tc.arguments : JSON.stringify(tc.arguments),
            },
          })),
        };
      }
      return { role: m.role, content: m.content };
    });
  }

  private formatTools(tools: any[]): any[] {
    return tools.map((t) => ({
      type: 'function',
      function: { name: t.name, description: t.description, parameters: t.inputSchema },
    }));
  }
}
