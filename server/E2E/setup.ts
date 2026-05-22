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
