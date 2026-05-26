import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { randomBytes } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '../src/db/index.js';
import { userExternalCredentials } from '../src/db/schema.js';
import { LocalEnvKmsProvider } from '../src/lib/kms/local-provider.js';
import { CredentialManager } from '../src/lib/kms/credential-manager.js';
import { credentialManager } from '../src/lib/kms/index.js';
import { api, createAuthenticatedApi, seedUser } from './helpers/test-helpers.js';

describe('Envelope Encryption & Secure Credential Storage', () => {
  describe('LocalEnvKmsProvider', () => {
    it('initializes successfully with a valid 32-byte (256-bit) hex key', () => {
      const originalKek = process.env.LOCAL_TESTING_KEK;
      try {
        process.env.LOCAL_TESTING_KEK = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
        const provider = new LocalEnvKmsProvider();
        expect(provider).toBeDefined();
      } finally {
        process.env.LOCAL_TESTING_KEK = originalKek;
      }
    });

    it('throws a fatal error if LOCAL_TESTING_KEK is missing', () => {
      const originalKek = process.env.LOCAL_TESTING_KEK;
      try {
        delete process.env.LOCAL_TESTING_KEK;
        expect(() => new LocalEnvKmsProvider()).toThrow(/LOCAL_TESTING_KEK is missing/);
      } finally {
        process.env.LOCAL_TESTING_KEK = originalKek;
      }
    });

    it('throws a fatal error if LOCAL_TESTING_KEK is not exactly 32 bytes', () => {
      const originalKek = process.env.LOCAL_TESTING_KEK;
      try {
        process.env.LOCAL_TESTING_KEK = 'too-short-key';
        expect(() => new LocalEnvKmsProvider()).toThrow(/must be exactly 32 bytes/);
      } finally {
        process.env.LOCAL_TESTING_KEK = originalKek;
      }
    });

    it('successfully generates and decrypts (unwraps) data encryption keys (DEK)', () => {
      const provider = new LocalEnvKmsProvider();
      const { plaintextDEK, encryptedDEK, kekId } = provider.GenerateDataKey();

      expect(plaintextDEK.length).toBe(32);
      expect(encryptedDEK.length).toBe(12 + 16 + 32); // IV (12) + Tag (16) + Ciphertext (32)
      expect(kekId).toBe('local-env-mock');

      const unwrappedDEK = provider.DecryptDataKey(encryptedDEK);
      expect(unwrappedDEK.equals(plaintextDEK)).toBe(true);
    });

    it('throws a security exception when trying to decrypt a tampered DEK', () => {
      const provider = new LocalEnvKmsProvider();
      const { encryptedDEK } = provider.GenerateDataKey();

      // Tamper with the ciphertext component (bytes 28 to end)
      const tampered = Buffer.from(encryptedDEK);
      tampered[30] ^= 0xff;

      expect(() => provider.DecryptDataKey(tampered)).toThrow(/Failed to decrypt Data Encryption Key/);
    });
  });

  describe('CredentialManager', () => {
    it('stores a credential securely using envelope encryption', async () => {
      const user = await seedUser({ id: 'test-secure-user-1', email: 'sec1@example.com' });
      const testApiKey = 'sk-proj-super-secret-key-123456';

      await credentialManager.StoreCredential(user.id, 'openai', testApiKey);

      // Verify the record was inserted into the database and no plaintext was stored
      const records = await db
        .select()
        .from(userExternalCredentials)
        .where(and(eq(userExternalCredentials.userId, user.id), eq(userExternalCredentials.provider, 'openai')));

      expect(records.length).toBe(1);
      const record = records[0];

      expect(record.userId).toBe(user.id);
      expect(record.kmsKekId).toBe('local-env-mock');
      expect(record.encryptedApiKey.toString('utf8')).not.toContain(testApiKey);
      expect(record.encryptedDek.length).toBe(12 + 16 + 32);
      expect(record.aesIv.length).toBe(12);
      expect(record.aesAuthTag.length).toBe(16);
    });

    it('executes callbacks with the decrypted API key and cleans up memory', async () => {
      const user = await seedUser({ id: 'test-secure-user-2', email: 'sec2@example.com' });
      const testApiKey = 'sk-proj-another-secret-999';

      await credentialManager.StoreCredential(user.id, 'openai', testApiKey);

      // We spy on fill to ensure wiping is called on plaintext secrets
      const fillSpy = vi.spyOn(Buffer.prototype, 'fill');

      const result = await credentialManager.ExecuteWithCredential(user.id, 'openai', (apiKey) => {
        expect(apiKey).toBe(testApiKey);
        return 'callback-success-value';
      });

      expect(result).toBe('callback-success-value');

      // Verify that Buffer.fill(0) was indeed executed to zero out memory
      expect(fillSpy).toHaveBeenCalledWith(0);
      fillSpy.mockRestore();
    });

    it('throws a security exception if credential ciphertext is tampered with', async () => {
      const user = await seedUser({ id: 'test-secure-user-3', email: 'sec3@example.com' });
      const testApiKey = 'sk-tamper-proof';

      await credentialManager.StoreCredential(user.id, 'openai', testApiKey);

      // Tamper with the database stored initialization vector (aesIv)
      const [record] = await db
        .select()
        .from(userExternalCredentials)
        .where(and(eq(userExternalCredentials.userId, user.id), eq(userExternalCredentials.provider, 'openai')));

      const tamperedIv = Buffer.from(record.aesIv);
      tamperedIv[0] ^= 0x01; // flip a bit

      await db
        .update(userExternalCredentials)
        .set({ aesIv: tamperedIv })
        .where(and(eq(userExternalCredentials.userId, user.id), eq(userExternalCredentials.provider, 'openai')));

      // Attempting to execute with credential should throw due to integrity/GCM verification failure
      await expect(
        credentialManager.ExecuteWithCredential(user.id, 'openai', () => {})
      ).rejects.toThrow(/Failed to decrypt credentials. Integrity check failed/);
    });
  });

  describe('Integration: Settings Routes with Envelope Encryption', () => {
    beforeEach(() => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: [{ id: 'gpt-4o-mini' }] }),
        text: async () => JSON.stringify({ data: [{ id: 'gpt-4o-mini' }] }),
      }));
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('GET /api/v1/settings/:userId returns an empty apiKey if no credential is set', async () => {
      const userApi = await createAuthenticatedApi({ email: 'int1@example.com' });
      const user = userApi.user;

      const response = await userApi.get(`/api/v1/settings/${user.id}`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        userId: user.id,
        apiKey: '',
        savedCredentials: [],
      });
    });

    it('PATCH /api/v1/settings/:userId stores and GET returns the envelope encrypted apiKey', async () => {
      const userApi = await createAuthenticatedApi({ email: 'int2@example.com' });
      const user = userApi.user;
      const targetApiKey = 'sk-integration-test-key-555';

      // 1. PATCH setting with apiKey using the explicit keyAction: 'update'
      const patchResponse = await userApi
        .patch(`/api/v1/settings/${user.id}`)
        .send({
          keyAction: 'update',
          apiKey: targetApiKey,
          theme: 'coal-black',
        });

      expect(patchResponse.status).toBe(200);
      expect(patchResponse.body).toMatchObject({
        userId: user.id,
        apiKey: '••••••••••••',
        theme: 'coal-black',
      });

      expect(patchResponse.body.savedCredentials).toEqual([
        expect.objectContaining({
          provider: 'openai',
          apiKey: '••••••••••••',
          active: true,
        }),
      ]);

      // Verify it exists in user_external_credentials
      const externalRecords = await db
        .select()
        .from(userExternalCredentials)
        .where(and(eq(userExternalCredentials.userId, user.id), eq(userExternalCredentials.provider, 'openai')));
      expect(externalRecords.length).toBe(1);

      // 2. GET setting should return placeholder seamlessly
      const getResponse = await userApi.get(`/api/v1/settings/${user.id}`);

      expect(getResponse.status).toBe(200);
      expect(getResponse.body).toMatchObject({
        userId: user.id,
        apiKey: '••••••••••••',
        theme: 'coal-black',
        savedCredentials: [
          expect.objectContaining({
            provider: 'openai',
            apiKey: '••••••••••••',
            active: true,
          }),
        ],
      });
    });

    it('PATCH /api/v1/settings/:userId clears credentials when keyAction is clear', async () => {
      const userApi = await createAuthenticatedApi({ email: 'int3@example.com' });
      const user = userApi.user;

      // First store a credential
      await credentialManager.StoreCredential(user.id, 'openai', 'sk-temp-key');

      // Clear the credential via settings PATCH using the explicit keyAction: 'clear'
      const clearResponse = await userApi
        .patch(`/api/v1/settings/${user.id}`)
        .send({
          keyAction: 'clear',
        });

      expect(clearResponse.status).toBe(200);
      expect(clearResponse.body.apiKey).toBe('');
      expect(clearResponse.body.savedCredentials).toEqual([]);

      // Verify the credential record is deleted from user_external_credentials
      const externalRecords = await db
        .select()
        .from(userExternalCredentials)
        .where(and(eq(userExternalCredentials.userId, user.id), eq(userExternalCredentials.provider, 'openai')));
      expect(externalRecords.length).toBe(0);
    });

    it('PATCH /api/v1/settings/:userId fetches and stores the most cost effective MCP model', async () => {
      const userApi = await createAuthenticatedApi({ email: 'int4@example.com' });
      const user = userApi.user;
      const targetApiKey = 'sk-mcp-cost-test-key';

      // 1. Stub fetch to return multiple models, including gpt-4o-mini and gpt-4o
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            { id: 'gpt-4o' },
            { id: 'gpt-4o-mini' },
            { id: 'some-other-model' }
          ]
        }),
      }));

      // 2. PATCH setting with apiKey using keyAction: 'update'
      const patchResponse = await userApi
        .patch(`/api/v1/settings/${user.id}`)
        .send({
          keyAction: 'update',
          apiKey: targetApiKey,
          aiProvider: 'openai',
        });

      expect(patchResponse.status).toBe(200);

      // 3. Verify in user_external_credentials that preferredModel is saved as the most cost-effective one (gpt-4o-mini)
      const externalRecords = await db
        .select()
        .from(userExternalCredentials)
        .where(and(eq(userExternalCredentials.userId, user.id), eq(userExternalCredentials.provider, 'openai')));
      expect(externalRecords.length).toBe(1);
      expect(externalRecords[0].preferredModel).toBe('gpt-4o-mini');

      // 4. Verify savedCredentials list has the preferredModel
      expect(patchResponse.body.savedCredentials).toEqual([
        expect.objectContaining({
          provider: 'openai',
          apiKey: '••••••••••••',
          active: true,
          preferredModel: 'gpt-4o-mini',
        }),
      ]);
    });
  });
});
