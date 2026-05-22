import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@library': resolve(__dirname, '../../library'),
      react: resolve(__dirname, '../node_modules/react'),
      'react-dom': resolve(__dirname, '../node_modules/react-dom'),
      'lucide-react': resolve(__dirname, '../node_modules/lucide-react'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: [resolve(__dirname, './setup.ts')],
    css: true,
    include: [resolve(__dirname, './**/*.test.{ts,tsx}')],
  },
});
