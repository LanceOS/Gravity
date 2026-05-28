import { createHmac, randomBytes } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { mcpConnectionTokens } from '../../db/schema.js';
import { createId } from '../../lib/platform.js';
import { env } from '../../env.js';
import { audit } from '../../lib/logger.js';

type CreateOptions = {
  workspaceId: string;
  generatedBy: string;
  scopes?: string[];
  connectionType?: string;
  sourceIp?: string | null;
  ttlSeconds?: number;
  singleUse?: boolean;
};

type ConnectionTokenPayload = {
  id: string;
  rawToken: string;
  expiresAt: string;
  scopes: string[];
  singleUse: boolean;
  connectionType: string;
};

export async function createConnectionToken(opts: CreateOptions): Promise<ConnectionTokenPayload> {
  const id = createId('mct');
  const raw = randomBytes(32).toString('hex');
  const hmacKeyId = 'env';
  const tokenHash = createHmac('sha256', env.betterAuthSecret).update(raw).digest('hex');

  const expiresAt = opts.ttlSeconds ? new Date(Date.now() + opts.ttlSeconds * 1000) : new Date(Date.now() + 5 * 60 * 1000);

  await db.insert(mcpConnectionTokens).values({
    id,
    workspaceId: opts.workspaceId,
    tokenHash,
    hmacKeyId,
    scopes: opts.scopes || ['tools/list', 'tools/call'],
    expiresAt,
    singleUse: opts.singleUse !== undefined ? opts.singleUse : true,
    status: 'active',
    generatedBy: opts.generatedBy,
    sourceIp: opts.sourceIp ?? null,
    connectionType: opts.connectionType ?? 'http-post',
    createdAt: new Date(),
  });

  // Audit: token created (do not include raw token)
  try {
    audit('mcp.token.created', {
      id,
      workspaceId: opts.workspaceId,
      generatedBy: opts.generatedBy,
      scopes: opts.scopes || ['tools/list', 'tools/call'],
      singleUse: opts.singleUse !== undefined ? opts.singleUse : true,
      connectionType: opts.connectionType ?? 'http-post',
      sourceIp: opts.sourceIp ?? null,
      expiresAt: expiresAt.toISOString(),
      hmacKeyId,
    });
  } catch (e) {
    // best-effort logging
  }

  return {
    id,
    rawToken: raw,
    expiresAt: expiresAt.toISOString(),
    scopes: opts.scopes || ['tools/list', 'tools/call'],
    singleUse: opts.singleUse !== undefined ? opts.singleUse : true,
    connectionType: opts.connectionType ?? 'http-post',
  };
}

export async function revokeConnectionToken(tokenId: string, requestingUserId: string) {
  // Fetch token metadata for audit, then revoke
  const rows = await db.select().from(mcpConnectionTokens).where(eq(mcpConnectionTokens.id, tokenId)).limit(1);
  const tokenRow = rows[0];
  await db.update(mcpConnectionTokens).set({ status: 'revoked', revokedAt: new Date() }).where(eq(mcpConnectionTokens.id, tokenId));
  try {
    audit('mcp.token.revoked', {
      id: tokenId,
      workspaceId: tokenRow?.workspaceId ?? null,
      generatedBy: tokenRow?.generatedBy ?? null,
      revokedBy: requestingUserId,
      connectionType: tokenRow?.connectionType ?? null,
      scopes: tokenRow?.scopes ?? null,
    });
  } catch (e) {
    // best-effort
  }
}

export async function refreshConnectionToken(
  tokenId: string,
  requestingUserId: string,
  opts: { ttlSeconds?: number; sourceIp?: string | null } = {},
): Promise<ConnectionTokenPayload | null> {
  const rows = await db.select().from(mcpConnectionTokens).where(eq(mcpConnectionTokens.id, tokenId)).limit(1);
  const row = rows[0];
  if (!row || row.status !== 'active' || (row.expiresAt && row.expiresAt <= new Date())) {
    return null;
  }

  const raw = randomBytes(32).toString('hex');
  const hmacKeyId = 'env';
  const tokenHash = createHmac('sha256', env.betterAuthSecret).update(raw).digest('hex');
  const expiresAt = opts.ttlSeconds ? new Date(Date.now() + opts.ttlSeconds * 1000) : new Date(Date.now() + 5 * 60 * 1000);

  await db.update(mcpConnectionTokens).set({
    tokenHash,
    hmacKeyId,
    expiresAt,
    sourceIp: opts.sourceIp ?? row.sourceIp,
  }).where(eq(mcpConnectionTokens.id, tokenId));

  // Audit: token refreshed
  try {
    audit('mcp.token.refreshed', {
      id: row.id,
      workspaceId: row.workspaceId,
      generatedBy: row.generatedBy,
      scopes: row.scopes,
      singleUse: row.singleUse,
      connectionType: row.connectionType,
      sourceIp: opts.sourceIp ?? row.sourceIp,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (e) {
    // best-effort
  }

  return {
    id: row.id,
    rawToken: raw,
    expiresAt: expiresAt.toISOString(),
    scopes: row.scopes,
    singleUse: row.singleUse,
    connectionType: row.connectionType,
  };
}

export async function verifyAndConsumeToken(rawToken: string, workspaceId: string) {
  // Support key rotation by attempting verification with the current
  // secret plus any legacy secrets configured in `env.betterAuthOldSecrets`.
  const secrets = [env.betterAuthSecret, ...(Array.isArray(env.betterAuthOldSecrets) ? env.betterAuthOldSecrets : [])];

  const rowOrUpdated = await db.transaction(async (tx) => {
    // Try each secret to find a matching token row.
    let matchedRow: any = null;
    for (const secret of secrets) {
      const tokenHash = createHmac('sha256', secret).update(rawToken).digest('hex');
      const rows = await tx
        .select()
        .from(mcpConnectionTokens)
        .where(and(eq(mcpConnectionTokens.tokenHash, tokenHash), eq(mcpConnectionTokens.workspaceId, workspaceId)))
        .limit(1);

      if (rows[0]) {
        matchedRow = rows[0];
        break;
      }
    }

    if (!matchedRow) return null;

    const row = matchedRow;

    // Reject if not active or expired
    if (row.status !== 'active') return null;
    if (row.expiresAt && row.expiresAt <= new Date()) return null;

    if (row.singleUse) {
      const updated = await tx
        .update(mcpConnectionTokens)
        .set({ status: 'used', usedAt: new Date() })
        .where(and(eq(mcpConnectionTokens.id, row.id), eq(mcpConnectionTokens.status, 'active')))
        .returning();

      return updated[0] ?? null;
    }

    // Multi-use: update usedAt but keep status active.
    await tx.update(mcpConnectionTokens).set({ usedAt: new Date() }).where(eq(mcpConnectionTokens.id, row.id));
    return row;
  });

  if (!rowOrUpdated) return null;

  // Audit: token consumed (do not log raw token)
  try {
    audit('mcp.token.consumed', {
      id: rowOrUpdated.id,
      workspaceId: rowOrUpdated.workspaceId,
      generatedBy: rowOrUpdated.generatedBy,
      scopes: rowOrUpdated.scopes,
      connectionType: rowOrUpdated.connectionType,
    });
  } catch (e) {
    // best-effort
  }

  return {
    id: rowOrUpdated.id,
    workspaceId: rowOrUpdated.workspaceId,
    generatedBy: rowOrUpdated.generatedBy,
    scopes: rowOrUpdated.scopes,
    connectionType: rowOrUpdated.connectionType,
  };
}

export default {};
