import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { env } from '../env.js';
import { securityAlert } from './logger.js';

// Runtime abstraction for trusted service tokens with a simple placeholder
// 'secrets manager' implementation. Current behavior:
// - Start with tokens from `env.trustedServiceTokens`.
// - If `env.trustedServiceTokensFile` is set, read tokens from that file (JSON
//   array, newline-separated, or comma-separated).
// - Provide `refreshFromSecretManager()` to re-read the file (for rotation).
// - Provide `startAutoRefresh()` to poll the file on an interval (disabled in tests).

let cachedTokens: string[] = Array.isArray(env.trustedServiceTokens) ? env.trustedServiceTokens : [];
let refreshInterval: NodeJS.Timeout | null = null;
type RefreshFailureReason =
  | 'configured_token_file_invalid_json'
  | 'configured_token_file_missing'
  | 'configured_token_file_empty'
  | 'configured_token_file_unreadable';
let lastRefreshFailureReason: RefreshFailureReason | null = null;

function reportRefreshFailure(failureReason: RefreshFailureReason): void {
  if (lastRefreshFailureReason === failureReason) return;

  const delivered = securityAlert('security.service_token_refresh_failed', {
    failureReason,
    source: 'trusted_service_tokens_file',
  });
  if (delivered) lastRefreshFailureReason = failureReason;
}

function clearRefreshFailure(): void {
  lastRefreshFailureReason = null;
}

function parseTokens(raw: string): string[] | null {
  const t = String(raw ?? '').trim();
  if (!t) return [];

  // Only attempt JSON parsing for the documented JSON-array format. This
  // avoids treating normal comma/newline configurations as parse failures.
  if (t.startsWith('[')) {
    try {
      const maybeJson = JSON.parse(t);
      if (Array.isArray(maybeJson)) return maybeJson.map(String).map((s) => s.trim()).filter(Boolean);
      return [];
    } catch {
      reportRefreshFailure('configured_token_file_invalid_json');
      return null;
    }
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
  if (env.trustedServiceTokensFile) {
    const filePath = env.trustedServiceTokensFile;
    if (!existsSync(filePath)) {
      reportRefreshFailure('configured_token_file_missing');
    } else {
      try {
        const content = await fs.readFile(filePath, 'utf8');
        const tokens = parseTokens(content);
        if (tokens && tokens.length > 0) {
          setTrustedServiceTokens(tokens);
          clearRefreshFailure();
          return;
        }

        if (tokens !== null) {
          reportRefreshFailure('configured_token_file_empty');
        }
      } catch {
        reportRefreshFailure('configured_token_file_unreadable');
      }
    }
  }

  // Preserve the existing fallback when no usable file-backed configuration is
  // available, while making that security-relevant condition observable above.
  setTrustedServiceTokens(Array.isArray(env.trustedServiceTokens) ? env.trustedServiceTokens : []);
  if (!env.trustedServiceTokensFile) clearRefreshFailure();
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
