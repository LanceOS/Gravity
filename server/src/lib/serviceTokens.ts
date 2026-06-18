import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { env } from '../env.js';

// Runtime abstraction for trusted service tokens with a simple placeholder
// 'secrets manager' implementation. Current behavior:
// - Start with tokens from `env.trustedServiceTokens`.
// - If `env.trustedServiceTokensFile` is set, read tokens from that file (JSON
//   array, newline-separated, or comma-separated).
// - Provide `refreshFromSecretManager()` to re-read the file (for rotation).
// - Provide `startAutoRefresh()` to poll the file on an interval (disabled in tests).

let cachedTokens: string[] = Array.isArray(env.trustedServiceTokens) ? env.trustedServiceTokens : [];
let refreshInterval: NodeJS.Timeout | null = null;

function parseTokens(raw: string): string[] {
  const t = String(raw ?? '').trim();
  if (!t) return [];
  try {
    const maybeJson = JSON.parse(t);
    if (Array.isArray(maybeJson)) return maybeJson.map(String).map((s) => s.trim()).filter(Boolean);
  } catch (e) {
    // ignore JSON parse errors and fall back to line/comma parsing
  }

  return t.split(/\r?\n|,/).map((s) => s.trim()).filter(Boolean);
}

export function getTrustedServiceTokens(): string[] {
  return cachedTokens.slice();
}

export function setTrustedServiceTokens(tokens: string[]) {
  cachedTokens = Array.isArray(tokens) ? tokens.map(String).map((s) => s.trim()).filter(Boolean) : [];
}

export async function refreshFromSecretManager(): Promise<void> {
  // Priority: file (if configured) -> env list
  try {
    if (env.trustedServiceTokensFile) {
      try {
        const filePath = env.trustedServiceTokensFile;
        if (existsSync(filePath)) {
          const content = await fs.readFile(filePath, 'utf8');
          const tokens = parseTokens(content);
          if (tokens.length > 0) {
            setTrustedServiceTokens(tokens);
            return;
          }
        }
      } catch (err) {
        // if file read fails, fall back to env below
      }
    }

    // Fallback to env-provided tokens
    setTrustedServiceTokens(Array.isArray(env.trustedServiceTokens) ? env.trustedServiceTokens : []);
  } catch (e) {
    // best-effort: swallow errors
  }
}

export function startAutoRefresh(intervalMs?: number) {
  if (env.nodeEnv === 'test') return; // keep tests deterministic
  const ms = typeof intervalMs === 'number' ? intervalMs : env.trustedServiceTokensRefreshIntervalMs ?? 60000;
  if (!ms || ms <= 0) return;
  if (refreshInterval) clearInterval(refreshInterval);
  // Warm up immediately
  void refreshFromSecretManager();
  refreshInterval = setInterval(() => {
    void refreshFromSecretManager();
  }, ms);

  if (refreshInterval && typeof (refreshInterval as { unref?: () => void }).unref === 'function') {
    refreshInterval.unref();
  }
}

export function stopAutoRefresh() {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
}

// Exposed start lifecycle: load tokens now and start the periodic refresh.
// Call this from server startup so imports have no side-effects.
export async function start(): Promise<void> {
  await refreshFromSecretManager();
  startAutoRefresh();
}

export default { getTrustedServiceTokens, setTrustedServiceTokens, refreshFromSecretManager, startAutoRefresh, stopAutoRefresh, start };
