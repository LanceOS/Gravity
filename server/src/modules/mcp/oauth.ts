import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Router, type Request } from 'express';
import { and, eq, gt, isNull, or, sql } from 'drizzle-orm';
import { fromNodeHeaders } from 'better-auth/node';
import type { OAuthServerProvider } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js';
import type { OAuthClientInformationFull, OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js';
import { InvalidClientMetadataError, InvalidGrantError, InvalidRequestError, InvalidScopeError, InvalidTokenError } from '@modelcontextprotocol/sdk/server/auth/errors.js';
import { createOAuthMetadata, mcpAuthRouter } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { db } from '../../db/index.js';
import { env } from '../../env.js';
import { auth } from '../auth/auth.js';
import { resolveRequestActorUserId } from '../auth/utils/request-auth.js';
import { workspaces } from '../workspaces/schema.js';
import { mcpConnectionTokens, mcpOAuthClients, mcpOAuthGrants, mcpOAuthRefreshTokens, mcpOAuthRequests } from './schema.js';
import { getMcpWorkspaceRole } from './access.js';
import { getAvailableTools } from './policy.js';
import { getDisabledTools } from './workspace-tools.js';
import { listCanonicalTools } from './tools.js';
import { createRateLimiter } from '../../lib/rateLimit.js';
import { createRedisRateLimiter } from '../../lib/rateLimitRedis.js';
import { getRequestSourceIp } from '../../lib/request-ip.js';

export const OAUTH_GRANT_TTL_SECONDS = 30 * 24 * 60 * 60;
export const OAUTH_ACCESS_TTL_SECONDS = 60 * 60;
const REQUEST_TTL_MS = 10 * 60 * 1000;
const CODE_TTL_MS = 2 * 60 * 1000;
const opaqueToken = () => randomBytes(32).toString('base64url');
const tokenHash = (value: string) => createHash('sha256').update(value).digest('hex');
const scopeFor = (name: string) => `tools/call:${name}`;
const publicBase = () => new URL(env.betterAuthBaseUrl).origin;
export const OAUTH_DISABLED_MESSAGE = 'OAuth sign-in requires an HTTPS Gravity URL. HTTP is supported only on localhost or 127.0.0.1 for local testing. Manual connections remain available.';

export function isMcpOAuthEnabled(baseUrl = env.betterAuthBaseUrl): boolean {
  try {
    const issuer = new URL(baseUrl);
    // Match the SDK's supported HTTP loopback hosts without opting into its
    // dangerous insecure-issuer override. Other HTTP deployments still run.
    return issuer.protocol === 'https:' || (issuer.protocol === 'http:'
      && ['localhost', '127.0.0.1'].includes(issuer.hostname));
  } catch {
    return false;
  }
}

export const oauthResourceUrl = (workspaceId: string) => `${publicBase()}/api/v1/workspaces/${encodeURIComponent(workspaceId)}/mcp`;
export const oauthResourceMetadataUrl = (workspaceId: string) => `${publicBase()}/.well-known/oauth-protected-resource/api/v1/workspaces/${encodeURIComponent(workspaceId)}/mcp`;
const supportedScopes = () => ['tools/list', ...listCanonicalTools().map((tool) => scopeFor(tool.name))];

function resourceWorkspace(resource?: URL): string {
  const match = resource?.pathname.match(/^\/api\/v1\/workspaces\/([^/]+)\/mcp$/);
  if (!resource || resource.origin !== publicBase() || !match || resource.search || resource.hash) {
    throw new InvalidRequestError('A Gravity workspace MCP resource URL is required.');
  }
  let workspaceId: string;
  try { workspaceId = decodeURIComponent(match[1]); } catch { throw new InvalidRequestError('Invalid resource URL.'); }
  if (resource.href !== oauthResourceUrl(workspaceId)) throw new InvalidRequestError('Invalid resource URL.');
  return workspaceId;
}

async function allowedTools(workspaceId: string, actorUserId: string, query: Pick<typeof db, 'select'> = db) {
  const role = await getMcpWorkspaceRole(workspaceId, actorUserId, query);
  if (!role) throw new InvalidGrantError('Workspace access is no longer available.');
  return getAvailableTools(await getDisabledTools(workspaceId, query)).filter((tool) =>
    tool.annotations?.readOnlyHint === true || role === 'owner' || role === 'admin');
}

async function assertCurrentGrantScopes(workspaceId: string, actorUserId: string, scopes: string[], query: Pick<typeof db, 'select'> = db) {
  const allowed = new Set(['tools/list', ...(await allowedTools(workspaceId, actorUserId, query)).map((tool) => scopeFor(tool.name))]);
  if (scopes.some((scope) => !allowed.has(scope))) throw new InvalidGrantError('Granted permissions changed; connect again.');
}

const clientsStore: OAuthRegisteredClientsStore = {
  async getClient(clientId) {
    const [row] = await db.select().from(mcpOAuthClients).where(eq(mcpOAuthClients.id, clientId)).limit(1);
    return row?.metadata;
  },
  async registerClient(client) {
    if (client.token_endpoint_auth_method && client.token_endpoint_auth_method !== 'none') {
      throw new InvalidClientMetadataError('Only public clients using PKCE and token_endpoint_auth_method none are supported.');
    }
    if (client.redirect_uris.length < 1 || client.redirect_uris.length > 10 || (client.client_name?.length ?? 0) > 200) {
      throw new InvalidClientMetadataError('Invalid client metadata.');
    }
    for (const uri of client.redirect_uris) {
      const url = new URL(uri);
      const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
      if (url.hash || url.username || url.password || uri.includes('*') || uri.length > 2048
        || (url.protocol !== 'https:' && !(loopback && url.protocol === 'http:'))) {
        throw new InvalidClientMetadataError('Redirect URIs must use HTTPS or loopback HTTP and cannot contain fragments.');
      }
    }
    if (client.grant_types?.some((grant) => !['authorization_code', 'refresh_token'].includes(grant))
      || client.response_types?.some((type) => type !== 'code')) throw new InvalidClientMetadataError('Unsupported OAuth grant or response type.');
    // Whitelist persisted metadata. The SDK may generate a default secret when
    // the client omits its auth method; this server deliberately returns none.
    const registered: OAuthClientInformationFull = {
      client_id: randomUUID(), client_id_issued_at: Math.floor(Date.now() / 1000),
      client_name: client.client_name || 'External AI client', redirect_uris: client.redirect_uris,
      token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'],
    };
    await db.insert(mcpOAuthClients).values({ id: registered.client_id, metadata: registered });
    return registered;
  },
};

export const gravityOAuthProvider: OAuthServerProvider = {
  clientsStore,
  async authorize(client, params, res) {
    const workspaceId = resourceWorkspace(params.resource);
    if (!/^[A-Za-z0-9_-]{43}$/.test(params.codeChallenge)) throw new InvalidRequestError('A valid S256 PKCE challenge is required.');
    if ((params.state?.length ?? 0) > 2048) throw new InvalidRequestError('State is too long.');
    const scopes = [...new Set(params.scopes?.length ? params.scopes : supportedScopes())];
    if (scopes.some((scope) => !supportedScopes().includes(scope))) throw new InvalidScopeError('Unknown tool permission.');
    const [workspace] = await db.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
    if (!workspace) throw new InvalidRequestError('Workspace resource was not found.');
    const requestId = opaqueToken();
    await db.insert(mcpOAuthRequests).values({ id: requestId, clientId: client.client_id, workspaceId,
      resource: params.resource!.href, redirectUri: params.redirectUri, state: params.state,
      codeChallenge: params.codeChallenge, requestedScopes: scopes, expiresAt: new Date(Date.now() + REQUEST_TTL_MS) });
    res.redirect(`${publicBase()}/oauth/consent?request=${encodeURIComponent(requestId)}`);
  },
  async challengeForAuthorizationCode(client, code) {
    const [request] = await db.select().from(mcpOAuthRequests).where(and(eq(mcpOAuthRequests.codeHash, tokenHash(code)),
      eq(mcpOAuthRequests.clientId, client.client_id), eq(mcpOAuthRequests.status, 'approved'),
      gt(mcpOAuthRequests.codeExpiresAt, new Date()))).limit(1);
    if (!request) throw new InvalidGrantError('Invalid or expired authorization code.');
    return request.codeChallenge;
  },
  async exchangeAuthorizationCode(client, code, _verifier, redirectUri, resource) {
    resourceWorkspace(resource);
    const now = new Date();
    const accessToken = opaqueToken();
    const refreshToken = opaqueToken();
    return db.transaction(async (tx) => {
      const [request] = await tx.update(mcpOAuthRequests).set({ status: 'consumed' }).where(and(
        eq(mcpOAuthRequests.codeHash, tokenHash(code)), eq(mcpOAuthRequests.clientId, client.client_id),
        eq(mcpOAuthRequests.status, 'approved'), eq(mcpOAuthRequests.resource, resource!.href),
        eq(mcpOAuthRequests.redirectUri, redirectUri ?? ''), gt(mcpOAuthRequests.codeExpiresAt, now),
      )).returning();
      if (!request?.actorUserId || !request.approvedScopes) throw new InvalidGrantError('Invalid, expired, or already used authorization code.');
      await assertCurrentGrantScopes(request.workspaceId, request.actorUserId, request.approvedScopes, tx);
      const connectionId = randomUUID();
      const grantExpiresAt = new Date(now.getTime() + OAUTH_GRANT_TTL_SECONDS * 1000);
      await tx.insert(mcpConnectionTokens).values({ id: connectionId, workspaceId: request.workspaceId,
        tokenHash: tokenHash(accessToken), hmacKeyId: 'oauth-v1', scopes: request.approvedScopes,
        expiresAt: grantExpiresAt, singleUse: false, generatedBy: request.actorUserId, connectionType: 'oauth' });
      await tx.insert(mcpOAuthGrants).values({ connectionId, clientId: client.client_id, resource: request.resource,
        accessExpiresAt: new Date(now.getTime() + OAUTH_ACCESS_TTL_SECONDS * 1000) });
      await tx.insert(mcpOAuthRefreshTokens).values({ tokenHash: tokenHash(refreshToken), connectionId, expiresAt: grantExpiresAt });
      return { access_token: accessToken, token_type: 'Bearer', expires_in: OAUTH_ACCESS_TTL_SECONDS,
        refresh_token: refreshToken, scope: request.approvedScopes.join(' ') };
    });
  },
  async exchangeRefreshToken(client, refreshToken, scopes, resource) {
    resourceWorkspace(resource);
    const result = await db.transaction(async (tx): Promise<OAuthTokens | null> => {
      const [found] = await tx.select({ refresh: mcpOAuthRefreshTokens, grant: mcpOAuthGrants })
        .from(mcpOAuthRefreshTokens).innerJoin(mcpOAuthGrants, eq(mcpOAuthGrants.connectionId, mcpOAuthRefreshTokens.connectionId))
        .where(and(eq(mcpOAuthRefreshTokens.tokenHash, tokenHash(refreshToken)), eq(mcpOAuthGrants.clientId, client.client_id),
          eq(mcpOAuthGrants.resource, resource!.href))).limit(1);
      if (!found) throw new InvalidGrantError('Invalid refresh token.');
      // Serialize the entire family, including replay checks, with revocation.
      const [connection] = await tx.select().from(mcpConnectionTokens).where(eq(mcpConnectionTokens.id, found.grant.connectionId)).for('update');
      const now = new Date();
      if (!connection || connection.status !== 'active' || !connection.expiresAt || connection.expiresAt <= now
        || found.refresh.expiresAt <= now) throw new InvalidGrantError('Expired or revoked authorization.');
      const nextScopes = [...new Set(scopes ?? connection.scopes)];
      if (nextScopes.some((scope) => !connection.scopes.includes(scope))) throw new InvalidScopeError('Refresh cannot add permissions.');
      await assertCurrentGrantScopes(connection.workspaceId, connection.generatedBy, nextScopes, tx);
      const [claimed] = await tx.update(mcpOAuthRefreshTokens).set({ usedAt: now }).where(and(
        eq(mcpOAuthRefreshTokens.tokenHash, tokenHash(refreshToken)), isNull(mcpOAuthRefreshTokens.usedAt))).returning();
      if (!claimed) {
        await tx.update(mcpConnectionTokens).set({ status: 'revoked', revokedAt: now }).where(eq(mcpConnectionTokens.id, connection.id));
        return null; // Commit replay revocation before returning an OAuth error.
      }
      const nextAccess = opaqueToken();
      const nextRefresh = opaqueToken();
      const accessExpiresAt = new Date(Math.min(now.getTime() + OAUTH_ACCESS_TTL_SECONDS * 1000, connection.expiresAt.getTime()));
      await tx.update(mcpConnectionTokens).set({ tokenHash: tokenHash(nextAccess), scopes: nextScopes }).where(eq(mcpConnectionTokens.id, connection.id));
      await tx.update(mcpOAuthGrants).set({ accessExpiresAt }).where(eq(mcpOAuthGrants.connectionId, connection.id));
      await tx.insert(mcpOAuthRefreshTokens).values({ tokenHash: tokenHash(nextRefresh), connectionId: connection.id, expiresAt: connection.expiresAt });
      return { access_token: nextAccess, token_type: 'Bearer', expires_in: Math.floor((accessExpiresAt.getTime() - now.getTime()) / 1000),
        refresh_token: nextRefresh, scope: nextScopes.join(' ') };
    });
    if (!result) throw new InvalidGrantError('Refresh token reuse detected; authorization revoked.');
    return result;
  },
  async verifyAccessToken(token) {
    const now = new Date();
    const hash = tokenHash(token);
    const [row] = await db.select({ connection: mcpConnectionTokens, grant: mcpOAuthGrants }).from(mcpConnectionTokens)
      .innerJoin(mcpOAuthGrants, eq(mcpOAuthGrants.connectionId, mcpConnectionTokens.id))
      .where(and(eq(mcpConnectionTokens.tokenHash, hash), eq(mcpConnectionTokens.connectionType, 'oauth'),
        eq(mcpConnectionTokens.status, 'active'), gt(mcpConnectionTokens.expiresAt, now), gt(mcpOAuthGrants.accessExpiresAt, now))).limit(1);
    if (!row || !await getMcpWorkspaceRole(row.connection.workspaceId, row.connection.generatedBy)) throw new InvalidTokenError('Invalid or expired token.');
    const [current] = await db.update(mcpConnectionTokens).set({ usedAt: now, usageCount: sql`${mcpConnectionTokens.usageCount} + 1` })
      .where(and(eq(mcpConnectionTokens.id, row.connection.id), eq(mcpConnectionTokens.tokenHash, hash), eq(mcpConnectionTokens.status, 'active'))).returning({ id: mcpConnectionTokens.id });
    if (!current) throw new InvalidTokenError('Invalid or expired token.');
    return { token, clientId: row.grant.clientId, scopes: row.connection.scopes,
      expiresAt: Math.floor(row.grant.accessExpiresAt.getTime() / 1000), resource: new URL(row.grant.resource),
      extra: { actorUserId: row.connection.generatedBy, workspaceId: row.connection.workspaceId } };
  },
  async revokeToken(client, { token }) {
    const hash = tokenHash(token);
    const [row] = await db.select({ connectionId: mcpOAuthGrants.connectionId }).from(mcpOAuthGrants)
      .innerJoin(mcpConnectionTokens, eq(mcpConnectionTokens.id, mcpOAuthGrants.connectionId))
      .leftJoin(mcpOAuthRefreshTokens, eq(mcpOAuthRefreshTokens.connectionId, mcpOAuthGrants.connectionId))
      .where(and(eq(mcpOAuthGrants.clientId, client.client_id), or(eq(mcpConnectionTokens.tokenHash, hash), eq(mcpOAuthRefreshTokens.tokenHash, hash)))).limit(1);
    if (row) await db.update(mcpConnectionTokens).set({ status: 'revoked', revokedAt: new Date() }).where(eq(mcpConnectionTokens.id, row.connectionId));
  },
};

export function createOAuthAuthorizationRouter() {
  const router = Router();
  if (!isMcpOAuthEnabled()) {
    // Explicit responses prevent the SPA fallback from advertising HTML as
    // OAuth metadata. Leave ordinary app routes and manual MCP unchanged.
    router.all(['/authorize', '/token', '/register', '/revoke', '/.well-known/oauth-authorization-server',
      '/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/api/v1/workspaces/:workspaceId/mcp'],
    (_req, res) => { res.status(404).json({ error: OAUTH_DISABLED_MESSAGE }); });
    return router;
  }
  const issuerUrl = new URL(publicBase());
  const scopesSupported = supportedScopes();
  const metadata = createOAuthMetadata({ provider: gravityOAuthProvider, issuerUrl, scopesSupported });
  router.get('/.well-known/oauth-authorization-server', (_req, res) => res.json({ ...metadata,
    token_endpoint_auth_methods_supported: ['none'], revocation_endpoint_auth_methods_supported: ['none'] }));
  router.get('/.well-known/oauth-protected-resource/api/v1/workspaces/:workspaceId/mcp', async (req, res) => {
    const [workspace] = await db.select({ name: workspaces.name }).from(workspaces).where(eq(workspaces.id, req.params.workspaceId)).limit(1);
    if (!workspace) { res.status(404).json({ error: 'Workspace not found.' }); return; }
    res.json({ resource: oauthResourceUrl(req.params.workspaceId), authorization_servers: [issuerUrl.href],
      scopes_supported: scopesSupported, bearer_methods_supported: ['header'], resource_name: 'Gravity workspace' });
  });
  const createLimiter = env.redisEnabled ? createRedisRateLimiter : createRateLimiter;
  for (const [path, max, windowMs] of [['/authorize', 100, 900_000], ['/token', 50, 900_000], ['/register', 20, 3_600_000], ['/revoke', 50, 900_000]] as const) {
    router.use(path, createLimiter({ namespace: `mcp.oauth.${path.slice(1)}.ip`, max, windowMs,
      keyFn: (req) => `ip:${getRequestSourceIp(req) ?? req.ip}` }));
  }
  router.use(mcpAuthRouter({ provider: gravityOAuthProvider, issuerUrl, scopesSupported,
    authorizationOptions: { rateLimit: false }, clientRegistrationOptions: { rateLimit: false },
    tokenOptions: { rateLimit: false }, revocationOptions: { rateLimit: false } }));
  return router;
}

async function consentSession(req: Request) {
  // OAuth consent always needs a real browser session; dev identity headers and
  // other bearer credentials must never authorize an external application.
  return auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
}

export function createOAuthConsentRouter() {
  const router = Router();
  router.get('/workspaces/:workspaceId/mcp/setup', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const actor = await resolveRequestActorUserId(req);
    if (!actor) { res.status(401).json({ error: 'Authentication required.' }); return; }
    if (!await getMcpWorkspaceRole(req.params.workspaceId, actor)) { res.status(403).json({ error: 'Unauthorized workspace access.' }); return; }
    const oauthEnabled = isMcpOAuthEnabled();
    res.json({ mcpEndpoint: oauthResourceUrl(req.params.workspaceId), oauthEnabled,
      ...(!oauthEnabled ? { message: OAUTH_DISABLED_MESSAGE } : {}) });
  });
  router.use('/mcp/oauth', (_req, res, next) => {
    if (!isMcpOAuthEnabled()) { res.status(503).json({ error: OAUTH_DISABLED_MESSAGE }); return; }
    next();
  });
  router.get('/mcp/oauth/requests/:requestId', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const session = await consentSession(req);
    if (!session) { res.status(401).json({ error: 'Sign in to review this connection.' }); return; }
    const [request] = await db.select().from(mcpOAuthRequests).where(and(eq(mcpOAuthRequests.id, req.params.requestId),
      eq(mcpOAuthRequests.status, 'pending'), gt(mcpOAuthRequests.expiresAt, new Date()))).limit(1);
    if (!request) { res.status(409).json({ error: 'This request expired or has already been handled. Start the connection again.' }); return; }
    try {
      const tools = await allowedTools(request.workspaceId, session.user.id);
      const [claimed] = await db.update(mcpOAuthRequests).set({ actorUserId: session.user.id, sessionId: session.session.id })
        .where(and(eq(mcpOAuthRequests.id, request.id), eq(mcpOAuthRequests.status, 'pending'), gt(mcpOAuthRequests.expiresAt, new Date()),
          or(isNull(mcpOAuthRequests.sessionId), and(eq(mcpOAuthRequests.sessionId, session.session.id), eq(mcpOAuthRequests.actorUserId, session.user.id))))).returning();
      if (!claimed) { res.status(409).json({ error: 'This request belongs to a different sign-in session. Start the connection again.' }); return; }
      const [workspace] = await db.select({ id: workspaces.id, name: workspaces.name, key: workspaces.key }).from(workspaces).where(eq(workspaces.id, request.workspaceId)).limit(1);
      const client = await clientsStore.getClient(request.clientId);
      res.json({ requestId: request.id, client: { name: client?.client_name ?? 'External AI client', redirectUri: request.redirectUri },
        workspace, expiresAt: request.expiresAt, grantTtlSeconds: OAUTH_GRANT_TTL_SECONDS, accessTokenTtlSeconds: OAUTH_ACCESS_TTL_SECONDS,
        requestedScopes: request.requestedScopes, tools: tools.filter((tool) => request.requestedScopes.includes(scopeFor(tool.name)))
          .map((tool) => ({ name: tool.name, description: tool.description, scope: scopeFor(tool.name), readOnly: tool.annotations?.readOnlyHint === true })) });
    } catch (error) {
      if (error instanceof InvalidGrantError) { res.status(403).json({ error: error.message }); return; }
      throw error;
    }
  });
  router.post('/mcp/oauth/requests/:requestId', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    // Do not accept the generic API middleware's Authorization-header bypass.
    if (req.get('origin') !== publicBase()) { res.status(403).json({ error: 'A matching Origin header is required.' }); return; }
    const session = await consentSession(req);
    if (!session) { res.status(401).json({ error: 'Sign in to review this connection.' }); return; }
    if (typeof req.body?.approved !== 'boolean' || (req.body.scopes !== undefined && (!Array.isArray(req.body.scopes)
      || req.body.scopes.some((scope: unknown) => typeof scope !== 'string') || req.body.scopes.length > 100))) {
      res.status(400).json({ error: 'A consent decision and valid tool permissions are required.' }); return;
    }
    const [request] = await db.select().from(mcpOAuthRequests).where(and(eq(mcpOAuthRequests.id, req.params.requestId),
      eq(mcpOAuthRequests.status, 'pending'), eq(mcpOAuthRequests.actorUserId, session.user.id), eq(mcpOAuthRequests.sessionId, session.session.id),
      gt(mcpOAuthRequests.expiresAt, new Date()))).limit(1);
    if (!request) { res.status(409).json({ error: 'This request expired or does not belong to this session. Start the connection again.' }); return; }
    const redirect = new URL(request.redirectUri);
    if (request.state) redirect.searchParams.set('state', request.state);
    const code = opaqueToken();
    const scopes = [...new Set<string>(['tools/list', ...(req.body.scopes ?? [])])];
    if (req.body.approved) {
      try {
        if (scopes.some((scope) => scope !== 'tools/list' && !request.requestedScopes.includes(scope))) throw new InvalidScopeError('A permission was not requested by this client.');
        await assertCurrentGrantScopes(request.workspaceId, session.user.id, scopes);
      } catch (error) {
        if (error instanceof InvalidGrantError || error instanceof InvalidScopeError) { res.status(403).json({ error: error.message }); return; }
        throw error;
      }
    }
    const [updated] = await db.update(mcpOAuthRequests).set(req.body.approved
      ? { status: 'approved', approvedScopes: scopes, codeHash: tokenHash(code), codeExpiresAt: new Date(Date.now() + CODE_TTL_MS) }
      : { status: 'denied' }).where(and(eq(mcpOAuthRequests.id, request.id), eq(mcpOAuthRequests.status, 'pending'),
        eq(mcpOAuthRequests.sessionId, session.session.id), gt(mcpOAuthRequests.expiresAt, new Date()))).returning();
    if (!updated) { res.status(409).json({ error: 'This request expired or has already been handled.' }); return; }
    if (req.body.approved) redirect.searchParams.set('code', code);
    else redirect.searchParams.set('error', 'access_denied');
    res.json({ redirectUrl: redirect.href });
  });
  return router;
}
