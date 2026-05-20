import express, { Router } from 'express';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from '../auth.js';
import { ensureUserDefaults, getUserById } from '../lib/platform.js';

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function mapSignUpError(message: string) {
  return /already|exist|duplicate/i.test(message) ? 'Email already registered.' : message;
}

function mapSignInError(message: string) {
  if (/user not found/i.test(message)) {
    return 'User not found.';
  }

  if (/invalid password/i.test(message)) {
    return 'Incorrect password.';
  }

  return message;
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
      const result = (await auth.api.signUpEmail({
        body: { name, email, password },
      })) as { user: { id: string } };

      await ensureUserDefaults(result.user.id);
      const user = await getUserById(result.user.id);
      res.json({ user });
    } catch (error) {
      const message = mapSignUpError(getErrorMessage(error, 'Registration failed.'));
      const status = /already|exist|duplicate/i.test(message) ? 400 : 500;
      res.status(status).json({ error: message });
    }
  });

  router.post('/sign-in', async (req, res) => {
    const { email, password } = req.body ?? {};
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }

    try {
      const result = (await auth.api.signInEmail({
        body: { email, password },
      })) as { user: { id: string } };

      await ensureUserDefaults(result.user.id);
      const user = await getUserById(result.user.id);
      res.json({ user });
    } catch (error) {
      const message = mapSignInError(getErrorMessage(error, 'Sign in failed.'));
      const status = /invalid|incorrect|not found|unauthorized/i.test(message) ? 401 : 500;
      res.status(status).json({ error: message });
    }
  });

  router.get('/session', async (req, res) => {
    try {
      const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
      if (!session) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const user = await getUserById(session.user.id);
      res.json({ user, session: session.session });
    } catch (error) {
      res.status(500).json({ error: getErrorMessage(error, 'Failed to resolve session.') });
    }
  });

  return router;
}