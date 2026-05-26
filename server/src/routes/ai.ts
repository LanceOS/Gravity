import { Router } from 'express';
import { aiService } from '../lib/ai/index.js';
import { resolveRequestActorUserId } from '../lib/request-auth.js';
import { validateOllamaUrl } from '../lib/ai/utils.js';

const API_KEY_MASK = '••••••••••••';

function normalizeIncomingApiKey(rawValue: unknown): string | undefined {
  if (typeof rawValue !== 'string') {
    return undefined;
  }

  const trimmed = rawValue.trim();
  if (!trimmed || trimmed === API_KEY_MASK) {
    return undefined;
  }

  return trimmed;
}

export function createAiRouter() {
  const router = Router();

  router.get('/ai/ollama/models', async (req, res) => {
    const actorUserId = await resolveRequestActorUserId(req);
    if (!actorUserId) {
      res.status(401).json({ error: 'Unauthorized.' });
      return;
    }

    const rawUrl = typeof req.query.ollamaUrl === 'string' ? req.query.ollamaUrl : 'http://localhost:11434';
    try {
      validateOllamaUrl(rawUrl);
      const models = await aiService.getOllamaProvider().fetchOllamaModels(rawUrl);
      res.json({ models, connected: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to contact Ollama.';
      const sanitized = message.includes('Security Exception') ? 'External credentials configuration error.' : message;
      const normalizedError = /fetch failed|network|econnrefused|enotfound|aborted/i.test(sanitized)
        ? 'Could not connect to Ollama.'
        : sanitized;
      res.json({ models: [], connected: false, error: normalizedError });
    }
  });

  router.post('/ai/test-key', async (req, res) => {
    const actorUserId = await resolveRequestActorUserId(req);
    if (!actorUserId) {
      res.status(401).json({ error: 'Unauthorized.' });
      return;
    }

    const provider = typeof req.body?.provider === 'string' ? req.body.provider : 'openai';
    const apiKey = normalizeIncomingApiKey(req.body?.apiKey);

    // If no apiKey is provided, delegate to the stored credential via testConnection.
    // If apiKey is provided, use it directly as a live validation.
    try {
      await aiService.testConnection(actorUserId, provider, { apiKey });
      res.json({ message: `${provider} API key validated successfully.` });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Connection test failed.';
      const sanitized = message.includes('Security Exception') ? 'External credentials configuration error.' : message;
      res.status(400).json({ error: sanitized });
    }
  });

  router.post('/ai/test-connection', async (req, res) => {
    const actorUserId = await resolveRequestActorUserId(req);
    if (!actorUserId) {
      res.status(401).json({ error: 'Unauthorized.' });
      return;
    }

    const provider = typeof req.body?.provider === 'string' ? req.body.provider : 'openai';
    const apiKey = normalizeIncomingApiKey(req.body?.apiKey ?? req.body?.api_key);

    const ollamaUrl = typeof req.body?.ollamaUrl === 'string' ? req.body.ollamaUrl.trim() : undefined;

    try {
      if (ollamaUrl) {
        validateOllamaUrl(ollamaUrl);
      }
      const latency = await aiService.testConnection(actorUserId, provider, { apiKey, ollamaUrl });
      res.json({
        connected: true,
        latency_ms: latency,
        message: 'Connection verified successfully.',
        error: null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Connection test failed.';
      const sanitized = message.includes('Security Exception') ? 'External credentials configuration error.' : message;
      res.status(400).json({
        connected: false,
        latency_ms: null,
        error: sanitized,
      });
    }
  });

  router.post('/ai/chat', async (req, res) => {
    const actorUserId = await resolveRequestActorUserId(req);
    if (!actorUserId) {
      res.status(401).json({ error: 'Unauthorized.' });
      return;
    }

    const provider = typeof req.body?.provider === 'string' ? req.body.provider.toLowerCase() : 'ollama';
    const model = typeof req.body?.model === 'string' ? req.body.model : '';
    const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
    const tools = Array.isArray(req.body?.tools) && req.body.tools.length > 0 ? req.body.tools : undefined;

    if (!model || messages.length === 0) {
      res.status(400).json({ error: 'model and messages are required.' });
      return;
    }

    try {
      const rawOllamaUrl = typeof req.body?.ollamaUrl === 'string' ? req.body.ollamaUrl : undefined;
      const ollamaUrl = provider === 'ollama' ? (rawOllamaUrl ?? 'http://localhost:11434') : undefined;
      if (ollamaUrl) {
        validateOllamaUrl(ollamaUrl);
      }

      const result = await aiService.chat(actorUserId, provider, {
        model,
        messages,
        tools,
        ...(ollamaUrl ? { ollamaUrl } : {}),
      });

      res.json({
        message: {
          role: 'assistant',
          content: result.content,
          ...(result.toolCalls ? { tool_calls: result.toolCalls } : {}),
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Chat execution failed.';
      
      if (message.includes('Unsupported provider')) {
        res.status(400).json({ error: message });
        return;
      }

      if (message.includes('Security Exception')) {
        const status = provider === 'ollama' ? 400 : 502;
        res.status(status).json({ error: 'External credentials configuration error.' });
        return;
      }

      const isOllama = provider === 'ollama';
      const normalizedError =
        isOllama && /fetch failed|network|econnrefused|enotfound|aborted/i.test(message)
          ? 'Could not connect to Ollama.'
          : message;

      res.status(502).json({ error: normalizedError });
    }
  });

  return router;
}