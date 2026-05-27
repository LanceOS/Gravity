import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['E2E/**/*.test.ts'],
    setupFiles: ['./E2E/setup.ts'],
    env: {
      DATABASE_URL: 'pgmem://gravity',
      NODE_ENV: 'test',
      BETTER_AUTH_SECRET: 'test-secret-1234567890',
      BETTER_AUTH_BASE_URL: 'http://localhost:8080',
      CORS_ORIGINS: 'http://localhost:5173',
      TRUSTED_ORIGINS: 'http://localhost:5173,http://localhost:8080',
      OLLAMA_DEFAULT_ENDPOINT: 'http://localhost:11434',
      ALLOW_DEV_AUTH_BYPASS: 'true',
    },
  },
});
