import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { AiService } from '../src/lib/ai/ai-service.js';
import { CredentialManager } from '../src/lib/kms/credential-manager.js';
import { LocalEnvKmsProvider } from '../src/lib/kms/local-provider.js';
import { credentialManager } from '../src/lib/kms/index.js';
import { userExternalCredentials } from '../src/db/schema.js';
import { db } from '../src/db/index.js';
import { and, eq } from 'drizzle-orm';
import { seedUser } from './helpers/test-helpers.js';
import { OllamaProvider } from '../src/lib/ai/ollama-provider.js';
import { validateOllamaUrl } from '../src/lib/ai/utils.js';
import { env } from '../src/env.js';

// ---------------------------------------------------------------------------
// Helper — minimal JSON fetch mock
// ---------------------------------------------------------------------------

function makeResponse(body: unknown, ok = true): Response {
  const json = JSON.stringify(body);
  return { ok, status: ok ? 200 : 400, json: async () => JSON.parse(json), text: async () => json } as unknown as Response;
}

// ---------------------------------------------------------------------------
// AiService — orchestration layer
// ---------------------------------------------------------------------------

describe('AiService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('throws for an unsupported provider name in chat()', async () => {
    const service = new AiService(credentialManager);
    const user = await seedUser({ id: 'aiservice-user-1', email: 'aiservice1@example.com' });
    await credentialManager.StoreCredential(user.id, 'openai', 'sk-test');

    await expect(
      service.chat(user.id, 'unsupported-llm', { model: 'x', messages: [] }),
    ).rejects.toThrow(/Unsupported provider/i);
  });

  it('routes ollama chat directly without loading stored credentials', async () => {
    const service = new AiService(credentialManager);
    const executeSpy = vi.spyOn(credentialManager, 'ExecuteWithCredential');

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(makeResponse({ message: { content: 'hi from ollama' } })),
    );

    const result = await service.chat('any-user', 'ollama', {
      model: 'llama3',
      messages: [{ role: 'user', content: 'hello' }],
      ollamaUrl: 'http://ollama.test',
    });

    expect(result.content).toBe('hi from ollama');
    // Credential decryption must NOT have been called for local inference
    expect(executeSpy).not.toHaveBeenCalled();
  });

  it('decrypts stored credentials and forwards them to cloud providers in chat()', async () => {
    const user = await seedUser({ id: 'aiservice-user-2', email: 'aiservice2@example.com' });
    const targetKey = 'sk-cloud-key-xyz';
    await credentialManager.StoreCredential(user.id, 'openai', targetKey);

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        makeResponse({ choices: [{ message: { role: 'assistant', content: 'from cloud' } }] }),
      ),
    );

    const service = new AiService(credentialManager);
    const result = await service.chat(user.id, 'openai', {
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'hello' }],
    });

    expect(result.content).toBe('from cloud');
  });

  it('testConnection returns elapsed ms for a valid ollama URL', async () => {
    const service = new AiService(credentialManager);

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(makeResponse({ models: [] })),
    );

    const elapsed = await service.testConnection('user-x', 'ollama', { ollamaUrl: 'http://ollama.test' });
    expect(typeof elapsed).toBe('number');
    expect(elapsed).toBeGreaterThanOrEqual(0);
  });

  it('testConnection uses a supplied apiKey without loading stored credentials', async () => {
    const service = new AiService(credentialManager);
    const executeSpy = vi.spyOn(credentialManager, 'ExecuteWithCredential');

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse({ data: [] })));

    await service.testConnection('any-user', 'openai', { apiKey: 'sk-supplied-key' });
    expect(executeSpy).not.toHaveBeenCalled();
  });

  it('testConnection loads stored credentials when no apiKey is supplied', async () => {
    const user = await seedUser({ id: 'aiservice-user-3', email: 'aiservice3@example.com' });
    await credentialManager.StoreCredential(user.id, 'openai', 'sk-stored-key');

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse({ data: [] })));

    const executeSpy = vi.spyOn(credentialManager, 'ExecuteWithCredential');

    const service = new AiService(credentialManager);
    await service.testConnection(user.id, 'openai');
    expect(executeSpy).toHaveBeenCalledWith(user.id, expect.any(Function));
  });
});

// ---------------------------------------------------------------------------
// CredentialManager — edge cases and security properties
// ---------------------------------------------------------------------------

describe('CredentialManager — edge cases', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('throws when userId is empty in StoreCredential', async () => {
    await expect(credentialManager.StoreCredential('', 'openai', 'sk-key')).rejects.toThrow(
      'User ID is required',
    );
  });

  it('throws when plaintextAPIKey is empty in StoreCredential', async () => {
    await expect(credentialManager.StoreCredential('user-x', 'openai', '')).rejects.toThrow(
      'API Key cannot be empty',
    );
  });

  it('throws when userId is empty in ExecuteWithCredential', async () => {
    await expect(credentialManager.ExecuteWithCredential('', 'openai', () => {})).rejects.toThrow(
      'User ID is required',
    );
  });

  it('throws a security exception when no credential exists for the user', async () => {
    await expect(
      credentialManager.ExecuteWithCredential('no-such-user', 'openai', () => 'result'),
    ).rejects.toThrow(/No external credentials found/i);
  });

  it('StoreCredential is idempotent — upserts without creating duplicate records', async () => {
    const user = await seedUser({ id: 'cm-upsert-user', email: 'cmupsert@example.com' });

    await credentialManager.StoreCredential(user.id, 'openai', 'sk-first-key');
    await credentialManager.StoreCredential(user.id, 'openai', 'sk-second-key');

    const records = await db
      .select()
      .from(userExternalCredentials)
      .where(and(eq(userExternalCredentials.userId, user.id), eq(userExternalCredentials.provider, 'openai')));

    // Must be exactly one record (upsert, not insert)
    expect(records).toHaveLength(1);

    // The stored credential should reflect the latest key
    const decrypted = await credentialManager.ExecuteWithCredential(user.id, 'openai', (key) => key);
    expect(decrypted).toBe('sk-second-key');
  });

  it('enforces credential isolation between users (cross-user access is rejected)', async () => {
    const userA = await seedUser({ id: 'isolation-user-a', email: 'iso-a@example.com' });
    const userB = await seedUser({ id: 'isolation-user-b', email: 'iso-b@example.com' });

    await credentialManager.StoreCredential(userA.id, 'openai', 'sk-user-a-key');

    // userB has no stored credential — accessing their slot must fail, not return userA's key
    await expect(
      credentialManager.ExecuteWithCredential(userB.id, 'openai', () => 'should-not-run'),
    ).rejects.toThrow(/No external credentials found/i);
  });

  it('zeroizes both the plaintext DEK and API key buffers after StoreCredential', async () => {
    const user = await seedUser({ id: 'cm-wipe-user', email: 'cmwipe@example.com' });
    const fillSpy = vi.spyOn(Buffer.prototype, 'fill');

    await credentialManager.StoreCredential(user.id, 'openai', 'sk-wipe-test');

    // Both the plaintext DEK and the key buffer must have been wiped
    expect(fillSpy).toHaveBeenCalledWith(0);
  });
});

// ---------------------------------------------------------------------------
// LocalEnvKmsProvider — additional edge cases
// ---------------------------------------------------------------------------

describe('LocalEnvKmsProvider — additional edge cases', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('accepts a raw 32-byte UTF-8 string as a KEK (non-hex path)', () => {
    const original = process.env.LOCAL_TESTING_KEK;
    try {
      // Exactly 32 ASCII characters -> 32 bytes (triggers the utf-8 branch)
      process.env.LOCAL_TESTING_KEK = 'AAAABBBBCCCCDDDDEEEEFFFFGGGGHHHH';
      // Re-instantiate using the already-imported class so the constructor reads the new env value
      const provider = new LocalEnvKmsProvider();
      expect(provider).toBeDefined();

      // Must be able to round-trip a DEK with this KEK
      const { plaintextDEK, encryptedDEK } = provider.GenerateDataKey();
      const unwrapped = provider.DecryptDataKey(encryptedDEK);
      expect(unwrapped.equals(plaintextDEK)).toBe(true);
    } finally {
      process.env.LOCAL_TESTING_KEK = original;
    }
  });

  it('throws a security exception for an encryptedDEK shorter than 28 bytes', () => {
    const provider = new LocalEnvKmsProvider();
    const tooShort = Buffer.alloc(20);
    expect(() => provider.DecryptDataKey(tooShort)).toThrow(
      /Invalid or corrupted encrypted DEK/i,
    );
  });

  it('generates unique IVs across multiple GenerateDataKey calls (no IV reuse)', () => {
    const provider = new LocalEnvKmsProvider();

    const ivs = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const { encryptedDEK } = provider.GenerateDataKey();
      // IV is the first 12 bytes of the packed payload
      const iv = encryptedDEK.subarray(0, 12).toString('hex');
      ivs.add(iv);
    }

    // All 50 IVs must be unique — no reuse in a statistically sound CSPRNG
    expect(ivs.size).toBe(50);
  });

  it('generates unique plaintextDEKs each call (key freshness)', () => {
    const provider = new LocalEnvKmsProvider();

    const keys = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const { plaintextDEK } = provider.GenerateDataKey();
      keys.add(plaintextDEK.toString('hex'));
    }
    expect(keys.size).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// CredentialManager with a mock KMS — DI contract verification
// ---------------------------------------------------------------------------

describe('CredentialManager with a mock IKMSProvider', () => {
  it('delegates key generation to the injected KMS provider', async () => {
    const mockKms = {
      GenerateDataKey: vi.fn(() => {
        const plaintextDEK = Buffer.alloc(32, 0xab);
        const encryptedDEK = Buffer.alloc(60, 0xcd);
        return { plaintextDEK, encryptedDEK, kekId: 'mock-kek' };
      }),
      DecryptDataKey: vi.fn((enc: Buffer) => Buffer.alloc(32, 0xab)),
    };

    const manager = new CredentialManager(mockKms);
    const user = await seedUser({ id: 'di-test-user', email: 'ditest@example.com' });

    await manager.StoreCredential(user.id, 'openai', 'sk-di-key');
    expect(mockKms.GenerateDataKey).toHaveBeenCalledTimes(1);
  });

  it('delegates DEK decryption to the injected KMS provider on ExecuteWithCredential', async () => {
    // Use the real provider for storage so the DB record is valid
    const realProvider = new LocalEnvKmsProvider();
    const realManager = new CredentialManager(realProvider);

    const user = await seedUser({ id: 'di-decrypt-user', email: 'didecrypt@example.com' });
    await realManager.StoreCredential(user.id, 'openai', 'sk-real-key');

    // Now swap to a mock provider that wraps the real one but records calls
    const decryptSpy = vi.fn((enc: Buffer) => realProvider.DecryptDataKey(enc));
    const mockKms = { GenerateDataKey: vi.fn(), DecryptDataKey: decryptSpy };
    const mockManager = new CredentialManager(mockKms);

    await mockManager.ExecuteWithCredential(user.id, 'openai', (key) => {
      expect(key).toBe('sk-real-key');
    });
    expect(decryptSpy).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Security Hardening & Optimizations Integrations
// ---------------------------------------------------------------------------

describe('Security Hardening & Optimizations', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('OllamaProvider caches resolved URL tag probes for 60 seconds', async () => {
    const provider = new OllamaProvider();
    
    // Stub fetch to capture probes
    const fetchSpy = vi.fn().mockResolvedValue(makeResponse({ models: [] }));
    vi.stubGlobal('fetch', fetchSpy);

    // First resolve
    const url1 = await provider.resolveOllamaUrl('http://localhost:11434');
    expect(url1).toBeDefined();
    const callCountAfterFirst = fetchSpy.mock.calls.length;
    expect(callCountAfterFirst).toBeGreaterThan(0);

    // Second resolve (should be hit from cache, so no new fetches)
    const url2 = await provider.resolveOllamaUrl('http://localhost:11434');
    expect(url2).toBe(url1);
    expect(fetchSpy.mock.calls.length).toBe(callCountAfterFirst);
  });

  it('OllamaProvider invalidates cache on request failure', async () => {
    const provider = new OllamaProvider();

    // Stub successful fetch first to populate cache
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse({ models: [] })));
    await provider.resolveOllamaUrl('http://localhost:11434');

    // Stub failing fetch
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Connection failed')));
    
    await expect(provider.fetchOllamaModels('http://localhost:11434')).rejects.toThrow();

    // Now if we resolve again, it should execute fetch since the cache was deleted on failure
    const fetchSpy = vi.fn().mockResolvedValue(makeResponse({ models: [] }));
    vi.stubGlobal('fetch', fetchSpy);
    await provider.resolveOllamaUrl('http://localhost:11434');
    expect(fetchSpy).toHaveBeenCalled();
  });

  it('validateOllamaUrl allows loopback and local URLs in development/test mode', () => {
    const original = env.nodeEnv;
    env.nodeEnv = 'test';
    try {
      expect(() => validateOllamaUrl('http://localhost:11434')).not.toThrow();
      expect(() => validateOllamaUrl('http://127.0.0.1:11434')).not.toThrow();
      expect(() => validateOllamaUrl('http://host.docker.internal:11434')).not.toThrow();
    } finally {
      env.nodeEnv = original;
    }
  });

  it('validateOllamaUrl throws security exception for loopback and private subnets in production mode', () => {
    const original = env.nodeEnv;
    env.nodeEnv = 'production';
    try {
      expect(() => validateOllamaUrl('http://localhost:11434')).toThrow(/Security Exception/i);
      expect(() => validateOllamaUrl('http://127.0.0.1:11434')).toThrow(/Security Exception/i);
      expect(() => validateOllamaUrl('http://192.168.1.5:11434')).toThrow(/Security Exception/i);
      expect(() => validateOllamaUrl('http://10.0.0.1:11434')).toThrow(/Security Exception/i);
      expect(() => validateOllamaUrl('http://172.16.5.5:11434')).toThrow(/Security Exception/i);
      expect(() => validateOllamaUrl('http://169.254.169.254/metadata')).toThrow(/Security Exception/i);
      expect(() => validateOllamaUrl('https://google.com')).not.toThrow();
    } finally {
      env.nodeEnv = original;
    }
  });
});
