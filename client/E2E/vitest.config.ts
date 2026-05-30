import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: '@library', replacement: resolve(__dirname, '../../library') },
      { find: 'react', replacement: resolve(__dirname, '../node_modules/react') },
      { find: 'react-dom', replacement: resolve(__dirname, '../node_modules/react-dom') },
      { find: 'lucide-react', replacement: resolve(__dirname, '../node_modules/lucide-react') },
      { find: /^@tiptap\/react\/menus$/, replacement: resolve(__dirname, '../node_modules/@tiptap/react/dist/menus/index.js') },
      { find: '@tiptap/react', replacement: resolve(__dirname, '../node_modules/@tiptap/react/dist/index.js') },
      { find: '@tiptap/starter-kit', replacement: resolve(__dirname, '../node_modules/@tiptap/starter-kit/dist/index.js') },
      { find: '@tiptap/extension-placeholder', replacement: resolve(__dirname, '../node_modules/@tiptap/extension-placeholder/dist/index.js') },
      { find: '@tiptap/extension-bubble-menu', replacement: resolve(__dirname, '../node_modules/@tiptap/extension-bubble-menu/dist/index.js') },
      { find: '@tiptap/core', replacement: resolve(__dirname, '../node_modules/@tiptap/core/dist/index.js') },
      { find: '@tiptap/pm', replacement: resolve(__dirname, '../node_modules/@tiptap/pm/dist/index.js') },
      { find: 'tiptap-markdown', replacement: resolve(__dirname, '../node_modules/tiptap-markdown/dist/tiptap-markdown.es.js') },
    ],
  },
  test: {
    environment: 'jsdom',
    setupFiles: [resolve(__dirname, './setup.ts')],
    css: true,
    include: [resolve(__dirname, './**/*.test.{ts,tsx}')],
  },
});
