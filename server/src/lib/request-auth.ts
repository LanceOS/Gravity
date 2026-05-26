import type { Request } from 'express';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from '../auth.js';

export async function resolveRequestActorUserId(req: Request) {
  try {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    return session?.user.id ?? null;
  } catch {
    return null;
  }
}