process.env.DATABASE_URL = 'pgmem://gravity';
process.env.NODE_ENV = 'test';
process.env.BETTER_AUTH_SECRET = 'test-secret-1234567890';
process.env.BETTER_AUTH_BASE_URL = 'http://localhost:8080';
process.env.CORS_ORIGINS = 'http://localhost:5173';
process.env.TRUSTED_ORIGINS = 'http://localhost:5173,http://localhost:8080';
process.env.OLLAMA_DEFAULT_ENDPOINT = 'http://localhost:11434';

import { afterEach, beforeAll, beforeEach, vi } from 'vitest';
import { initializeDatabase } from '../src/db/bootstrap.js';
import { resetDatabase } from '../tests/helpers/test-helpers.js';

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
