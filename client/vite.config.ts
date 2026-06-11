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
        '@tanstack/react-query': resolve(__dirname, 'src/utils/react-query-mock.tsx'),
        '@tanstack/react-query-devtools': resolve(__dirname, 'src/utils/react-query-devtools-mock.tsx'),
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
