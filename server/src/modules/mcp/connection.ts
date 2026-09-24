import { createHmac, randomBytes } from 'node:crypto';
import { and, eq, gt, isNull, or, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { mcpConnectionTokens } from '../../db/schema.js';
import { createId } from '../../lib/platform.js';
import { env } from '../../env.js';
import { audit, securityAlert } from '../../lib/logger.js';
import { isMcpWorkspaceMember } from './access.js';

const DEFAULT_MCP_SCOPES = ['tools/list'];
const DEFAULT_TOKEN_TTL_SECONDS = 24 * 60 * 60;

function configuredSecrets() {
  const current = process.env.BETTER_AUTH_SECRET ?? env.betterAuthSecret;
  const configured = process.env.BETTER_AUTH_OLD_SECRETS;
  const entries = configured === undefined ? env.betterAuthOldSecrets : configured.split(',');
  const keyed: Record<string, string> = {};
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

export async function createConnectionToken(opts: CreateOptions): Promise<ConnectionTokenPayload> {
  const id = createId('mct');
  const raw = randomBytes(32).toString('hex');
  const hmacKeyId = opts.hmacKeyId ?? 'env';
  // Determine secret for the given key id. Prefer mapped keyed secrets, fall back to current env secret.
  const secrets = configuredSecrets();
  const secretForKey = hmacKeyId === 'env' ? secrets.current : secrets.keyed[hmacKeyId];
  if (!secretForKey) throw new Error('Unknown MCP signing key.');
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

export async function verifyAndConsumeToken(rawToken: string, workspaceId: string, opts?: { sourceIp?: string | null }) {
  const secrets = configuredSecrets();
  const knownSecrets = [...new Set([secrets.current, ...Object.values(secrets.keyed), ...secrets.legacy])];

  const rowOrUpdated = await db.transaction(async (tx) => {
    let matchedRow: typeof mcpConnectionTokens.$inferSelect | null = null;
    for (const secret of knownSecrets) {
      const tokenHash = createHmac('sha256', secret).update(rawToken).digest('hex');
      const [candidate] = await tx.select().from(mcpConnectionTokens)
        .where(and(eq(mcpConnectionTokens.tokenHash, tokenHash), eq(mcpConnectionTokens.workspaceId, workspaceId)))
        .limit(1);
      if (!candidate) continue;
      const keyId = candidate.hmacKeyId ?? 'env';
      // Historically API-issued tokens record "env", not a stable key id.
      // Retained keyed values must therefore also verify those older tokens.
      // Explicit key ids still require their original mapping to be retained.
      if (keyId !== 'env' && secrets.keyed[keyId] !== secret) continue;
      matchedRow = candidate;
      break;
    }

    if (!matchedRow) return null;

    const row = matchedRow;

    // Reject if not active or expired
    if (row.status !== 'active') return null;
    if (row.expiresAt && row.expiresAt <= new Date()) return null;

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
  if (!row || row.status !== 'active' || (row.expiresAt && row.expiresAt <= new Date()) || row.tokenHash !== expectedTokenHash) return null;
  if (!await isMcpWorkspaceMember(workspaceId, generatedBy)) return null;
  return row;
}

export default {};
