import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createKmsProvider } from '../src/modules/auth/kms/provider.js';
import { credentialManager } from '../src/modules/auth/kms/index.js';
import { CredentialManager } from '../src/modules/auth/kms/credential-manager.js';
import { CredentialsUnavailableError } from '../src/modules/auth/kms/availability.js';
import { createSettingsRouter } from '../src/modules/settings/routes.js';
import { createAiRouter } from '../src/modules/ai/routes.js';
import { AiService } from '../src/modules/ai/services/ai-service.js';
import { aiService } from '../src/modules/ai/index.js';

// Import the actual production provider selection, with an isolated synthetic
// persistence adapter. No shared test setup, .env files, external services or live data.
const state = vi.hoisted(() => ({ record: undefined as any, settings: {
  userId: 'kms-production-user', aiProvider: 'openai', defaultView: 'board', theme: 'dark', projectLayout: 'standard',
} }));
vi.mock('../src/env.js', () => ({ env: { nodeEnv: 'production', encryptedCredentialsMode: 'disabled' } }));
vi.mock('../src/lib/platform.js', () => ({ getUserSettingsRecord: async () => state.settings }));
vi.mock('../src/db/index.js', () => {
  const db = {
    insert: () => ({ values: (value: any) => ({ onConflictDoUpdate: async () => { state.record = value; } }) }),
    select: () => ({ from: () => ({ where: () => ({
      limit: async () => state.record ? [state.record] : [],
      orderBy: async () => state.record ? [state.record] : [],
    }) }) }),
    delete: () => ({ where: async () => { state.record = undefined; } }),
    update: () => ({ set: (value: any) => ({ where: async () => { Object.assign(state.settings, value); } }) }),
    transaction: async (fn: (tx: any) => Promise<any>): Promise<any> => fn(db),
  };
  return { db };
});
vi.mock('../src/modules/auth/utils/request-auth.js', () => ({
  resolveRequestActorUserId: async () => 'kms-production-user',
}));

const app = express();
app.use(express.json(), createSettingsRouter(), createAiRouter());
beforeEach(() => {
  state.record = undefined;
  state.settings.defaultView = 'board';
  vi.stubEnv('LOCAL_TESTING_KEK', '12'.repeat(32));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

async function seedCredential() {
  const local = new CredentialManager(createKmsProvider('test', 'required'));
  await local.StoreCredential('kms-production-user', 'openai', 'synthetic-api-key');
  return local;
}

describe('production without a supported KMS', () => {
  it('never falls back to the local key, even when that key exists', () => {
    expect(process.env.LOCAL_TESTING_KEK).toBeTruthy();
    const provider = createKmsProvider('production', 'disabled');
    expect(() => provider.GenerateDataKey()).toThrow(CredentialsUnavailableError);
    expect(() => provider.DecryptDataKey(Buffer.alloc(60))).toThrow(CredentialsUnavailableError);
    expect(() => createKmsProvider('production', 'required')).toThrow(/no production KMS/);
  });

  it('rejects credential writes and reads while preserving recoverable ciphertext', async () => {
    const local = await seedCredential();
    const callback = vi.fn();
    await expect(credentialManager.StoreCredential('kms-production-user', 'openai', 'replacement')).rejects.toThrow(CredentialsUnavailableError);
    await expect(credentialManager.ExecuteWithCredential('kms-production-user', 'openai', callback)).rejects.toThrow(CredentialsUnavailableError);
    expect(callback).not.toHaveBeenCalled();
    expect(await local.ExecuteWithCredential('kms-production-user', 'openai', key => key)).toBe('synthetic-api-key');
  });

  it('surfaces the disabled state and rejects saves before provider discovery', async () => {
    await seedCredential();
    const fetchModels = vi.spyOn(aiService, 'fetchAndChooseBestModel');
    const response = await request(app).get('/settings/kms-production-user');
    expect(response.status).toBe(200);
    expect(response.body.encryptedCredentialsAvailable).toBe(false);
    expect(response.body.savedCredentials).toHaveLength(1);
    expect(JSON.stringify(response.body)).not.toContain('synthetic-api-key');
    expect(response.body.savedCredentials[0]).not.toHaveProperty('encryptedDek');
    const write = await request(app).patch('/settings/kms-production-user').send({ keyAction: 'update', apiKey: 'synthetic-replacement' });
    expect(write.status).toBe(503);
    expect(write.body.code).toBe('ENCRYPTED_CREDENTIALS_DISABLED');
    expect(JSON.stringify(write.body)).not.toContain('synthetic-replacement');
    expect(fetchModels).not.toHaveBeenCalled();
    const keep = await request(app).patch('/settings/kms-production-user').send({ keyAction: 'keep', defaultView: 'list' });
    expect(keep.status).toBe(200);
    expect(keep.body.defaultView).toBe('list');
    expect(keep.body.encryptedCredentialsAvailable).toBe(false);
    expect(keep.body.savedCredentials).toHaveLength(1);
    const clear = await request(app).patch('/settings/kms-production-user').send({ keyAction: 'clear' });
    expect(clear.status).toBe(200);
    expect(clear.body.savedCredentials).toEqual([]);
  });

  it('guards model discovery before cached or uncached results can be used', async () => {
    const manager = new CredentialManager(createKmsProvider('test', 'required'));
    const provider = { fetchModels: vi.fn().mockResolvedValue(['gpt-4o-mini']), chat: vi.fn(), testConnection: vi.fn() };
    const service = new AiService(manager, { openai: provider });
    await service.fetchAndChooseBestModel('openai', 'synthetic-key');
    expect(provider.fetchModels).toHaveBeenCalledTimes(1);
    vi.spyOn(manager, 'assertAvailable').mockImplementation(() => { throw new CredentialsUnavailableError(); });
    await expect(service.fetchAndChooseBestModel('openai', 'synthetic-key')).rejects.toThrow(CredentialsUnavailableError);
    await expect(service.fetchAndChooseBestModel('openai', 'other-key')).rejects.toThrow(CredentialsUnavailableError);
    expect(provider.fetchModels).toHaveBeenCalledTimes(1);
    await expect(aiService.fetchAndChooseBestModel('openai', 'synthetic-key')).rejects.toThrow(CredentialsUnavailableError);
  });

  it('rejects cloud AI, including supplied test keys, without network calls', async () => {
    await seedCredential();
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    for (const path of ['/ai/test-key', '/ai/test-connection']) {
      for (const apiKey of [undefined, 'synthetic-unsaved-key']) {
        const response = await request(app).post(path).send({ provider: 'openai', apiKey });
        expect(response.status).toBe(503);
        expect(response.body.error).toContain('disabled on this server');
      }
    }
    const chat = await request(app).post('/ai/chat').send({ provider: 'openai', model: 'test', messages: [{ role: 'user', content: 'hello' }] });
    expect(chat.status).toBe(503);
    expect(chat.body.error).toContain('disabled on this server');
    expect(fetch).not.toHaveBeenCalled();
  });
});
