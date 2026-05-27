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

  // Atomic validate-and-consume: update a row matching tokenHash, workspaceId, active status and non-expired
  const updated = await db.transaction(async (tx) => {
    const rows = await tx
      .update(mcpConnectionTokens)
      .set({ status: 'used', usedAt: new Date() })
      .where(
        and(
          eq(mcpConnectionTokens.tokenHash, tokenHash),
          eq(mcpConnectionTokens.workspaceId, workspaceId),
          eq(mcpConnectionTokens.status, 'active'),
          sql`${mcpConnectionTokens.expiresAt} > ${new Date()}`,
        ),
      )
      .returning();

    return rows[0];
  });

  // If no row returned, token invalid/used/expired
  if (!updated) {
    return null;
  }

  return {
    id: updated.id,
    workspaceId: updated.workspaceId,
    generatedBy: updated.generatedBy,
    scopes: updated.scopes,
    connectionType: updated.connectionType,
  };
}

export default {};
