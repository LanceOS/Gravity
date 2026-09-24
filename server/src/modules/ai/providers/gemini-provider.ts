import { ChatOptions, IAiProvider } from '../types.js';
import { fetchWithTimeout, readErrorMessage } from '../utils/utils.js';

export class GeminiProvider implements IAiProvider {
  async chat(options: ChatOptions): Promise<{ content: string; toolCalls?: any[] }> {
    const { model, messages, tools, apiKey } = options;
    if (!apiKey) {
      throw new Error('API key is required for cloud providers.');
    }

    let systemText = '';
    for (const msg of messages) {
      if (msg.role === 'system') {
        systemText = (systemText ? systemText + '\n' : '') + msg.content;
      }
    }

    const response = await fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          contents: this.mapMessages(messages),
          ...(systemText
            ? {
                systemInstruction: {
                  parts: [{ text: systemText }],
                },
              }
            : {}),
          ...(tools ? { tools: this.formatTools(tools) } : {}),
        }),
      },
      60000,
      3, // 3 retries with exponential backoff for chat
    );

    if (!response.ok) {
      throw new Error(await readErrorMessage(response, 'Failed to contact Gemini.'));
    }

    const data = (await response.json()) as any;
    const parts = data.candidates?.[0]?.content?.parts || [];

    const textParts = parts.filter((p: any) => p.text);
    const toolCallParts = parts.filter((p: any) => p.functionCall);

    const content = textParts.map((p: any) => p.text).join('\n');
    let toolCalls: any[] | undefined = undefined;

    if (toolCallParts.length > 0) {
      toolCalls = toolCallParts.map((tc: any, index: number) => ({
        id: tc.functionCall.id ?? tc.functionCall.callId ?? `${tc.functionCall.name}_${index}`,
        name: tc.functionCall.name,
        arguments: tc.functionCall.args,
        // Preserve provider-specific thought signatures and call IDs unchanged.
        geminiPart: tc,
      }));
    }

    return {
      content,
      ...(toolCalls ? { toolCalls } : {}),
    };
  }

  async testConnection(options?: string | { apiKey?: string }): Promise<void> {
    const apiKey = typeof options === 'string' ? options : options?.apiKey;
    if (!apiKey) {
      throw new Error('API key is required.');
    }

    const response = await fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
      { method: 'GET' },
      10000,
      3, // 3 retries with exponential backoff for connection test
    );

    if (!response.ok) {
      throw new Error(await readErrorMessage(response, 'Gemini API key test failed.'));
    }
  }

  async fetchModels(apiKey: string): Promise<string[]> {
    if (!apiKey) {
      throw new Error('API key is required.');
    }

    const response = await fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
      { method: 'GET' },
      10000,
      3,
    );

    if (!response.ok) {
      throw new Error(await readErrorMessage(response, 'Failed to fetch Gemini models.'));
    }

    const data = (await response.json()) as any;
    return (data.models || []).map((m: any) => m.name.replace(/^models\//, ''));
  }

  private mapMessages(messages: any[]): any[] {
    const result: any[] = [];
    const calls = new Map<string, any>();
    for (const m of messages) {
      if (m.role === 'system') continue;

      if (m.role === 'tool') {
        const call = calls.get(m.tool_call_id);
        const name = m.name ?? call?.name;
        if (!name) throw new Error('Gemini tool results require a matching function name.');
        let contentObj;
        if (typeof m.content === 'string') {
          try {
            contentObj = JSON.parse(m.content);
          } catch {
            contentObj = { text: m.content };
          }
        } else {
          contentObj = m.content;
        }

        const part = {
          functionResponse: {
            name,
            ...(call?.geminiPart?.functionCall?.id ? { id: call.geminiPart.functionCall.id } : {}),
            response: { content: contentObj },
          },
        };
        const previous = result.at(-1);
        // Parallel calls belong to one model turn and must receive all their
        // responses together in the following user turn.
        if (previous?.role === 'user' && previous.parts.every((p: any) => p.functionResponse)) {
          previous.parts.push(part);
        } else {
          result.push({ role: 'user', parts: [part] });
        }
      } else if (m.role === 'assistant' && m.tool_calls?.length) {
        const parts: any[] = [];
        if (m.content) parts.push({ text: m.content });
        for (const tc of m.tool_calls) {
          calls.set(tc.id, tc);
          let args = tc.arguments;
          if (typeof tc.arguments === 'string') {
            try {
              args = JSON.parse(tc.arguments);
            } catch {
              args = tc.arguments;
            }
          }
          parts.push(tc.geminiPart ?? { functionCall: { name: tc.name, args } });
        }
        result.push({ role: 'model', parts });
      } else {
        result.push({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] });
      }
    }
    return result;
  }

  private formatTools(tools: any[]): any[] {
    return [
      {
        functionDeclarations: tools.map((t) => ({
          name: t.name,
          description: t.description,
          parametersJsonSchema: t.inputSchema,
        })),
      },
    ];
  }
}
