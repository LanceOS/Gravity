import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { userSettings, userExternalCredentials } from '../db/schema.js';
import { decryptSecret, encryptSecret } from '../lib/crypto.js';
import { credentialManager } from '../lib/kms/index.js';
import { getUserSettingsRecord } from '../lib/platform.js';
import { resolveRequestActorUserId } from '../lib/request-auth.js';
import { validateOllamaUrl } from '../lib/ai/utils.js';

const DEFAULT_VIEWS = new Set(['board', 'list']);
const THEMES = new Set(['dark', 'light', 'coal-black', 'coffee', 'marble-blue']);
const AI_PROVIDERS = new Set(['openai', 'anthropic', 'gemini', 'deepseek']);
const AGENT_INTEGRATIONS = new Set(['ollama', 'third_party']);
const PROJECT_LAYOUTS = new Set(['standard', 'condensed']);

function toSettingsResponse(settings: Awaited<ReturnType<typeof getUserSettingsRecord>>, apiKey: string) {
  return {
    userId: settings.userId,
    defaultView: settings.defaultView,
    ollamaModel: settings.preferredOllamaModel ?? '',
    ollamaEndpoint: settings.ollamaEndpoint,
    theme: settings.theme,
    apiKey,
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
      const [record] = await db
        .select({ userId: userExternalCredentials.userId })
        .from(userExternalCredentials)
        .where(eq(userExternalCredentials.userId, req.params.userId))
        .limit(1);

      const apiKeyPlaceholder = record ? '••••••••••••' : '';
      res.json(toSettingsResponse(settings, apiKeyPlaceholder));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load settings.';
      const sanitized = message.includes('Security Exception') ? 'External credentials configuration error.' : message;
      res.status(500).json({ error: sanitized });
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

      const ollamaEndpoint = typeof req.body?.ollamaEndpoint === 'string' ? req.body.ollamaEndpoint : undefined;
      if (ollamaEndpoint) {
        validateOllamaUrl(ollamaEndpoint);
      }

      const current = await getUserSettingsRecord(userId);
      
      let apiKeyPlaceholder = '';

      // Hoist check to run exactly once and determine if a key exists
      const [existingCredential] = await db
        .select({ userId: userExternalCredentials.userId })
        .from(userExternalCredentials)
        .where(eq(userExternalCredentials.userId, userId))
        .limit(1);

      const hasExistingCredential = Boolean(existingCredential);

      // Perform all database modifications in a single atomic transaction block
      const merged = await db.transaction(async (tx) => {
        if (typeof req.body?.apiKey === 'string') {
          const trimmed = req.body.apiKey.trim();
          if (trimmed === '') {
            await tx.delete(userExternalCredentials).where(eq(userExternalCredentials.userId, userId));
            apiKeyPlaceholder = '';
          } else if (trimmed === '••••••••••••') {
            apiKeyPlaceholder = hasExistingCredential ? '••••••••••••' : '';
          } else {
            await credentialManager.StoreCredential(userId, trimmed, tx);
            apiKeyPlaceholder = '••••••••••••';
          }
        } else {
          apiKeyPlaceholder = hasExistingCredential ? '••••••••••••' : '';
        }

        const nextSettings = {
          ...current,
          defaultView: defaultView.value ?? current.defaultView,
          preferredOllamaModel:
            typeof req.body?.ollamaModel === 'string' ? req.body.ollamaModel : current.preferredOllamaModel,
          ollamaEndpoint: ollamaEndpoint ?? current.ollamaEndpoint,
          theme: theme.value ?? current.theme,
          aiProvider: aiProvider.value ?? current.aiProvider,
          agentIntegration: agentIntegration.value ?? current.agentIntegration,
          projectLayout: projectLayout.value ?? current.projectLayout,
        };

        await tx
          .update(userSettings)
          .set({
            defaultView: nextSettings.defaultView,
            preferredOllamaModel: nextSettings.preferredOllamaModel,
            ollamaEndpoint: nextSettings.ollamaEndpoint,
            theme: nextSettings.theme,
            aiProvider: nextSettings.aiProvider,
            agentIntegration: nextSettings.agentIntegration,
            projectLayout: nextSettings.projectLayout,
            encryptedApiKey: null,
            updatedAt: new Date(),
          })
          .where(eq(userSettings.userId, userId));

        return nextSettings;
      });

      res.json(toSettingsResponse(merged, apiKeyPlaceholder));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update settings.';
      const sanitized = message.includes('Security Exception') ? 'External credentials configuration error.' : message;
      res.status(500).json({ error: sanitized });
    }
  });

  return router;
}