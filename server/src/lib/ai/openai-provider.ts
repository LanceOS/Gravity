import { ChatOptions, IAiProvider } from './types.js';
import { fetchWithTimeout, readErrorMessage } from './utils.js';

export class OpenAiProvider implements IAiProvider {
  constructor(private readonly isDeepSeek = false) {}

  private getBaseUrl(): string {
    return this.isDeepSeek ? 'https://api.deepseek.com' : 'https://api.openai.com';
  }

  async chat(options: ChatOptions): Promise<{ content: string; toolCalls?: any[] }> {
    const { model, messages, tools, apiKey } = options;
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
          stream: false,
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
