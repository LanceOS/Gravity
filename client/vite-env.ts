import { rejectBrowserProxyTarget } from './dev-proxy-upstream.ts'

const BROWSER_VARIABLES = new Set([
  'VITE_ALLOWED_HOSTS',
  'VITE_ALLOWED_TICKET_HOSTS',
  'VITE_FRONTEND_PUBLIC_URL',
  'VITE_TICKET_URL_BASE',
])

export function validateViteEnvironment(env: Record<string, string | undefined>): void {
  rejectBrowserProxyTarget(env)

  for (const name of Object.keys(env)) {
    if (name.startsWith('VITE_') && !BROWSER_VARIABLES.has(name)) {
      throw new Error(`${name} is not an approved browser environment variable; VITE_ values are bundled into client assets`)
    }
  }
}
