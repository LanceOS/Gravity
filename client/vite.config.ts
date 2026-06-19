import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'



// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const backendUpstream = env.BACKEND_UPSTREAM || env.VITE_API_PROXY_TARGET || 'http://localhost:8080'
  const frontendPublicHost = (() => {
    const candidate = (env.GRAVITY_FRONTEND_PUBLIC_URL || env.VITE_FRONTEND_PUBLIC_URL || '').trim()
    if (!candidate) return ''
    try {
      return new URL(candidate).hostname
    } catch {
      return candidate.replace(/^https?:\/\//, '').split('/')[0].split(':')[0]
    }
  })()
  const viteAllowedHosts = (env.VITE_ALLOWED_HOSTS || '')
    .split(',')
    .map((host) => host.trim())
    .filter(Boolean)
  const allowedHosts = [
    'localhost',
    '127.0.0.1',
    '[::1]',
    ...(frontendPublicHost ? [frontendPublicHost] : []),
    ...viteAllowedHosts,
  ].filter((host, index, arr) => arr.indexOf(host) === index)

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
      allowedHosts,
      proxy: {
        '/api': {
          target: backendUpstream,
          changeOrigin: true,
        }
      }
    }
  }
})
