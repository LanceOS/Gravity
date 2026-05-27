process.env.DATABASE_URL = 'pgmem://gravity';
process.env.NODE_ENV = 'test';
process.env.LOCAL_TESTING_KEK = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
process.env.BETTER_AUTH_SECRET = 'test-secret-1234567890';
process.env.BETTER_AUTH_BASE_URL = 'http://localhost:8080';
process.env.CORS_ORIGINS = 'http://localhost:5173';
process.env.TRUSTED_ORIGINS = 'http://localhost:5173,http://localhost:8080';
process.env.OLLAMA_DEFAULT_ENDPOINT = 'http://localhost:11434';
process.env.ALLOW_ENV_AI_KEYS = 'true';
process.env.ALLOW_DEV_AUTH_BYPASS = 'true';

const { afterEach, beforeAll, beforeEach, vi } = await import('vitest');
const { initializeDatabase } = await import('../src/db/bootstrap.js');
const { resetDatabase } = await import('./helpers/test-helpers.js');

beforeAll(async () => {
  await initializeDatabase();
});

beforeEach(async () => {
  await resetDatabase();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});