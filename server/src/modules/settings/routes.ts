import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { userSettings } from '../../db/schema.js';
import { credentialManager } from '../auth/kms/index.js';
import { getUserSettingsRecord } from '../../lib/platform.js';
import { resolveRequestActorUserId } from '../auth/utils/request-auth.js';
import { validateOllamaUrl } from '../ai/utils/utils.js';
import { aiService } from '../ai/index.js';

const DEFAULT_VIEWS = new Set(['board', 'list']);
const THEMES = new Set(['dark', 'coal-black', 'coffee', 'honey-glow', 'marble-blue']);
const THEME_ALIASES = new Map<string, string>([
  ['light', 'marble-blue'],
  ['system', ''],
  ['noir', 'dark'],
]);
const AI_PROVIDERS = new Set(['openai', 'anthropic', 'gemini', 'deepseek']);
const AGENT_INTEGRATIONS = new Set(['ollama', 'third_party']);
const PROJECT_LAYOUTS = new Set(['standard', 'condensed']);
const KEY_ACTIONS = new Set(['update', 'clear', 'keep']);
const API_KEY_MASK = '••••••••••••';
const SETTINGS_LOAD_ERROR = 'Failed to load account settings.';
const SETTINGS_UPDATE_ERROR = 'Failed to update account settings.';

function hasOwn(body: Record<string, unknown> | null | undefined, field: string) {
  return Boolean(body) && Object.prototype.hasOwnProperty.call(body, field);
}

function getCredentialListSummary(
  credentials: Awaited<ReturnType<typeof credentialManager.ListCredentials>>,
  activeProvider: string,
) {
  return credentials.map((credential) => ({
    provider: credential.provider,
    apiKey: API_KEY_MASK,
    active: credential.provider === activeProvider,
    preferredModel: credential.preferredModel ?? '',
    updatedAt: credential.updatedAt,
  }));
}

function toSettingsResponse(
  settings: Awaited<ReturnType<typeof getUserSettingsRecord>>,
  apiKey: string,
  savedCredentials: Array<{ provider: string; apiKey: string; active: boolean; updatedAt: Date }>,
) {
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
    savedCredentials,
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

function normalizeTheme(rawValue: string): string | undefined {
  const normalized = rawValue.trim().toLowerCase().replace(/_/g, '-').replace(/\s+/g, '-');

  if (normalized === 'system') {
    return undefined;
  }

  const mapped = THEME_ALIASES.get(normalized);
  if (mapped) {
    if (mapped.length === 0) {
      return undefined;
    }
    return mapped;
  }

  if (THEMES.has(normalized)) {
    return normalized;
  }

  const withoutThemeSuffix = normalized.endsWith('-theme') ? normalized.slice(0, -6) : '';
  if (withoutThemeSuffix && THEMES.has(withoutThemeSuffix)) {
    return withoutThemeSuffix;
  }

  return undefined;
}

function getOptionalThemeValue(body: Record<string, unknown> | null | undefined, field: string) {
  if (!body || !(field in body)) {
    return { ok: true as const, value: undefined };
  }

  const value = body[field];
  if (typeof value !== 'string') {
    return { ok: false as const, error: `Invalid ${field}.` };
  }

  const normalized = normalizeTheme(value);
  if (normalized === undefined) {
    return { ok: true as const, value: undefined };
  }
  if (!THEMES.has(normalized)) {
    return { ok: false as const, error: `Invalid ${field}.` };
  }

  return { ok: true as const, value: normalized };
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
      const savedCredentials = await credentialManager.ListCredentials(req.params.userId);

      const currentCredential = savedCredentials.find((credential) => credential.provider === settings.aiProvider);
      const apiKeyPlaceholder = currentCredential ? API_KEY_MASK : '';
      res.json(toSettingsResponse(settings, apiKeyPlaceholder, getCredentialListSummary(savedCredentials, settings.aiProvider)));
    } catch (error) {
      console.error(`Failed to load account settings for user ${req.params.userId}:`, error);
      res.status(500).json({ error: SETTINGS_LOAD_ERROR });
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

      const theme = getOptionalThemeValue(req.body, 'theme');
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
        try {
          validateOllamaUrl(ollamaEndpoint);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Invalid ollamaEndpoint.';
          const safe =
            message === 'Invalid URL format.' || message === 'URL scheme must be http or https.'
              ? message
              : 'Invalid Ollama endpoint.';
          res.status(400).json({ error: safe });
          return;
        }
      }

      const current = await getUserSettingsRecord(userId);

      const credentialProvider = getOptionalEnumValue(req.body, 'credentialProvider', AI_PROVIDERS);
      if (!credentialProvider.ok) {
        res.status(400).json({ error: credentialProvider.error });
        return;
      }

      const activeAiProviderForResponse = (aiProvider.value ?? current.aiProvider).toLowerCase();
      const providerForCredential = (credentialProvider.value ?? activeAiProviderForResponse).toLowerCase();
      const savedCredentialsBefore = await credentialManager.ListCredentials(userId);
      const hasExistingCredentialForActiveProvider = savedCredentialsBefore.some(
        (credential) => credential.provider === activeAiProviderForResponse,
      );
      const hasExistingCredential = hasExistingCredentialForActiveProvider;

      const explicitKeyAction = typeof req.body?.keyAction === 'string' ? req.body.keyAction : undefined;
      const incomingApiKey = typeof req.body?.apiKey === 'string' ? req.body.apiKey.trim() : undefined;
      const apiKeyProvided = hasOwn(req.body, 'apiKey');

      if (!explicitKeyAction || !KEY_ACTIONS.has(explicitKeyAction)) {
        res.status(400).json({ error: 'keyAction is required and must be one of: update, clear, keep.' });
        return;
      }

      const keyAction = explicitKeyAction as 'update' | 'clear' | 'keep';

      if (keyAction === 'update') {
        const rawKey = incomingApiKey ?? '';
        if (!rawKey || rawKey === API_KEY_MASK) {
          res.status(400).json({ error: 'apiKey is required when keyAction is "update".' });
          return;
        }
      } else if (apiKeyProvided) {
        res.status(400).json({ error: `apiKey must be omitted when keyAction is "${keyAction}".` });
        return;
      }

      let preferredModel: string | undefined = undefined;
      if (keyAction === 'update') {
        const rawKey = (incomingApiKey as string).trim();
        try {
          preferredModel = await aiService.fetchAndChooseBestModel(providerForCredential, rawKey);
        } catch (error) {
          console.warn(`Failed to auto-select preferred model for ${providerForCredential}:`, error);
        }
      }

      // Perform all database modifications in a single atomic transaction block
      const { settings: merged, apiKeyPlaceholder } = await db.transaction(async (tx) => {
        let placeholder: string;

        if (keyAction === 'clear') {
          await credentialManager.DeleteCredential(userId, providerForCredential, tx);
          placeholder = '';
        } else if (keyAction === 'update') {
          const rawKey = (incomingApiKey as string).trim();
          await credentialManager.StoreCredential(userId, providerForCredential, rawKey, preferredModel, tx);
          placeholder = API_KEY_MASK;
        } else {
          // 'keep': leave credentials unchanged
          placeholder = hasExistingCredential ? API_KEY_MASK : '';
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

        // Only update the userSettings row — credentials are managed exclusively
        // via userExternalCredentials. The legacy encryptedApiKey column is left untouched.
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
            updatedAt: new Date(),
          })
          .where(eq(userSettings.userId, userId));

        return { settings: nextSettings, apiKeyPlaceholder: placeholder };
      });

      const savedCredentials = await credentialManager.ListCredentials(userId);
      res.json(toSettingsResponse(merged, apiKeyPlaceholder, getCredentialListSummary(savedCredentials, merged.aiProvider)));
    } catch (error) {
      console.error(`Failed to update account settings for user ${userId}:`, error);
      res.status(500).json({ error: SETTINGS_UPDATE_ERROR });
    }
  });

  return router;
}
