import { ChatOptions, IAiProvider } from '../types.js';
import { fetchWithTimeout, readErrorMessage } from '../utils/utils.js';

export class OpenAiProvider implements IAiProvider {
  constructor(private readonly isDeepSeek = false) {}

  private getBaseUrl(): string {
    return this.isDeepSeek ? 'https://api.deepseek.com' : 'https://api.openai.com';
  }

  async chat(options: ChatOptions): Promise<{ content: string; toolCalls?: any[] }> {
    const { model, messages, tools, apiKey, onChunk } = options;
    const streamMode = typeof onChunk === 'function';
    if (!apiKey) {
      throw new Error('API key is required for cloud providers.');
    }

    const response = await fetchWithTimeout(
      `${this.getBaseUrl()}/v1/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: this.mapMessages(messages),
          stream: streamMode,
          ...(tools ? { tools: this.formatTools(tools) } : {}),
        }),
      },
      60000,
      3, // 3 retries with exponential backoff for chat
    );

    const providerLabel = this.isDeepSeek ? 'DeepSeek' : 'OpenAI';
    if (!response.ok) {
      throw new Error(await readErrorMessage(response, `Failed to contact ${providerLabel}.`));
    }

    if (streamMode) {
      return this.consumeStreamingResponse(response, onChunk);
    }

    const data = (await response.json()) as any;
    const msg = data.choices?.[0]?.message;
    let toolCalls: any[] | undefined = undefined;

    if (msg?.tool_calls) {
      toolCalls = msg.tool_calls.map((tc: any) => {
        const rawArguments = tc.function.arguments;
        let parsedArguments = rawArguments;

        if (typeof rawArguments === 'string' && rawArguments !== '') {
          try {
            parsedArguments = JSON.parse(rawArguments);
          } catch {
            parsedArguments = rawArguments;
          }
        }

        return {
          id: tc.id,
          name: tc.function.name,
          arguments: parsedArguments,
        };
      });
    }

    return {
      content: msg?.content || '',
      ...(toolCalls ? { toolCalls } : {}),
    };
  }

  private async consumeStreamingResponse(response: Response, onChunk?: (chunk: string) => Promise<void> | void) {
    if (!response.body) {
      throw new Error('Provider returned no response body for streaming mode.');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let content = '';
    const toolCallsByIndex = new Map<number, { id?: string; name?: string; arguments: string }>();

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      let boundary = buffer.indexOf('\n\n');
      while (boundary >= 0) {
        const event = buffer.slice(0, boundary).trim();
        buffer = buffer.slice(boundary + 2);

        const dataLine = event
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.replace(/^data:\s*/, ''))
          .join('\n');

        if (!dataLine || dataLine === '[DONE]') {
          boundary = buffer.indexOf('\n\n');
          continue;
        }

        let parsed: any;
        try {
          parsed = JSON.parse(dataLine);
        } catch (_error) {
          boundary = buffer.indexOf('\n\n');
          continue;
        }

        const delta = parsed.choices?.[0]?.delta;
        const deltaContent = typeof delta?.content === 'string' ? delta.content : '';
        if (deltaContent) {
          content += deltaContent;
          if (onChunk) {
            await onChunk(deltaContent);
          }
        }

        const deltaToolCalls = Array.isArray(delta?.tool_calls) ? delta.tool_calls : [];
        for (const rawCall of deltaToolCalls) {
          const index = Number(rawCall?.index);
          if (!Number.isInteger(index)) {
            continue;
          }

          const current = toolCallsByIndex.get(index) ?? { arguments: '' };
          if (typeof rawCall?.id === 'string') {
            current.id = rawCall.id;
          }

          if (typeof rawCall?.function?.name === 'string') {
            current.name = rawCall.function.name;
          }

          if (typeof rawCall?.function?.arguments === 'string') {
            current.arguments = `${current.arguments}${rawCall.function.arguments}`;
          }

          toolCallsByIndex.set(index, current);
        }

        boundary = buffer.indexOf('\n\n');
      }
    }

    const toolCalls = Array.from(toolCallsByIndex.values())
      .filter((toolCall) => toolCall.id && toolCall.name)
      .map((toolCall) => ({
        id: toolCall.id,
        name: toolCall.name,
        arguments: this.safeParseArguments(toolCall.arguments),
      }));

    return {
      content,
      ...(toolCalls.length > 0 ? { toolCalls } : {}),
    };
  }

  private safeParseArguments(value: string) {
    try {
      const parsed = JSON.parse(value);
      return parsed;
    } catch (_error) {
      return value;
    }
  }

  async testConnection(options?: string | { apiKey?: string; ollamaUrl?: string }): Promise<void> {
    const apiKey = typeof options === 'string' ? options : options?.apiKey;
    if (!apiKey) {
      throw new Error('API key is required.');
    }

    const response = await fetchWithTimeout(
      `${this.getBaseUrl()}/v1/models`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      },
      10000,
      3, // 3 retries with exponential backoff for connection test
    );

    const providerLabel = this.isDeepSeek ? 'DeepSeek' : 'OpenAI';
    if (!response.ok) {
      throw new Error(await readErrorMessage(response, `${providerLabel} API key test failed.`));
    }
  }

  async fetchModels(apiKey: string): Promise<string[]> {
    if (!apiKey) {
      throw new Error('API key is required.');
    }

    const response = await fetchWithTimeout(
      `${this.getBaseUrl()}/v1/models`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      },
      10000,
      3,
    );

    const providerLabel = this.isDeepSeek ? 'DeepSeek' : 'OpenAI';
    if (!response.ok) {
      throw new Error(await readErrorMessage(response, `Failed to fetch ${providerLabel} models.`));
    }

    const data = (await response.json()) as any;
    return (data.data || []).map((m: any) => m.id);
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
