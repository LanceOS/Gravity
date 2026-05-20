import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { userSettings } from '../db/schema.js';
import { decryptSecret, encryptSecret } from '../lib/crypto.js';
import { getUserSettingsRecord } from '../lib/platform.js';

export function createSettingsRouter() {
  const router = Router();

  router.get('/settings/:userId', async (req, res) => {
    try {
      const settings = await getUserSettingsRecord(req.params.userId);
      res.json({
        userId: settings.userId,
        defaultView: settings.defaultView,
        ollamaModel: settings.preferredOllamaModel ?? '',
        ollamaEndpoint: settings.ollamaEndpoint,
        theme: settings.theme,
        apiKey: decryptSecret(settings.encryptedApiKey),
        aiProvider: settings.aiProvider,
        projectLayout: settings.projectLayout,
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load settings.' });
    }
  });

  router.patch('/settings/:userId', async (req, res) => {
    const { userId } = req.params;

    try {
      const current = await getUserSettingsRecord(userId);
      const merged = {
        ...current,
        defaultView: typeof req.body?.defaultView === 'string' ? req.body.defaultView : current.defaultView,
        preferredOllamaModel:
          typeof req.body?.ollamaModel === 'string' ? req.body.ollamaModel : current.preferredOllamaModel,
        ollamaEndpoint:
          typeof req.body?.ollamaEndpoint === 'string' ? req.body.ollamaEndpoint : current.ollamaEndpoint,
        theme: typeof req.body?.theme === 'string' ? req.body.theme : current.theme,
        aiProvider: typeof req.body?.aiProvider === 'string' ? req.body.aiProvider : current.aiProvider,
        projectLayout:
          typeof req.body?.projectLayout === 'string' ? req.body.projectLayout : current.projectLayout,
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
          projectLayout: merged.projectLayout,
          encryptedApiKey: merged.encryptedApiKey,
          updatedAt: new Date(),
        })
        .where(eq(userSettings.userId, userId));

      res.json({
        userId,
        defaultView: merged.defaultView,
        ollamaModel: merged.preferredOllamaModel ?? '',
        ollamaEndpoint: merged.ollamaEndpoint,
        theme: merged.theme,
        apiKey: decryptSecret(merged.encryptedApiKey),
        aiProvider: merged.aiProvider,
        projectLayout: merged.projectLayout,
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to update settings.' });
    }
  });

  return router;
}