import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { and, eq, gt, isNull, or, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { mcpConnectionTokens } from '../../db/schema.js';
import { createId } from '../../lib/platform.js';
import { env } from '../../env.js';
import { audit, securityAlert, warn } from '../../lib/logger.js';
import { isMcpWorkspaceMember } from './access.js';

const DEFAULT_MCP_SCOPES = ['tools/list'];
const DEFAULT_TOKEN_TTL_SECONDS = 24 * 60 * 60;
const SHA256_DIGEST_BYTES = 32;
const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/;

function readSha256Hex(value: unknown): { bytes: Buffer; valid: boolean } {
  const bytes = Buffer.alloc(SHA256_DIGEST_BYTES);
  if (typeof value !== 'string' || !SHA256_HEX_PATTERN.test(value)) return { bytes, valid: false };
  Buffer.from(value, 'hex').copy(bytes);
  return { bytes, valid: true };
}

function timingSafeSha256HexEqual(left: unknown, right: unknown): boolean {
  const leftDigest = readSha256Hex(left);
  const rightDigest = readSha256Hex(right);
  const equal = timingSafeEqual(leftDigest.bytes, rightDigest.bytes);
  return leftDigest.valid && rightDigest.valid && equal;
}

function configuredSecrets() {
  const current = process.env.BETTER_AUTH_SECRET ?? env.betterAuthSecret;
  const configured = process.env.BETTER_AUTH_OLD_SECRETS;
  const entries = configured === undefined ? env.betterAuthOldSecrets : configured.split(',');
  const keyed = Object.create(null) as Record<string, string>;
  const legacy: string[] = [];
  for (const entry of entries) {
    const item = entry.trim();
    if (!item) continue;
    // Plain legacy secrets can themselves contain ':' or '=' (including
    // base64 padding). Keep the original value as a verification candidate;
    // explicitly keyed tokens still require their matching map entry below.
    legacy.push(item);
    const match = item.match(/^([^=:\s]+)[=:](.+)$/);
    if (match) keyed[match[1]] = match[2];
  }
  return { current, keyed, legacy };
}


type CreateOptions = {
  workspaceId: string;
  generatedBy: string;
  scopes?: string[];
  connectionType?: string;
  sourceIp?: string | null;
  ttlSeconds?: number;
  singleUse?: boolean;
  hmacKeyId?: string;
};

type ConnectionTokenPayload = {
  id: string;
  rawToken: string;
  expiresAt: string;
  scopes: string[];
  singleUse: boolean;
  connectionType: string;
};

function auditConnectionTokenEvent(event: string, data: Record<string, unknown>): void {
  try {
    audit(event, data);
  } catch {
    // Do not include the caught error: logging sinks can include sensitive
    // configuration in their error text. The stable reason is sufficient for
    // alert routing and correlation with the operation below.
    securityAlert('security.audit_log_failed', {
      failureReason: 'audit_sink_unavailable',
      failedAuditEvent: event,
      mcpConnectionId: typeof data.id === 'string' ? data.id : undefined,
      workspaceId: typeof data.workspaceId === 'string' ? data.workspaceId : undefined,
    });
  }
}

function warnConnectionTokenSigningKeyRejected(workspaceId: string, hmacKeyId: string): void {
  const data = {
    failureReason: 'unknown_signing_key_id',
    workspaceId,
    hmacKeyId,
    remediation: "Add the key ID to BETTER_AUTH_OLD_SECRETS as key-id=secret, or omit hmacKeyId to use BETTER_AUTH_SECRET.",
  };

  try {
    warn('mcp.token.signing_key_rejected', data);
  } catch {
    // Keep rejection behavior stable if the warning sink is unavailable.
    try {
      securityAlert('security.mcp_token_signing_key_rejected', data);
    } catch {
      // Logging failure must not replace the actionable signing-key error.
    }
  }
}

export async function createConnectionToken(opts: CreateOptions): Promise<ConnectionTokenPayload> {
  const hmacKeyId = opts.hmacKeyId ?? 'env';
  // Current tokens use the env key; old keys are available only by an explicit mapping.
  const secrets = configuredSecrets();
  const secretForKey = hmacKeyId === 'env'
    ? secrets.current
    : Object.hasOwn(secrets.keyed, hmacKeyId) ? secrets.keyed[hmacKeyId] : undefined;
  if (!secretForKey) {
    warnConnectionTokenSigningKeyRejected(opts.workspaceId, hmacKeyId);
    throw new Error('Unknown MCP signing key.');
  }

  const id = createId('mct');
  const raw = randomBytes(32).toString('hex');
  const tokenHash = createHmac('sha256', secretForKey).update(raw).digest('hex');

  const expiresAt = opts.ttlSeconds ? new Date(Date.now() + opts.ttlSeconds * 1000) : new Date(Date.now() + DEFAULT_TOKEN_TTL_SECONDS * 1000);
  const normalizedScopes = opts.scopes ?? DEFAULT_MCP_SCOPES;

  await db.insert(mcpConnectionTokens).values({
    id,
    workspaceId: opts.workspaceId,
    tokenHash,
    hmacKeyId,
    scopes: normalizedScopes,
    expiresAt,
    singleUse: opts.singleUse ?? false,
    status: 'active',
    generatedBy: opts.generatedBy,
    sourceIp: opts.sourceIp ?? null,
    connectionType: opts.connectionType ?? 'streamable-http',
    createdAt: new Date(),
  });

  // Audit: token created (do not include raw token)
  const masked = `${raw.slice(0, 8)}...${raw.slice(-4)}`;
  auditConnectionTokenEvent('mcp.token.created', {
    id,
    workspaceId: opts.workspaceId,
    generatedBy: opts.generatedBy,
    scopes: normalizedScopes,
    singleUse: opts.singleUse ?? false,
    connectionType: opts.connectionType ?? 'streamable-http',
    sourceIp: opts.sourceIp ?? null,
    expiresAt: expiresAt.toISOString(),
    hmacKeyId,
    maskedToken: masked,
  });

  return {
    id,
    rawToken: raw,
    expiresAt: expiresAt.toISOString(),
    scopes: normalizedScopes,
    singleUse: opts.singleUse ?? false,
    connectionType: opts.connectionType ?? 'streamable-http',
  };
}

export async function revokeConnectionToken(tokenId: string, requestingUserId: string) {
  // Fetch token metadata for audit, then revoke
  const rows = await db.select().from(mcpConnectionTokens).where(eq(mcpConnectionTokens.id, tokenId)).limit(1);
  const tokenRow = rows[0];
  await db.update(mcpConnectionTokens).set({ status: 'revoked', revokedAt: new Date() }).where(eq(mcpConnectionTokens.id, tokenId));
  let disconnectedCount = 0;
  try {
    const realtime = await import('../../realtime.js');
    disconnectedCount = await realtime.disconnectSseConnectionsByToken(tokenId);
  } catch {
    securityAlert('security.connection_disconnect_failed', {
      failureReason: 'revoked_token_sse_disconnect_failed',
      mcpConnectionId: tokenId,
      workspaceId: tokenRow?.workspaceId ?? null,
    });
  }
  auditConnectionTokenEvent('mcp.token.revoked', {
    id: tokenId,
    workspaceId: tokenRow?.workspaceId ?? null,
    generatedBy: tokenRow?.generatedBy ?? null,
    revokedBy: requestingUserId,
    connectionType: tokenRow?.connectionType ?? null,
    scopes: tokenRow?.scopes ?? null,
    disconnectedSseConnections: disconnectedCount,
  });
}

export async function refreshConnectionToken(
  tokenId: string,
  requestingUserId: string,
  opts: { ttlSeconds?: number; sourceIp?: string | null } = {},
): Promise<ConnectionTokenPayload | null> {
  const rows = await db.select().from(mcpConnectionTokens).where(eq(mcpConnectionTokens.id, tokenId)).limit(1);
  const row = rows[0];
  if (!row || row.connectionType === 'oauth' || row.status !== 'active' || (row.expiresAt && row.expiresAt <= new Date())) {
    return null;
  }

  const raw = randomBytes(32).toString('hex');
  // Refresh moves credentials onto the current signing key.
  const hmacKeyId = 'env';
  const secretForKey = configuredSecrets().current;
  const tokenHash = createHmac('sha256', secretForKey).update(raw).digest('hex');
  const expiresAt = opts.ttlSeconds ? new Date(Date.now() + opts.ttlSeconds * 1000) : new Date(Date.now() + DEFAULT_TOKEN_TTL_SECONDS * 1000);

  await db.update(mcpConnectionTokens).set({
    tokenHash,
    hmacKeyId,
    expiresAt,
    sourceIp: opts.sourceIp === undefined ? row.sourceIp : opts.sourceIp,
  }).where(eq(mcpConnectionTokens.id, tokenId));

  // Audit: token refreshed
  const masked = `${raw.slice(0, 8)}...${raw.slice(-4)}`;
  auditConnectionTokenEvent('mcp.token.refreshed', {
    id: row.id,
    workspaceId: row.workspaceId,
    generatedBy: row.generatedBy,
    scopes: row.scopes,
    singleUse: row.singleUse,
    connectionType: row.connectionType,
    sourceIp: opts.sourceIp === undefined ? row.sourceIp : opts.sourceIp,
    expiresAt: expiresAt.toISOString(),
    maskedToken: masked,
  });

  return {
    id: row.id,
    rawToken: raw,
    expiresAt: expiresAt.toISOString(),
    scopes: row.scopes,
    singleUse: row.singleUse,
    connectionType: row.connectionType,
  };
}

export async function verifyAndConsumeToken(rawToken: string, workspaceId: string, opts?: { sourceIp?: string | null; allowSingleUse?: boolean }) {
  const secrets = configuredSecrets();
  const knownSecrets = [...new Set([secrets.current, ...Object.values(secrets.keyed), ...secrets.legacy])];
  const expectedHashes = knownSecrets.map((secret) => ({
    secret,
    digest: createHmac('sha256', secret).update(rawToken).digest(),
  }));

  const rowOrUpdated = await db.transaction(async (tx) => {
    let matchedRow: typeof mcpConnectionTokens.$inferSelect | null = null;
    const candidates = await tx.select().from(mcpConnectionTokens)
      .where(and(eq(mcpConnectionTokens.workspaceId, workspaceId), eq(mcpConnectionTokens.status, 'active')));

    // Scan every active token in the workspace so token hashes are compared in
    // process with fixed-size buffers instead of a database text equality.
    // Continue through all candidates and configured secrets to avoid making
    // the matching row's position affect comparison work.
    for (const candidate of candidates) {
      const storedHash = readSha256Hex(candidate.tokenHash);
      const keyId = candidate.hmacKeyId ?? 'env';
      let candidateMatched = false;
      for (const expectedHash of expectedHashes) {
        const hashMatches = timingSafeEqual(expectedHash.digest, storedHash.bytes);
        // Historically API-issued tokens record "env", not a stable key id.
        // Retained keyed values must therefore also verify those older tokens.
        // Explicit key ids still require their original mapping to be retained.
        const keyMatches = keyId === 'env' || secrets.keyed[keyId] === expectedHash.secret;
        const accepted = Number(hashMatches) & Number(storedHash.valid) & Number(keyMatches);
        candidateMatched = Boolean(Number(candidateMatched) | accepted);
      }
      if (candidateMatched) matchedRow = candidate;
    }

    if (!matchedRow) return null;

    const row = matchedRow;

    // Reject if not active or expired
    if (row.status !== 'active') return null;
    if (row.expiresAt && row.expiresAt <= new Date()) return null;

    // Reject token kinds the caller cannot use before recording any usage.
    // Other transports retain the atomic single-use consumption path below.
    if (row.singleUse && opts?.allowSingleUse === false) return null;

    // Enforce source IP binding: if the token row is bound to a specific
    // source IP, the caller MUST present a source IP and it MUST match.
    if (row.sourceIp) {
      if (!opts?.sourceIp) return null;
      if (row.sourceIp !== opts.sourceIp) return null;
    }

    if (row.singleUse) {
      const updated = await tx
        .update(mcpConnectionTokens)
        .set({ status: 'used', usedAt: new Date(), usageCount: sql`coalesce(usage_count, 0) + 1` })
        .where(and(
          eq(mcpConnectionTokens.id, row.id), eq(mcpConnectionTokens.status, 'active'),
          eq(mcpConnectionTokens.tokenHash, row.tokenHash),
          or(isNull(mcpConnectionTokens.expiresAt), gt(mcpConnectionTokens.expiresAt, new Date())),
        ))
        .returning();

      return updated[0] ?? null;
    }

    // Multi-use: update usedAt but keep status active.
    const updatedMulti = await tx
      .update(mcpConnectionTokens)
      .set({ usedAt: new Date(), usageCount: sql`coalesce(usage_count, 0) + 1` })
      .where(and(
          eq(mcpConnectionTokens.id, row.id), eq(mcpConnectionTokens.status, 'active'),
          eq(mcpConnectionTokens.tokenHash, row.tokenHash),
          or(isNull(mcpConnectionTokens.expiresAt), gt(mcpConnectionTokens.expiresAt, new Date())),
        ))
      .returning();

    return updatedMulti[0] ?? null;
  });

  if (!rowOrUpdated) return null;

  // Audit: token consumed (do not log raw token)
  auditConnectionTokenEvent('mcp.token.consumed', {
    id: rowOrUpdated.id,
    workspaceId: rowOrUpdated.workspaceId,
    generatedBy: rowOrUpdated.generatedBy,
    scopes: rowOrUpdated.scopes,
    connectionType: rowOrUpdated.connectionType,
  });

  return {
    id: rowOrUpdated.id,
    workspaceId: rowOrUpdated.workspaceId,
    generatedBy: rowOrUpdated.generatedBy,
    scopes: rowOrUpdated.scopes,
    connectionType: rowOrUpdated.connectionType,
    singleUse: rowOrUpdated.singleUse,
    tokenHash: rowOrUpdated.tokenHash,
  };
}

/** Rechecks a token-authenticated stdio session after its initial handshake. */
export async function verifyConnectionTokenSession(tokenId: string, workspaceId: string, generatedBy: string, expectedTokenHash: string | null) {
  const [row] = await db.select().from(mcpConnectionTokens)
    .where(and(eq(mcpConnectionTokens.id, tokenId), eq(mcpConnectionTokens.workspaceId, workspaceId), eq(mcpConnectionTokens.generatedBy, generatedBy)))
    .limit(1);
  if (!row) return null;
  const tokenHashMatches = timingSafeSha256HexEqual(row.tokenHash, expectedTokenHash);
  if (row.status !== 'active' || (row.expiresAt && row.expiresAt <= new Date()) || !tokenHashMatches) return null;
  if (!await isMcpWorkspaceMember(workspaceId, generatedBy)) return null;
  return row;
}

export default {};
