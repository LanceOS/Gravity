import cors from 'cors';
import express from 'express';
import { toNodeHandler } from 'better-auth/node';
import { auth } from './modules/auth/auth.js';
import { env } from './env.js';
import { createApiRouter } from './routes/index.js';
import { createAuthCompatibilityRouter } from './modules/auth/routes.js';
import { registerToolHandlers } from './modules/mcp/tool-handlers/registry.js';
import { registerMcpTools } from './modules/mcp/tools.js';
import { ticketToolDefinitions, ticketToolHandlers } from './modules/tickets/mcp.js';
import { workspaceToolDefinitions, workspaceToolHandlers } from './modules/workspaces/mcp.js';
import path from 'path';

let mcpRegistriesBootstrapped = false;

export function bootstrapMcpRegistries() {
  if (mcpRegistriesBootstrapped) {
    return;
  }

  registerToolHandlers(ticketToolHandlers);
  registerToolHandlers(workspaceToolHandlers);

  registerMcpTools(ticketToolDefinitions);
  registerMcpTools(workspaceToolDefinitions);

  mcpRegistriesBootstrapped = true;
}

export function createApp() {
  bootstrapMcpRegistries();

  const app = express();

  app.use(
    cors({
      origin: env.corsOrigins.length > 0 ? env.corsOrigins : true,
      credentials: true,
    }),
  );

  app.get('/', (_req, res) => {
    res.json({
      name: 'gravity-server',
      status: 'ready',
    });
  });

  app.use('/api/auth', createAuthCompatibilityRouter());
  app.all('/api/auth/*splat', toNodeHandler(auth));

  // Capture raw body bytes on the GitHub webhook route BEFORE the JSON parser
  // runs, so the HMAC-SHA256 signature verifier has access to the original bytes.
  app.use('/api/v1/webhooks/github', express.raw({ type: 'application/json' }));

  // All other routes use the standard JSON body parser.
  app.use(express.json({ limit: '1mb' }));

  app.use('/api/v1', createApiRouter());

  // Serve built client files when available. The build process copies the
  // client's `dist` into `public/` in the final image.
  const clientDist = path.join(process.cwd(), 'public');
  app.use(express.static(clientDist, { index: false }));

  // For any non-API request, serve the client's index.html (SPA fallback).
  app.get(/.*/, (req, res, next) => {
    if (req.path.startsWith('/api')) {
      return next();
    }
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