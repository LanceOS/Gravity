import { defineConfig } from 'vitest/config';

// No global setup: these tests mock all database, authentication and storage boundaries.
export default defineConfig({ test: { environment: 'node', include: ['note-contract-tests/notes.test.ts'] } });
