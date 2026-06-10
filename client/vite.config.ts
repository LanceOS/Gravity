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
        'lucide-react': resolve(__dirname, 'node_modules/lucide-react'),
        '@tiptap/core': resolve(__dirname, 'node_modules/@tiptap/core'),
        '@tiptap/pm': resolve(__dirname, 'node_modules/@tiptap/pm'),
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
