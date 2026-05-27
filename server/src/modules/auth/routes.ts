import express, { Router, type Request, type Response as ExpressResponse } from 'express';
import { setResponse } from 'better-call/node';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from './auth.js';
import { env } from '../../env.js';
import { ensureUserDefaults, getUserById } from '../../lib/platform.js';

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

type JsonRecord = Record<string, unknown>;

type AuthPayload = JsonRecord & {
  error?: unknown;
  message?: unknown;
  user?: unknown;
  session?: unknown;
  success?: unknown;
};

type FetchResponse = globalThis.Response;

async function readJsonPayload(response: FetchResponse): Promise<AuthPayload | null> {
  const rawBody = await response.text();
  if (!rawBody) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawBody) as unknown;
    return typeof parsed === 'object' && parsed !== null ? (parsed as AuthPayload) : { value: parsed } as AuthPayload;
  } catch {
    return { message: rawBody } as AuthPayload;
  }
}

function extractAuthMessage(payload: AuthPayload | null, fallback: string) {
  const error = payload?.error;
  if (typeof error === 'string' && error.trim().length > 0) {
    return error;
  }

  const message = payload?.message;
  if (typeof message === 'string' && message.trim().length > 0) {
    return message;
  }

  return fallback;
}

function extractAuthUserId(payload: AuthPayload | null) {
  const user = payload?.user;
  if (!user || typeof user !== 'object') {
    return null;
  }

  const userId = (user as JsonRecord).id;
  return typeof userId === 'string' && userId.trim().length > 0 ? userId : null;
}

function createForwardedAuthHeaders(req: Request) {
  const headers = fromNodeHeaders(req.headers);
  const baseUrl = new URL(env.betterAuthBaseUrl);

  headers.set('host', baseUrl.host);
  headers.set('origin', baseUrl.origin);
  headers.set('referer', `${baseUrl.origin}/`);
  headers.delete('content-length');

  return headers;
}

function buildAuthUrl(authPath: string) {
  const normalizedPath = authPath.startsWith('/') ? authPath : `/${authPath}`;
  return new URL(`/api/auth${normalizedPath}`, env.betterAuthBaseUrl).toString();
}

async function forwardAuthRequest(req: Request, authPath: string) {
  const method = req.method.toUpperCase();
  const headers = createForwardedAuthHeaders(req);
  const requestInit: RequestInit = {
    method,
    headers,
  };

  if (method !== 'GET' && method !== 'HEAD' && req.body !== undefined) {
    headers.set('content-type', headers.get('content-type') || 'application/json');
    requestInit.body = JSON.stringify(req.body);
  }

  return auth.handler(new Request(buildAuthUrl(authPath), requestInit));
}

async function sendCompatibilityJson(
  res: ExpressResponse,
  sourceHeaders: Headers,
  status: number,
  payload: Record<string, unknown>,
) {
  // Build the response headers manually to avoid the Headers constructor
  // merging multiple Set-Cookie values into one comma-joined string, which
  // would corrupt the cookies before better-call's setResponse can split them.
  const headers = new Headers();
  headers.set('content-type', 'application/json');

  for (const [key, value] of sourceHeaders as Iterable<[string, string]>) {
    const lowerKey = key.toLowerCase();
    if (lowerKey === 'content-type' || lowerKey === 'content-length') {
      continue;
    }
    if (lowerKey === 'set-cookie') {
      headers.append(key, value);
    } else {
      headers.set(key, value);
    }
  }

  await setResponse(res, new Response(JSON.stringify(payload), { status, headers }));
}

export function createAuthCompatibilityRouter() {
  const router = Router();
  router.use(express.json());

  router.post('/sign-up', async (req, res) => {
    const { name, email, password } = req.body ?? {};
    if (!name || !email || !password) {
      res.status(400).json({ error: 'Name, email, and password are required.' });
      return;
    }

    try {
      const authResponse = await forwardAuthRequest(req, '/sign-up/email');
      const authPayload = await readJsonPayload(authResponse);
      if (!authResponse.ok) {
        await sendCompatibilityJson(res, authResponse.headers, authResponse.status, {
          error: extractAuthMessage(authPayload, 'Registration failed.'),
        });
        return;
      }

      const userId = extractAuthUserId(authPayload);
      if (!userId) {
        await sendCompatibilityJson(res, authResponse.headers, 502, {
          error: 'Registration succeeded but no user record was returned.',
        });
        return;
      }

      await ensureUserDefaults(userId);
      const user = await getUserById(userId);
      await sendCompatibilityJson(res, authResponse.headers, authResponse.status, { user });
    } catch (error) {
      const message = getErrorMessage(error, 'Registration failed.');
      res.status(500).json({ error: message });
    }
  });

  router.post('/sign-in', async (req, res) => {
    const { email, password } = req.body ?? {};
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }

    try {
      const authResponse = await forwardAuthRequest(req, '/sign-in/email');
      const authPayload = await readJsonPayload(authResponse);
      if (!authResponse.ok) {
        await sendCompatibilityJson(res, authResponse.headers, authResponse.status, {
          error: extractAuthMessage(authPayload, 'Sign in failed.'),
        });
        return;
      }

      const userId = extractAuthUserId(authPayload);
      if (!userId) {
        await sendCompatibilityJson(res, authResponse.headers, 502, {
          error: 'Sign in succeeded but no user record was returned.',
        });
        return;
      }

      await ensureUserDefaults(userId);
      const user = await getUserById(userId);
      await sendCompatibilityJson(res, authResponse.headers, authResponse.status, { user });
    } catch (error) {
      const message = getErrorMessage(error, 'Sign in failed.');
      res.status(500).json({ error: message });
    }
  });

  router.get('/session', async (req, res) => {
    try {
      const authResponse = await forwardAuthRequest(req, '/get-session');
      const authPayload = await readJsonPayload(authResponse);
      if (!authResponse.ok) {
        await sendCompatibilityJson(res, authResponse.headers, authResponse.status, {
          error: extractAuthMessage(authPayload, 'Unauthorized'),
        });
        return;
      }

      const userId = extractAuthUserId(authPayload);
      if (!userId) {
        await sendCompatibilityJson(res, authResponse.headers, 401, { error: 'Unauthorized' });
        return;
      }

      const user = await getUserById(userId);
      await sendCompatibilityJson(res, authResponse.headers, authResponse.status, {
        user,
        session: authPayload?.session ?? null,
      });
    } catch (error) {
      res.status(500).json({ error: getErrorMessage(error, 'Failed to resolve session.') });
    }
  });

  router.post('/sign-out', async (req, res) => {
    try {
      const authResponse = await forwardAuthRequest(req, '/sign-out');
      const authPayload = await readJsonPayload(authResponse);
      if (!authResponse.ok) {
        await sendCompatibilityJson(res, authResponse.headers, authResponse.status, {
          error: extractAuthMessage(authPayload, 'Sign out failed.'),
        });
        return;
      }

      await sendCompatibilityJson(res, authResponse.headers, authResponse.status, {
        success: authPayload?.success === true,
      });
    } catch (error) {
      res.status(500).json({ error: getErrorMessage(error, 'Sign out failed.') });
    }
  });

  return router;
}