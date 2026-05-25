import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { userSettings } from '../db/schema.js';
import { decryptSecret, encryptSecret } from '../lib/crypto.js';
import { getUserSettingsRecord } from '../lib/platform.js';
import { resolveRequestActorUserId } from '../lib/request-auth.js';

const DEFAULT_VIEWS = new Set(['board', 'list']);
const THEMES = new Set(['dark', 'light', 'coal-black', 'coffee']);
const AI_PROVIDERS = new Set(['openai', 'anthropic', 'gemini', 'deepseek']);
const AGENT_INTEGRATIONS = new Set(['ollama', 'third_party']);
const PROJECT_LAYOUTS = new Set(['standard', 'condensed']);

function toSettingsResponse(settings: Awaited<ReturnType<typeof getUserSettingsRecord>>) {
  return {
    userId: settings.userId,
    defaultView: settings.defaultView,
    ollamaModel: settings.preferredOllamaModel ?? '',
    ollamaEndpoint: settings.ollamaEndpoint,
    theme: settings.theme,
    apiKey: decryptSecret(settings.encryptedApiKey),
    aiProvider: settings.aiProvider,
    agentIntegration: settings.agentIntegration,
    projectLayout: settings.projectLayout,
  };
}

function getOptionalEnumValue(
  body: Record<string, unknown> | null | undefined,
  field: string,
  allowedValues: Set<string>,
) {
  if (!body || !(field in body)) {
    return { ok: true as const, value: undefined };
  }

  const value = body[field];
  if (typeof value !== 'string' || !allowedValues.has(value)) {
    return { ok: false as const, error: `Invalid ${field}.` };
  }

  return { ok: true as const, value };
}

export function createSettingsRouter() {
  const router = Router();

  router.get('/settings/:userId', async (req, res) => {
    const actorUserId = await resolveRequestActorUserId(req);
    if (!actorUserId) {
      res.status(401).json({ error: 'Unauthorized.' });
      return;
    }

    if (actorUserId !== req.params.userId) {
      res.status(403).json({ error: 'Forbidden.' });
      return;
    }

    try {
      const settings = await getUserSettingsRecord(req.params.userId);
      res.json(toSettingsResponse(settings));
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load settings.' });
    }
  });

  router.patch('/settings/:userId', async (req, res) => {
    const { userId } = req.params;
    const actorUserId = await resolveRequestActorUserId(req);
    if (!actorUserId) {
      res.status(401).json({ error: 'Unauthorized.' });
      return;
    }

    if (actorUserId !== userId) {
      res.status(403).json({ error: 'Forbidden.' });
      return;
    }

    try {
      const defaultView = getOptionalEnumValue(req.body, 'defaultView', DEFAULT_VIEWS);
      if (!defaultView.ok) {
        res.status(400).json({ error: defaultView.error });
        return;
      }

      const theme = getOptionalEnumValue(req.body, 'theme', THEMES);
      if (!theme.ok) {
        res.status(400).json({ error: theme.error });
        return;
      }

      const aiProvider = getOptionalEnumValue(req.body, 'aiProvider', AI_PROVIDERS);
      if (!aiProvider.ok) {
        res.status(400).json({ error: aiProvider.error });
        return;
      }

      const projectLayout = getOptionalEnumValue(req.body, 'projectLayout', PROJECT_LAYOUTS);
      if (!projectLayout.ok) {
        res.status(400).json({ error: projectLayout.error });
        return;
      }

      const agentIntegration = getOptionalEnumValue(req.body, 'agentIntegration', AGENT_INTEGRATIONS);
      if (!agentIntegration.ok) {
        res.status(400).json({ error: agentIntegration.error });
        return;
      }

      const current = await getUserSettingsRecord(userId);
      const merged = {
        ...current,
        defaultView: defaultView.value ?? current.defaultView,
        preferredOllamaModel:
          typeof req.body?.ollamaModel === 'string' ? req.body.ollamaModel : current.preferredOllamaModel,
        ollamaEndpoint:
          typeof req.body?.ollamaEndpoint === 'string' ? req.body.ollamaEndpoint : current.ollamaEndpoint,
        theme: theme.value ?? current.theme,
        aiProvider: aiProvider.value ?? current.aiProvider,
        agentIntegration: agentIntegration.value ?? current.agentIntegration,
        projectLayout: projectLayout.value ?? current.projectLayout,
        encryptedApiKey:
          typeof req.body?.apiKey === 'string'
            ? encryptSecret(req.body.apiKey.trim())
            : current.encryptedApiKey,
      };

      await db
        .update(userSettings)
        .set({
          defaultView: merged.defaultView,
          preferredOllamaModel: merged.preferredOllamaModel,
          ollamaEndpoint: merged.ollamaEndpoint,
          theme: merged.theme,
          aiProvider: merged.aiProvider,
          agentIntegration: merged.agentIntegration,
          projectLayout: merged.projectLayout,
          encryptedApiKey: merged.encryptedApiKey,
          updatedAt: new Date(),
        })
        .where(eq(userSettings.userId, userId));

      res.json(toSettingsResponse(merged));
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to update settings.' });
    }
  });

  return router;
}