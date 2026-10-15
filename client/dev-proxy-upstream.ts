const DEFAULT_UPSTREAM = 'http://localhost:8080'
const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:8080',
  'http://127.0.0.1:8080',
  'http://[::1]:8080',
]

function parseOrigin(raw: string, variable: string): string {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error(`${variable} must be an HTTP(S) origin without a path, query, fragment, or credentials`)
  }

  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:') ||
    !url.hostname ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    (raw !== url.origin && raw !== `${url.origin}/`)
  ) {
    throw new Error(`${variable} must be an HTTP(S) origin without a path, query, fragment, or credentials`)
  }

  return url.origin
}

export function rejectBrowserProxyTarget(env: Record<string, string | undefined>): void {
  if (env.VITE_API_PROXY_TARGET?.trim()) {
    throw new Error('VITE_API_PROXY_TARGET is no longer supported; use server-only BACKEND_UPSTREAM instead')
  }
}

export function resolveDevProxyUpstream(env: Record<string, string | undefined>): string {
  rejectBrowserProxyTarget(env)

  const allowed = new Set(DEFAULT_ALLOWED_ORIGINS)
  if (env.GRAVITY_DEV_PROXY_ALLOWED_ORIGINS?.trim()) {
    for (const entry of env.GRAVITY_DEV_PROXY_ALLOWED_ORIGINS.split(',')) {
      const candidate = entry.trim()
      if (!candidate) {
        throw new Error('GRAVITY_DEV_PROXY_ALLOWED_ORIGINS must contain only HTTP(S) origins')
      }
      allowed.add(parseOrigin(candidate, 'GRAVITY_DEV_PROXY_ALLOWED_ORIGINS'))
    }
  }

  const upstream = parseOrigin(env.BACKEND_UPSTREAM?.trim() || DEFAULT_UPSTREAM, 'BACKEND_UPSTREAM')
  if (!allowed.has(upstream)) {
    throw new Error('BACKEND_UPSTREAM is not an allowed dev proxy origin; add it to GRAVITY_DEV_PROXY_ALLOWED_ORIGINS only if you trust it')
  }
  return upstream
}
