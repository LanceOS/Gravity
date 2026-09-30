import { parseApiJson } from './modules/notes/request-body.js';
import { noteErrorContext, noteErrorHandler } from './modules/notes/errors.js';
import cors from 'cors';
import express from 'express';
import { toNodeHandler } from 'better-auth/node';
import { auth } from './modules/auth/auth.js';
import { env } from './env.js';
import { createApiRouter } from './routes/index.js';
import { createAuthCompatibilityRouter } from './modules/auth/routes.js';
import { bootstrapMcpRegistries } from './modules/mcp/bootstrap.js';
import path from 'path';
import { createOAuthAuthorizationRouter } from './modules/mcp/oauth.js';
import { createHealthRouter } from './modules/health/routes.js';
import { requireInitializedServer } from './lib/admission.js';
import { isServerShuttingDown } from './lib/server-lifecycle.js';

export { bootstrapMcpRegistries } from './modules/mcp/bootstrap.js';

/**
 * Policy for HTML documents that bootstrap the single-page application.
 *
 * The frontend is served independently by nginx in the default deployment,
 * but the server image can also serve the same built assets from `public/`.
 * Keep this policy in sync with `client/nginx.template.conf`.
 */
export const APP_SHELL_CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "script-src 'self'",
  "style-src 'self' https://fonts.googleapis.com",
  // Keep React's existing style attributes working without permitting inline <style> blocks.
  "style-src-attr 'unsafe-inline'",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' https:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "manifest-src 'self'",
  'trusted-types gravity-editor dompurify ProseMirrorClipboard',
  "require-trusted-types-for 'script'",
].join('; ');

export function createApp() {
  bootstrapMcpRegistries();

  const app = express();

  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });

  app.use(
    cors({
      origin: env.corsOrigins.length > 0 ? env.corsOrigins : true,
      credentials: true,
    }),
  );

  app.use('/api/v1', createHealthRouter());
  app.use('/api/v1/notes', noteErrorContext);
  app.use(requireInitializedServer);

  app.get('/', (_req, res) => {
    res.status(isServerShuttingDown() ? 503 : 200).json({
      name: 'gravity-server',
      status: isServerShuttingDown() ? 'shutting_down' : 'ready',
    });
  });

  app.use('/api/auth', createAuthCompatibilityRouter());
  app.all('/api/auth/*splat', toNodeHandler(auth));

  // Capture raw body bytes on the GitHub webhook route BEFORE the JSON parser
  // runs, so the HMAC-SHA256 signature verifier has access to the original bytes.
  app.use('/api/v1/webhooks/github', express.raw({ type: 'application/json' }));

  // Note attachments retain their original byte stream. Other routes parse JSON.
  app.use(parseApiJson);

  app.use(createOAuthAuthorizationRouter());
  app.use('/api/v1', createApiRouter());
  app.use(noteErrorHandler);

  // Serve built client files when available. The build process copies the
  // client's `dist` into `public/` in the final image.
  const clientDist = path.join(process.cwd(), 'public');
  app.use(express.static(clientDist, {
    index: false,
    setHeaders(res, filePath) {
      if (filePath.endsWith('.html')) {
        res.setHeader('Content-Security-Policy', APP_SHELL_CONTENT_SECURITY_POLICY);
      }
    },
  }));

  // For any non-API request, serve the client's index.html (SPA fallback).
  app.get(/.*/, (req, res, next) => {
    if (req.path.startsWith('/api')) {
      return next();
    }
    res.setHeader('Content-Security-Policy', APP_SHELL_CONTENT_SECURITY_POLICY);
    res.sendFile(path.join(clientDist, 'index.html'), (err) => {
      if (err) next(err);
    });
  });

  // Fallback for API routes that are not found
  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  return app;
}
