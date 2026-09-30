import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { assertSupportedTestRuntime } from './scripts/test-runtime';

assertSupportedTestRuntime();

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Match the editor runtime when shared server schema imports resolve
    // through a separately installed server dependency tree.
    dedupe: ['prosemirror-model', 'prosemirror-state', 'prosemirror-transform', 'prosemirror-view'],
    alias: {
      '@library': resolve(__dirname, '../library'),
      '@tanstack/react-query': resolve(__dirname, 'src/utils/react-query-mock.tsx'),
      '@tanstack/react-query-devtools': resolve(__dirname, 'src/utils/react-query-devtools-mock.tsx'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: true,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
});
