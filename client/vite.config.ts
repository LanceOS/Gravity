import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const backendUpstream = env.BACKEND_UPSTREAM || env.VITE_API_PROXY_TARGET || 'http://localhost:8080'

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@library': resolve(__dirname, '../library'),
        'react': resolve(__dirname, './node_modules/react'),
        'react-dom': resolve(__dirname, './node_modules/react-dom'),
        'lucide-react': resolve(__dirname, './node_modules/lucide-react'),
        '@tiptap/react/menus': resolve(__dirname, './node_modules/@tiptap/react/dist/menus/index.js'),
        '@tiptap/react': resolve(__dirname, './node_modules/@tiptap/react'),
        '@tiptap/pm': resolve(__dirname, './node_modules/@tiptap/pm'),
        '@tiptap/starter-kit': resolve(__dirname, './node_modules/@tiptap/starter-kit'),
        '@tiptap/extension-placeholder': resolve(__dirname, './node_modules/@tiptap/extension-placeholder'),
        '@tiptap/extension-bubble-menu': resolve(__dirname, './node_modules/@tiptap/extension-bubble-menu'),
        'tiptap-markdown': resolve(__dirname, './node_modules/tiptap-markdown'),
      },
    },
    server: {
      proxy: {
        '/api': {
          target: backendUpstream,
          changeOrigin: true,
        }
      }
    }
  }
})
