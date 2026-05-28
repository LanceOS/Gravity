import { env } from '../env.js';

// Small runtime abstraction for trusted service tokens. This starts by
// returning the tokens parsed from env.TRUSTED_SERVICE_TOKENS but centralizes
// access so integrations with a secrets manager (KMS/Vault) can be added later.

let cachedTokens: string[] = Array.isArray(env.trustedServiceTokens) ? env.trustedServiceTokens : [];

export function getTrustedServiceTokens(): string[] {
  return cachedTokens;
}

export function setTrustedServiceTokens(tokens: string[]) {
  cachedTokens = Array.isArray(tokens) ? tokens : [];
}

// Placeholder for future secret manager refresh logic. Implementations should
// fetch from a secure store and call `setTrustedServiceTokens` with the new list.
export async function refreshFromSecretManager(): Promise<void> {
  // no-op: current implementation sources tokens from env at process start.
  return Promise.resolve();
}

export default { getTrustedServiceTokens, setTrustedServiceTokens, refreshFromSecretManager };
