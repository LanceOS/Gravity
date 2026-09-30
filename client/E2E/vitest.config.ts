import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { assertSupportedTestRuntime } from '../scripts/test-runtime';

assertSupportedTestRuntime();

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: '@library', replacement: resolve(__dirname, '../../library') },
    ],
  },
  test: {
    environment: 'jsdom',
    setupFiles: [resolve(__dirname, './setup.ts')],
    css: true,
    testTimeout: 30000,
    include: [resolve(__dirname, './**/*.test.{ts,tsx}')],
  },
});
