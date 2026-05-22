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
 * Attempts to connect to the given Ollama URL. If the URL uses localhost/127.0.0.1
 * and the connection fails, it automatically retries with host.docker.internal
 * to support Docker-hosted server environments transparently.
 */
async function resolveOllamaUrl(rawUrl: string): Promise<string> {
  const normalized = normalizeOllamaUrl(rawUrl);

  // Only attempt fallback for localhost/loopback addresses
  const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:|$)/i.test(normalized);
  if (!isLocalhost) {
    return normalized;
  }

  // Try original URL first
  try {
    const response = await fetchWithTimeout(`${normalized}/api/tags`, { method: 'GET' }, 3000);
    if (response.ok) {
      return normalized;
    }
  } catch {
    // Fall through to docker internal fallback
  }

  // Attempt Docker-internal host fallback
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
                messages,
                stream: false,
              }),
            },
            60000,
          );

          if (!response.ok) {
            throw new Error(await readErrorMessage(response, `Failed to contact ${provider}.`));
          }

          const data = await response.json() as any;
          content = data.choices?.[0]?.message?.content || '';
        } else if (provider === 'anthropic') {
          let system: string | undefined = undefined;
          const filteredMessages = messages.filter((msg: any) => {
            if (msg.role === 'system') {
              system = (system ? system + '\n' : '') + msg.content;
              return false;
            }
            return true;
          });

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
                messages: filteredMessages,
                max_tokens: 4096,
                system,
                stream: false,
              }),
            },
            60000,
          );

          if (!response.ok) {
            throw new Error(await readErrorMessage(response, 'Failed to contact Anthropic.'));
          }

          const data = await response.json() as any;
          content = data.content?.[0]?.text || '';
        } else if (provider === 'gemini') {
          let systemText = '';
          const contents = [];
          for (const msg of messages) {
            if (msg.role === 'system') {
              systemText = (systemText ? systemText + '\n' : '') + msg.content;
            } else {
              contents.push({
                role: msg.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: msg.content }],
              });
            }
          }

          const response = await fetchWithTimeout(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                contents,
                ...(systemText ? {
                  systemInstruction: {
                    parts: [{ text: systemText }],
                  },
                } : {}),
              }),
            },
            60000,
          );

          if (!response.ok) {
            throw new Error(await readErrorMessage(response, 'Failed to contact Gemini.'));
          }

          const data = await response.json() as any;
          content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        } else {
          res.status(400).json({ error: `Unsupported provider: ${provider}` });
          return;
        }

        res.json({
          message: {
            role: 'assistant',
            content,
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
          body: JSON.stringify({ model, messages, stream: false }),
        },
        60000,
      );

      if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Failed to proxy request to Ollama.'));
      }

      res.json(await response.json());
    } catch (error) {
      res.status(502).json({ error: normalizeOllamaErrorMessage(error) });
    }
  });

  return router;
}