import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { existsSync } from 'fs'

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

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const backendUpstream = env.BACKEND_UPSTREAM || env.VITE_API_PROXY_TARGET || 'http://localhost:8080'

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@library': resolve(__dirname, '../library'),
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
