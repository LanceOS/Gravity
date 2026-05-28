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

export async function createConnectionToken(opts: CreateOptions): Promise<ConnectionTokenPayload> {
  const id = createId('mct');
  const raw = randomBytes(32).toString('hex');
  const hmacKeyId = opts.hmacKeyId ?? 'env';
  // Determine secret for the given key id. Prefer mapped keyed secrets, fall back to current env secret.
  const secretForKey = hmacKeyId !== 'env' && env.betterAuthOldSecretsMap && env.betterAuthOldSecretsMap[hmacKeyId]
    ? env.betterAuthOldSecretsMap[hmacKeyId]
    : env.betterAuthSecret;
  const tokenHash = createHmac('sha256', secretForKey).update(raw).digest('hex');

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
    const masked = `${raw.slice(0, 8)}...${raw.slice(-4)}`;
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
      maskedToken: masked,
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
  const hmacKeyId = row.hmacKeyId ?? 'env';
  const secretForKey = hmacKeyId !== 'env' && env.betterAuthOldSecretsMap && env.betterAuthOldSecretsMap[hmacKeyId]
    ? env.betterAuthOldSecretsMap[hmacKeyId]
    : env.betterAuthSecret;
  const tokenHash = createHmac('sha256', secretForKey).update(raw).digest('hex');
  const expiresAt = opts.ttlSeconds ? new Date(Date.now() + opts.ttlSeconds * 1000) : new Date(Date.now() + 5 * 60 * 1000);

  await db.update(mcpConnectionTokens).set({
    tokenHash,
    hmacKeyId,
    expiresAt,
    sourceIp: opts.sourceIp ?? row.sourceIp,
  }).where(eq(mcpConnectionTokens.id, tokenId));

  // Audit: token refreshed
  try {
    const masked = `${raw.slice(0, 8)}...${raw.slice(-4)}`;
    audit('mcp.token.refreshed', {
      id: row.id,
      workspaceId: row.workspaceId,
      generatedBy: row.generatedBy,
      scopes: row.scopes,
      singleUse: row.singleUse,
      connectionType: row.connectionType,
      sourceIp: opts.sourceIp ?? row.sourceIp,
      expiresAt: expiresAt.toISOString(),
      maskedToken: masked,
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

export async function verifyAndConsumeToken(rawToken: string, workspaceId: string, opts?: { sourceIp?: string | null }) {
  // Build a keyed map of known secrets. Prefer reading from `process.env` so
  // test helpers that mutate `process.env` are immediately reflected even if
  // modules were previously imported. Fall back to the `env` module values.
  const splitList = (value?: string) =>
    (value ?? '')
      .toString()
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean) as string[];

  const rawOldSecrets = splitList(process.env.BETTER_AUTH_OLD_SECRETS ?? (Array.isArray(env.betterAuthOldSecrets) ? env.betterAuthOldSecrets.join(',') : ''));
  const oldMap: Record<string, string> = {};
  for (const item of rawOldSecrets) {
    const m = item.match(/^([^=:\s]+)[=:](.+)$/);
    if (m) oldMap[m[1]] = m[2];
  }

  const currentSecret = process.env.BETTER_AUTH_SECRET ?? env.betterAuthSecret;
  const keyedSecrets: Record<string, string> = { env: currentSecret, ...(oldMap ?? {}) };
  const fallbackSecrets = rawOldSecrets;

  // (no-op) keep verification deterministic; do not log secrets in tests

  const rowOrUpdated = await db.transaction(async (tx) => {
    let matchedRow: any = null;

    // First, try keyed secrets (prefer mapping by key id)
    const keyedIds = ['env', ...Object.keys(env.betterAuthOldSecretsMap ?? {})].filter(Boolean);
    for (const keyId of keyedIds) {
      const secret = keyedSecrets[keyId];
      if (!secret) continue;

      const tokenHash = createHmac('sha256', secret).update(rawToken).digest('hex');
      const rows = await tx
        .select()
        .from(mcpConnectionTokens)
        .where(and(eq(mcpConnectionTokens.tokenHash, tokenHash), eq(mcpConnectionTokens.workspaceId, workspaceId)))
        .limit(1);

      if (!rows[0]) continue;

      const candidate = rows[0];
      const storedKeyId = candidate.hmacKeyId ?? 'env';
      const preferredSecret = keyedSecrets[storedKeyId];

      

      // If the row records a key id that we can map to a secret, prefer verifying with that secret.
      if (preferredSecret) {
        const expected = createHmac('sha256', preferredSecret).update(rawToken).digest('hex');
        if (expected === candidate.tokenHash) {
          matchedRow = candidate;
          
          break;
        }

        // preferred secret didn't match; keep searching for other candidates
        continue;
      }

      // No preferred secret mapping available; do not accept a candidate that
      // references a key id we no longer have a mapping for. Continue searching
      // so we only verify tokens against known secrets.
      
      continue;
    }

    // Fallback: try unkeyed legacy secrets (preserve original behavior for plain-list configs)
    if (!matchedRow && fallbackSecrets.length) {
      for (const secret of fallbackSecrets) {
        // avoid re-checking secrets already covered by keyedSecrets
        if (Object.values(keyedSecrets).includes(secret)) continue;
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
        .where(and(eq(mcpConnectionTokens.id, row.id), eq(mcpConnectionTokens.status, 'active')))
        .returning();

      return updated[0] ?? null;
    }

    // Multi-use: update usedAt but keep status active.
    const updatedMulti = await tx
      .update(mcpConnectionTokens)
      .set({ usedAt: new Date(), usageCount: sql`coalesce(usage_count, 0) + 1` })
      .where(and(eq(mcpConnectionTokens.id, row.id), eq(mcpConnectionTokens.status, 'active')))
      .returning();

    return updatedMulti[0] ?? null;
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
