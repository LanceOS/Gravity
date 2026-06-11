import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { existsSync } from 'fs';

const resolvePkgDir = (name: string) => {
  const localPath = resolve(__dirname, './node_modules', name)
  if (existsSync(localPath)) {
    return localPath
  }
  const hoistedPath = resolve(__dirname, '../node_modules', name)
  if (existsSync(hoistedPath)) {
    return hoistedPath
  }
  return localPath
}

export default defineConfig({
  plugins: [react()],
  resolve: {
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