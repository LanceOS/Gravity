import { Router } from 'express';
import { normalizeOllamaUrl } from '../lib/platform.js';

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function readErrorMessage(response: Response, fallback: string) {
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

async function testProviderApiKey(provider: string, apiKey: string) {
  if (provider === 'anthropic') {
    const response = await fetchWithTimeout('https://api.anthropic.com/v1/models', {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
    });
    if (!response.ok) {
      throw new Error(await readErrorMessage(response, 'Anthropic API key test failed.'));
    }
    return;
  }

  if (provider === 'gemini') {
    const response = await fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
      { method: 'GET' },
    );
    if (!response.ok) {
      throw new Error(await readErrorMessage(response, 'Gemini API key test failed.'));
    }
    return;
  }

  if (provider === 'deepseek') {
    const response = await fetchWithTimeout('https://api.deepseek.com/models', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });
    if (!response.ok) {
      throw new Error(await readErrorMessage(response, 'DeepSeek API key test failed.'));
    }
    return;
  }

  const response = await fetchWithTimeout('https://api.openai.com/v1/models', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, 'OpenAI API key test failed.'));
  }
}

/**
 * Attempts to connect to the given Ollama URL. If the URL uses localhost/127.0.0.1/0.0.0.0,
 * it attempts connection with host.docker.internal first to support Docker-hosted server
 * environments transparently and instantly, falling back to localhost/loopback if needed.
 */
async function resolveOllamaUrl(rawUrl: string): Promise<string> {
  const normalized = normalizeOllamaUrl(rawUrl);

  // Only attempt fallback for localhost/loopback addresses
  const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:|$)/i.test(normalized);
  if (!isLocalhost) {
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
      return dockerFallback;
    }
  } catch {
    // Fall through to original URL check
  }

  // Try original URL next
  try {
    const response = await fetchWithTimeout(`${normalized}/api/tags`, { method: 'GET' }, 3000);
    if (response.ok) {
      return normalized;
    }
  } catch {
    // Both failed — return original so the caller surfaces the correct URL in errors
  }

  return normalized;
}

/**
 * Fetches the list of models from Ollama. Throws on connection failure or non-OK response.
 * Returns an array of model name strings on success.
 */
async function fetchOllamaModels(rawUrl: string): Promise<string[]> {
  const ollamaUrl = await resolveOllamaUrl(rawUrl);

  const response = await fetchWithTimeout(`${ollamaUrl}/api/tags`, { method: 'GET' }, 5000);
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, 'Ollama returned a non-OK response.'));
  }

  const data = (await response.json()) as { models?: Array<{ name?: string }> };
  return (data.models ?? []).map((model) => model.name).filter((name): name is string => Boolean(name));
}

// Formatters for tools
function formatToolsForOpenAI(tools: any[]) {
  return tools.map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.inputSchema },
  }));
}

function formatToolsForAnthropic(tools: any[]) {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema,
  }));
}

function formatToolsForGemini(tools: any[]) {
  return [{
    functionDeclarations: tools.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.inputSchema,
    })),
  }];
}

// Formatters for messages
function mapMessagesForOpenAI(messages: any[]) {
  return messages.map(m => {
    if (m.role === 'tool') {
      return { role: 'tool', tool_call_id: m.tool_call_id, content: m.content };
    }
    if (m.role === 'assistant' && m.tool_calls) {
      return { role: 'assistant', content: m.content || null, tool_calls: m.tool_calls.map((tc: any) => ({
        id: tc.id,
        type: 'function',
        function: { name: tc.name, arguments: typeof tc.arguments === 'string' ? tc.arguments : JSON.stringify(tc.arguments) }
      })) };
    }
    return { role: m.role, content: m.content };
  });
}

function mapMessagesForAnthropic(messages: any[]) {
  const result: any[] = [];
  for (const m of messages) {
    if (m.role === 'system') continue;
    
    if (m.role === 'tool') {
      result.push({
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: m.tool_call_id, content: m.content }]
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

function mapMessagesForGemini(messages: any[]) {
  const result: any[] = [];
  for (const m of messages) {
    if (m.role === 'system') continue;

    if (m.role === 'tool') {
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
      
      result.push({
        role: 'user',
        parts: [{ functionResponse: { name: m.name, response: { name: m.name, content: contentObj } } }]
      });
    } else if (m.role === 'assistant' && m.tool_calls?.length) {
      const parts: any[] = [];
      if (m.content) parts.push({ text: m.content });
      for (const tc of m.tool_calls) {
        let args = tc.arguments;
        if (typeof tc.arguments === 'string') {
          try {
            args = JSON.parse(tc.arguments);
          } catch {
            args = tc.arguments;
          }
        }
        parts.push({ functionCall: { name: tc.name, args } });
      }
      result.push({ role: 'model', parts });
    } else {
      result.push({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] });
    }
  }
  return result;
}


async function measureProviderConnection(provider: string, apiKey: string) {
  const startedAt = Date.now();
  await testProviderApiKey(provider, apiKey);
  return Date.now() - startedAt;
}

export function createAiRouter() {
  const router = Router();

  function normalizeOllamaErrorMessage(error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to contact Ollama.';
    return /fetch failed|network|econnrefused|enotfound|aborted/i.test(message)
      ? 'Could not connect to Ollama.'
      : message;
  }


  router.get('/ai/ollama/models', async (req, res) => {
    const rawUrl = typeof req.query.ollamaUrl === 'string' ? req.query.ollamaUrl : 'http://localhost:11434';
    try {
      const models = await fetchOllamaModels(rawUrl);
      res.json({ models, connected: true });
    } catch (error) {
      res.json({ models: [], connected: false, error: normalizeOllamaErrorMessage(error) });
    }
  });

  router.post('/ai/test-key', async (req, res) => {
    const provider = typeof req.body?.provider === 'string' ? req.body.provider : 'openai';
    const apiKey = typeof req.body?.apiKey === 'string' ? req.body.apiKey.trim() : '';
    if (!apiKey) {
      res.status(400).json({ error: 'API key is required.' });
      return;
    }

    try {
      await testProviderApiKey(provider, apiKey);
      res.json({ message: `${provider} API key validated successfully.` });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Connection test failed.' });
    }
  });

  router.post('/ai/test-connection', async (req, res) => {
    const provider = typeof req.body?.provider === 'string' ? req.body.provider : 'openai';
    const apiKey =
      typeof req.body?.api_key === 'string'
        ? req.body.api_key.trim()
        : typeof req.body?.apiKey === 'string'
          ? req.body.apiKey.trim()
          : '';

    if (!apiKey) {
      res.status(400).json({ error: 'API key is required.' });
      return;
    }

    try {
      const latencyMs = await measureProviderConnection(provider, apiKey);
      res.json({
        connected: true,
        latency_ms: latencyMs,
        message: 'Connection verified successfully.',
      });
    } catch (error) {
      res.status(400).json({
        connected: false,
        latency_ms: null,
        error: error instanceof Error ? error.message : 'Connection test failed.',
      });
    }
  });

  router.post('/ai/chat', async (req, res) => {
    const provider = typeof req.body?.provider === 'string' ? req.body.provider.toLowerCase() : 'ollama';
    const apiKey = typeof req.body?.apiKey === 'string' ? req.body.apiKey.trim() : '';
    const model = typeof req.body?.model === 'string' ? req.body.model : '';
    const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
    const tools = Array.isArray(req.body?.tools) && req.body.tools.length > 0 ? req.body.tools : undefined;

    if (!model || messages.length === 0) {
      res.status(400).json({ error: 'model and messages are required.' });
      return;
    }

    if (provider !== 'ollama') {
      if (!apiKey) {
        res.status(400).json({ error: 'API key is required for cloud providers.' });
        return;
      }

      try {
        let content = '';
        let tool_calls: any[] | undefined = undefined;

        if (provider === 'openai' || provider === 'deepseek') {
          const baseUrl = provider === 'deepseek' ? 'https://api.deepseek.com' : 'https://api.openai.com';
          const response = await fetchWithTimeout(
            `${baseUrl}/v1/chat/completions`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
              },
              body: JSON.stringify({
                model,
                messages: mapMessagesForOpenAI(messages),
                stream: false,
                ...(tools ? { tools: formatToolsForOpenAI(tools) } : {})
              }),
            },
            60000,
          );

          if (!response.ok) {
            throw new Error(await readErrorMessage(response, `Failed to contact ${provider}.`));
          }

          const data = await response.json() as any;
          const msg = data.choices?.[0]?.message;
          if (msg?.tool_calls) {
            tool_calls = msg.tool_calls.map((tc: any) => {
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
          content = msg?.content || '';
        } else if (provider === 'anthropic') {
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
                messages: mapMessagesForAnthropic(messages),
                max_tokens: 4096,
                ...(system ? { system } : {}),
                stream: false,
                ...(tools ? { tools: formatToolsForAnthropic(tools) } : {})
              }),
            },
            60000,
          );

          if (!response.ok) {
            throw new Error(await readErrorMessage(response, 'Failed to contact Anthropic.'));
          }

          const data = await response.json() as any;
          const textBlocks = data.content?.filter((b: any) => b.type === 'text') || [];
          const toolBlocks = data.content?.filter((b: any) => b.type === 'tool_use') || [];
          
          content = textBlocks.map((b: any) => b.text).join('\n');
          if (toolBlocks.length > 0) {
            tool_calls = toolBlocks.map((tc: any) => ({
              id: tc.id,
              name: tc.name,
              arguments: tc.input,
            }));
          }
        } else if (provider === 'gemini') {
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
                contents: mapMessagesForGemini(messages),
                ...(systemText ? {
                  systemInstruction: {
                    parts: [{ text: systemText }],
                  },
                } : {}),
                ...(tools ? { tools: formatToolsForGemini(tools) } : {})
              }),
            },
            60000,
          );

          if (!response.ok) {
            throw new Error(await readErrorMessage(response, 'Failed to contact Gemini.'));
          }

          const data = await response.json() as any;
          const parts = data.candidates?.[0]?.content?.parts || [];
          
          const textParts = parts.filter((p: any) => p.text);
          const toolCallParts = parts.filter((p: any) => p.functionCall);

          content = textParts.map((p: any) => p.text).join('\n');
          if (toolCallParts.length > 0) {
            tool_calls = toolCallParts.map((tc: any, index: number) => ({
              id: tc.functionCall.id ?? tc.functionCall.callId ?? `${tc.functionCall.name}_${index}`,
              name: tc.functionCall.name,
              arguments: tc.functionCall.args,
            }));
          }
        } else {
          res.status(400).json({ error: `Unsupported provider: ${provider}` });
          return;
        }

        res.json({
          message: {
            role: 'assistant',
            content,
            ...(tool_calls ? { tool_calls } : {})
          },
        });
      } catch (error) {
        res.status(502).json({ error: error instanceof Error ? error.message : `Connection to ${provider} failed.` });
      }
      return;
    }

    // Default Ollama behavior
    const rawOllamaUrl = typeof req.body?.ollamaUrl === 'string' ? req.body.ollamaUrl : 'http://localhost:11434';
    const ollamaUrl = await resolveOllamaUrl(rawOllamaUrl);

    try {
      const response = await fetchWithTimeout(
        `${ollamaUrl}/api/chat`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            messages: mapMessagesForOpenAI(messages),
            stream: false,
            ...(tools ? { tools: formatToolsForOpenAI(tools) } : {})
          }),
        },
        60000,
      );

      if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Failed to proxy request to Ollama.'));
      }

      const data = await response.json() as any;
      let content = data.message?.content || '';
      let tool_calls: any[] | undefined = undefined;
      
      if (data.message?.tool_calls) {
        tool_calls = data.message.tool_calls.map((tc: any) => ({
          id: tc.function?.name + '_' + Math.random().toString(36).substr(2, 9),
          name: tc.function?.name,
          arguments: tc.function?.arguments,
        }));
      }

      res.json({
        message: {
          role: 'assistant',
          content,
          ...(tool_calls ? { tool_calls } : {})
        }
      });
    } catch (error) {
      res.status(502).json({ error: normalizeOllamaErrorMessage(error) });
    }
  });

  return router;
}