import { createHmac, randomBytes } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { mcpConnectionTokens } from '../../db/schema.js';
import { createId } from '../../lib/platform.js';
import { env } from '../../env.js';

type CreateOptions = {
  workspaceId: string;
  generatedBy: string;
  scopes?: string[];
  connectionType?: string;
  sourceIp?: string | null;
  ttlSeconds?: number;
  singleUse?: boolean;
};

export async function createConnectionToken(opts: CreateOptions) {
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

  return {
    id,
    rawToken: raw,
    expiresAt: expiresAt.toISOString(),
    scopes: opts.scopes || ['tools/list', 'tools/call'],
  };
}

export async function revokeConnectionToken(tokenId: string, requestingUserId: string) {
  await db.update(mcpConnectionTokens).set({ status: 'revoked', revokedAt: new Date() }).where(eq(mcpConnectionTokens.id, tokenId));
}

export async function verifyAndConsumeToken(rawToken: string, workspaceId: string) {
  const tokenHash = createHmac('sha256', env.betterAuthSecret).update(rawToken).digest('hex');

  // Validate and return the token row. Respect `singleUse` tokens by
  // atomically marking them as used; allow reuse when `singleUse` is false.
  const rowOrUpdated = await db.transaction(async (tx) => {
    // Load row first to inspect `singleUse` and metadata.
    const rows = await tx
      .select()
      .from(mcpConnectionTokens)
      .where(and(eq(mcpConnectionTokens.tokenHash, tokenHash), eq(mcpConnectionTokens.workspaceId, workspaceId)))
      .limit(1);

    const row = rows[0];
    if (!row) return null;

    // Reject if not active or expired
    if (row.status !== 'active') return null;
    if (row.expiresAt && row.expiresAt <= new Date()) return null;

    if (row.singleUse) {
      // Atomic consume for single-use tokens.
      const updated = await tx
        .update(mcpConnectionTokens)
        .set({ status: 'used', usedAt: new Date() })
        .where(and(eq(mcpConnectionTokens.id, row.id), eq(mcpConnectionTokens.status, 'active')))
        .returning();

      return updated[0] ?? null;
    }

    // For multi-use tokens, update `usedAt` but keep status active so it can be reused.
    await tx.update(mcpConnectionTokens).set({ usedAt: new Date() }).where(eq(mcpConnectionTokens.id, row.id));
    return row;
  });

  if (!rowOrUpdated) return null;

  return {
    id: rowOrUpdated.id,
    workspaceId: rowOrUpdated.workspaceId,
    generatedBy: rowOrUpdated.generatedBy,
    scopes: rowOrUpdated.scopes,
    connectionType: rowOrUpdated.connectionType,
  };
}

export default {};
