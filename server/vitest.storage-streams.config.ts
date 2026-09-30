import { defineConfig } from 'vitest/config';

// Real Node streams and SDK commands, synthetic configuration, no services.
export default defineConfig({ test: { environment: 'node', include: ['storage-stream-tests/**/*.test.ts'] } });
