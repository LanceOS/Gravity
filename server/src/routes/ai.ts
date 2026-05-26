import { Router } from 'express';
import { aiService } from '../lib/ai/index.js';
import { resolveRequestActorUserId } from '../lib/request-auth.js';
import { validateOllamaUrl } from '../lib/ai/utils.js';

const API_KEY_MASK = '••••••••••••';

const PROVIDER_LABELS: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  gemini: 'Gemini',
  deepseek: 'DeepSeek',
  ollama: 'Ollama',
};

const VALID_PROVIDERS = new Set(Object.keys(PROVIDER_LABELS));

type ParsedApiKey = {
  value?: string;
  provided: boolean;
  blank: boolean;
  invalidType: boolean;
};

function parseIncomingApiKey(rawValue: unknown): ParsedApiKey {
  if (rawValue === undefined) {
    return { value: undefined, provided: false, blank: false, invalidType: false };
  }

  if (typeof rawValue !== 'string') {
    return { value: undefined, provided: true, blank: false, invalidType: true };
  }

  const trimmed = rawValue.trim();
  if (!trimmed) {
    return { value: undefined, provided: true, blank: true, invalidType: false };
  }

  if (trimmed === API_KEY_MASK) {
    return { value: undefined, provided: true, blank: false, invalidType: false };
  }

  return { value: trimmed, provided: true, blank: false, invalidType: false };
}

function isSafeValidationMessage(message: string) {
  return message === 'Invalid URL format.' || message === 'URL scheme must be http or https.';
}

function isMissingCredentialMessage(message: string) {
  return /No external credentials found|API key is required/i.test(message);
}

function providerLabel(provider: string): string {
  return PROVIDER_LABELS[provider] ?? 'AI provider';
}

function sanitizeAiError(
  error: unknown,
  provider: string,
  operation: 'models' | 'test' | 'chat',
): { status: number; message: string } {
  const message = error instanceof Error ? error.message : 'Unexpected error.';

  if (message.includes('Unsupported provider')) {
    return { status: 400, message: 'Unsupported provider.' };
  }

  if (isSafeValidationMessage(message)) {
    return { status: 400, message };
  }

  if (isMissingCredentialMessage(message)) {
    return { status: 400, message: 'No API key configured for this account.' };
  }

  if (message.includes('Security Exception')) {
    return {
      status: provider === 'ollama' ? 400 : operation === 'chat' ? 502 : 400,
      message:
        provider === 'ollama'
          ? 'Provided Ollama endpoint is not allowed.'
          : 'Cloud AI provider configuration error.',
    };
  }

  if (provider === 'ollama') {
    return { status: operation === 'chat' ? 502 : 400, message: 'Could not connect to Ollama.' };
  }

  if (operation === 'chat') {
    return { status: 502, message: `${providerLabel(provider)} request failed.` };
  }

  return {
    status: 400,
    message: `Connection verification failed for ${providerLabel(provider)}. Check your provider settings and API key.`,
  };
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
      console.error('Failed to load Ollama models:', error);
      const sanitized = sanitizeAiError(error, 'ollama', 'models');
      res.json({ models: [], connected: false, error: sanitized.message });
    }
  });

  router.post('/ai/test-key', async (req, res) => {
    const actorUserId = await resolveRequestActorUserId(req);
    if (!actorUserId) {
      res.status(401).json({ error: 'Unauthorized.' });
      return;
    }

    const provider = (typeof req.body?.provider === 'string' ? req.body.provider : 'openai').toLowerCase();
    if (!VALID_PROVIDERS.has(provider)) {
      res.status(400).json({ error: 'Unsupported provider.' });
      return;
    }

    const parsedApiKey = parseIncomingApiKey(req.body?.apiKey);

    if (parsedApiKey.blank) {
      res.status(400).json({ error: 'API key must not be empty.' });
      return;
    }

    // If no apiKey is provided, delegate to the stored credential via testConnection.
    // If apiKey is provided, use it directly as a live validation.
    try {
      await aiService.testConnection(actorUserId, provider, { apiKey: parsedApiKey.value });
      res.json({ message: `${providerLabel(provider)} API key validated successfully.` });
    } catch (error) {
      console.error(`AI test-key failed for provider ${provider}:`, error);
      const sanitized = sanitizeAiError(error, provider, 'test');
      res.status(sanitized.status).json({ error: sanitized.message });
    }
  });

  router.post('/ai/test-connection', async (req, res) => {
    const actorUserId = await resolveRequestActorUserId(req);
    if (!actorUserId) {
      res.status(401).json({ error: 'Unauthorized.' });
      return;
    }

    const provider = (typeof req.body?.provider === 'string' ? req.body.provider : 'openai').toLowerCase();
    if (!VALID_PROVIDERS.has(provider)) {
      res.status(400).json({ error: 'Unsupported provider.' });
      return;
    }

    const parsedApiKey = parseIncomingApiKey(req.body?.apiKey ?? req.body?.api_key);

    if (parsedApiKey.blank) {
      res.status(400).json({ error: 'API key must not be empty.' });
      return;
    }

    const ollamaUrl = typeof req.body?.ollamaUrl === 'string' ? req.body.ollamaUrl.trim() : undefined;

    try {
      if (ollamaUrl) {
        validateOllamaUrl(ollamaUrl);
      }
      const latency = await aiService.testConnection(actorUserId, provider, { apiKey: parsedApiKey.value, ollamaUrl });
      res.json({
        connected: true,
        latency_ms: latency,
        message: 'Connection verified successfully.',
        error: null,
      });
    } catch (error) {
      console.error(`AI test-connection failed for provider ${provider}:`, error);
      const sanitized = sanitizeAiError(error, provider, 'test');
      res.status(sanitized.status).json({
        connected: false,
        latency_ms: null,
        error: sanitized.message,
      });
    }
  });

  router.post('/ai/chat', async (req, res) => {
    const actorUserId = await resolveRequestActorUserId(req);
    if (!actorUserId) {
      res.status(401).json({ error: 'Unauthorized.' });
      return;
    }

    const provider = (typeof req.body?.provider === 'string' ? req.body.provider : 'ollama').toLowerCase();
    if (!VALID_PROVIDERS.has(provider)) {
      res.status(400).json({ error: 'Unsupported provider.' });
      return;
    }

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
      console.error(`AI chat failed for provider ${provider}:`, error);
      const sanitized = sanitizeAiError(error, provider, 'chat');
      res.status(sanitized.status).json({ error: sanitized.message });
    }
  });

  return router;
}