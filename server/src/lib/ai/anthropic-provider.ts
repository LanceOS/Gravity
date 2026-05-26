import { ChatOptions, IAiProvider } from './types.js';
import { fetchWithTimeout, readErrorMessage } from './utils.js';

export class AnthropicProvider implements IAiProvider {
  async chat(options: ChatOptions): Promise<{ content: string; toolCalls?: any[] }> {
    const { model, messages, tools, apiKey, maxTokens } = options;
    if (!apiKey) {
      throw new Error('API key is required for cloud providers.');
    }

    let system: string | undefined = undefined;
    for (const msg of messages) {
      if (msg.role === 'system') {
        system = (system ? system + '\n' : '') + msg.content;
      }
    }

    const response = await fetchWithTimeout(
      'https://api.anthropic.com/v1/messages',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          messages: this.mapMessages(messages),
          max_tokens: maxTokens ?? 4096,
          ...(system ? { system } : {}),
          stream: false,
          ...(tools ? { tools: this.formatTools(tools) } : {}),
        }),
      },
      60000,
      3, // 3 retries with exponential backoff for chat
    );

    if (!response.ok) {
      throw new Error(await readErrorMessage(response, 'Failed to contact Anthropic.'));
    }

    const data = (await response.json()) as any;
    const textBlocks = data.content?.filter((b: any) => b.type === 'text') || [];
    const toolBlocks = data.content?.filter((b: any) => b.type === 'tool_use') || [];

    const content = textBlocks.map((b: any) => b.text).join('\n');
    let toolCalls: any[] | undefined = undefined;

    if (toolBlocks.length > 0) {
      toolCalls = toolBlocks.map((tc: any) => ({
        id: tc.id,
        name: tc.name,
        arguments: tc.input,
      }));
    }

    return {
      content,
      ...(toolCalls ? { toolCalls } : {}),
    };
  }

  async testConnection(options?: string | { apiKey?: string; ollamaUrl?: string }): Promise<void> {
    const apiKey = typeof options === 'string' ? options : options?.apiKey;
    if (!apiKey) {
      throw new Error('API key is required.');
    }

    const response = await fetchWithTimeout('https://api.anthropic.com/v1/models', {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
    }, 10000, 3); // 3 retries with exponential backoff for connection test

    if (!response.ok) {
      throw new Error(await readErrorMessage(response, 'Anthropic API key test failed.'));
    }
  }

  async fetchModels(apiKey: string): Promise<string[]> {
    if (!apiKey) {
      throw new Error('API key is required.');
    }

    const response = await fetchWithTimeout('https://api.anthropic.com/v1/models', {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
    }, 10000, 3);

    if (!response.ok) {
      throw new Error(await readErrorMessage(response, 'Failed to fetch Anthropic models.'));
    }

    const data = (await response.json()) as any;
    return (data.data || []).map((m: any) => m.id);
  }

  private mapMessages(messages: any[]): any[] {
    const result: any[] = [];
    for (const m of messages) {
      if (m.role === 'system') continue;

      if (m.role === 'tool') {
        result.push({
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: m.tool_call_id, content: m.content }],
        });
      } else if (m.role === 'assistant' && m.tool_calls?.length) {
        const content: any[] = [];
        if (m.content) content.push({ type: 'text', text: m.content });
        for (const tc of m.tool_calls) {
          let input = tc.arguments;
          if (typeof tc.arguments === 'string') {
            try {
              input = JSON.parse(tc.arguments);
            } catch {
              input = tc.arguments;
            }
          }
          content.push({ type: 'tool_use', id: tc.id, name: tc.name, input });
        }
        result.push({ role: 'assistant', content });
      } else {
        result.push({ role: m.role, content: m.content });
      }
    }
    return result;
  }

  private formatTools(tools: any[]): any[] {
    return tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema,
    }));
  }
}
