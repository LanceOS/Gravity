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

export function createAiRouter() {
  const router = Router();

  router.get('/ollama/models', async (req, res) => {
    const rawUrl = typeof req.query.ollamaUrl === 'string' ? req.query.ollamaUrl : 'http://host.docker.internal:11434';
    const ollamaUrl = normalizeOllamaUrl(rawUrl);

    try {
      const response = await fetchWithTimeout(`${ollamaUrl}/api/tags`, { method: 'GET' }, 5000);
      if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Failed to query Ollama models.'));
      }

      const data = (await response.json()) as { models?: Array<{ name?: string }> };
      res.json((data.models ?? []).map((model) => model.name).filter(Boolean));
    } catch {
      res.json([]);
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

  router.post('/ai/chat', async (req, res) => {
    const ollamaUrl = normalizeOllamaUrl(typeof req.body?.ollamaUrl === 'string' ? req.body.ollamaUrl : 'http://host.docker.internal:11434');
    const model = typeof req.body?.model === 'string' ? req.body.model : '';
    const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];

    if (!model || messages.length === 0) {
      res.status(400).json({ error: 'model and messages are required.' });
      return;
    }

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
      res.status(502).json({ error: error instanceof Error ? error.message : 'Failed to contact Ollama.' });
    }
  });

  return router;
}