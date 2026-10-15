import { defineConfig, loadEnv } from 'vite'
import type { ProxyOptions } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { resolveDevProxyUpstream } from './dev-proxy-upstream'
import { validateViteEnvironment } from './vite-env'

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, __dirname, '')
  validateViteEnvironment(env)
  const proxy = command === 'serve' ? (() => {
    const target = resolveDevProxyUpstream(env)
    const options: ProxyOptions = {
      target,
      changeOrigin: true,
      configure(proxy) {
        proxy.on('proxyReq', (request) => {
          // Browser-supplied forwarding claims must not reach a trusted backend.
          for (const name of request.getHeaderNames()) {
            if (name === 'forwarded' || name === 'x-real-ip' || name.startsWith('x-forwarded-')) {
              request.removeHeader(name)
            }
          }
        })
      },
    }
    return {
      '^/api(?:/|\\?|$)': options,
      // Vite matches req.url including its query string, which /authorize needs.
      '^/(\\.well-known/oauth-(authorization-server|protected-resource)(/[^?]*)?|authorize|token|register|revoke)(?:\\?|$)': options,
    }
  })() : undefined
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
    root: __dirname,
    envDir: __dirname,
    plugins: [react()],
    resolve: {
      // Shared server schema imports must use the editor's runtime, including
      // Docker builds that install server and client dependencies separately.
      dedupe: ['prosemirror-model', 'prosemirror-state', 'prosemirror-transform', 'prosemirror-view'],
      alias: {
        '@library': resolve(__dirname, '../library'),
        '@tanstack/react-query': resolve(__dirname, 'src/utils/react-query-mock.tsx'),
        '@tanstack/react-query-devtools': resolve(__dirname, 'src/utils/react-query-devtools-mock.tsx'),
      },
    },
    server: {
      allowedHosts,
      ...(proxy ? { proxy } : {}),
    }
  }
})
