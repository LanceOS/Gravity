import { eq } from 'drizzle-orm';
import type { NextFunction, Request, Response } from 'express';
import { db } from '../db/index.js';
import { authUsers, userProfiles, validations } from '../db/schema.js';

export type WorkspaceAccessContext = {
  validationId: string;
  workspaceKey: string;
  workspaceId: string;
  userId: string;
  email: string;
  username: string;
  avatarUrl: string;
  role: string;
};

export type WorkspaceAccessLocals = {
  workspaceAccess: WorkspaceAccessContext | null;
};

export async function resolveWorkspaceAccessContext(workspaceKey: string) {
  const normalizedKey = workspaceKey.trim();
  if (!normalizedKey) {
    return null;
  }

  const rows = await db
    .select({
      validationId: validations.id,
      workspaceId: validations.workspaceId,
      guestUserId: validations.guestUserId,
      email: validations.email,
      workspacePrivateKey: validations.workspacePrivateKey,
      expiresAt: validations.expiresAt,
      isUsed: validations.isUsed,
      revokedAt: validations.revokedAt,
      username: authUsers.name,
      avatarUrl: userProfiles.avatarUrl,
      role: userProfiles.role,
    })
    .from(validations)
    .leftJoin(authUsers, eq(authUsers.id, validations.guestUserId))
    .leftJoin(userProfiles, eq(userProfiles.userId, validations.guestUserId))
    .where(eq(validations.workspacePrivateKey, normalizedKey))
    .limit(1);

  const row = rows[0];
  if (!row || !row.workspaceId || !row.guestUserId || !row.isUsed) {
    return null;
  }

  if (row.revokedAt) {
    return null;
  }

  if (row.expiresAt.getTime() < Date.now()) {
    return null;
  }

  return {
    validationId: row.validationId,
    workspaceKey: row.workspacePrivateKey,
    workspaceId: row.workspaceId,
    userId: row.guestUserId,
    email: row.email,
    username: row.username ?? row.email,
    avatarUrl: row.avatarUrl ?? '',
    role: row.role ?? 'guest_contributor',
  } satisfies WorkspaceAccessContext;
}

export async function optionalWorkspaceAccess(
  req: Request,
  res: Response<unknown, WorkspaceAccessLocals>,
  next: NextFunction,
) {
  const workspaceKey = req.header('x-workspace-key')?.trim();
  if (!workspaceKey) {
    res.locals.workspaceAccess = null;
    next();
    return;
  }

  try {
    const workspaceAccess = await resolveWorkspaceAccessContext(workspaceKey);
    if (!workspaceAccess) {
      res.status(401).json({ error: 'Invalid workspace access key.' });
      return;
    }

    res.locals.workspaceAccess = workspaceAccess;
    next();
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to validate workspace access key.' });
  }
}

export function getWorkspaceAccess(res: Response<unknown, WorkspaceAccessLocals>) {
  return res.locals.workspaceAccess ?? null;
}