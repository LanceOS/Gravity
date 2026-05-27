import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@library': resolve(__dirname, '../library'),
      react: resolve(__dirname, './node_modules/react'),
      'react-dom': resolve(__dirname, './node_modules/react-dom'),
      'lucide-react': resolve(__dirname, './node_modules/lucide-react'),
      '@tiptap/react/menus': resolve(__dirname, './node_modules/@tiptap/react/dist/menus/index.js'),
      '@tiptap/react': resolve(__dirname, './node_modules/@tiptap/react'),
      '@tiptap/pm': resolve(__dirname, './node_modules/@tiptap/pm'),
      '@tiptap/starter-kit': resolve(__dirname, './node_modules/@tiptap/starter-kit'),
      '@tiptap/extension-placeholder': resolve(__dirname, './node_modules/@tiptap/extension-placeholder'),
      '@tiptap/extension-bubble-menu': resolve(__dirname, './node_modules/@tiptap/extension-bubble-menu'),
      '@tiptap/core': resolve(__dirname, './node_modules/@tiptap/core'),
      'tiptap-markdown': resolve(__dirname, './node_modules/tiptap-markdown'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: true,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
});