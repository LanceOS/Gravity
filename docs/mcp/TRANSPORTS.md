# MCP connections and transports

Gravity exposes the same tool registry and execution policy over HTTP, stdio, and built-in chat. Tool metadata is registered by `server/src/modules/mcp/bootstrap.ts`. Workspace settings and connection grants are enforced again immediately before execution.

## Account settings and ChatGPT

Open **Account Preferences → Connect External AI**, or `/account?section=connections`. This page groups your own connections across your accessible workspaces, including expired and revoked connections. Select a workspace or use **New connection** on its card. Revoke takes effect immediately. Workspace-wide tool policy remains under **Workspace Settings → MCP Agent Tools**.

The connection dialog offers two client modes:

- **ChatGPT (OAuth sign-in):** copy the connection name and workspace-specific MCP server URL. Choose OAuth and automatic client registration in ChatGPT, then sign in to Gravity and approve individual tools. No manually generated token, workspace header, client ID, or client secret is needed.
- **Other clients (custom headers):** select permissions and a lifetime, then generate a credential. **Fields** provides individually copyable values; **JSON** provides the configuration to copy or download. Save credentials before closing: Gravity stores verification hashes and cannot reveal a previously issued credential.

ChatGPT must reach Gravity over public HTTPS or a configured Secure MCP Tunnel; a localhost URL by itself is not reachable from ChatGPT. Developer-mode availability depends on the ChatGPT account and workspace. See [OpenAI's connection guide](https://developers.openai.com/plugins/deploy/connect-chatgpt) and [OAuth requirements](https://developers.openai.com/plugins/build/auth).

### OAuth transport

The OAuth resource is `https://your-gravity-host/api/v1/workspaces/:workspaceId/mcp`. The URL fixes the workspace; another workspace URL cannot reuse its access token. This transport requires OAuth bearer authentication even when a browser session cookie is present. Legacy manually generated credentials continue to use `/api/v1/mcp` with both headers documented below.

Discovery is served at `/.well-known/oauth-authorization-server` and `/.well-known/oauth-protected-resource/api/v1/workspaces/:workspaceId/mcp`. The SDK authorization endpoints are `/authorize`, `/token`, `/register`, and `/revoke`. Both the nginx deployment and Vite development proxy forward these root paths to the backend. Configure `BETTER_AUTH_BASE_URL` with Gravity's public origin, and include the browser origin in trusted-origin/CORS settings. An external reverse proxy must forward discovery and OAuth routes as well as `/api`.

For split Vite/backend development, `BETTER_AUTH_BASE_URL` must be the frontend browser origin (for example `http://localhost:5173`), so the consent redirect and its Origin check address the same application. The production-style local test stack uses `http://localhost:9999`. OAuth permits HTTP only on `localhost` or `127.0.0.1`; other HTTP origins keep the application and manual MCP transport working while reporting OAuth unavailable. Use HTTPS to enable OAuth on a LAN/public hostname.

Gravity uses the MCP SDK authorization-code flow with mandatory PKCE S256 and dynamic registration of public clients (`token_endpoint_auth_method: none`). Existing Gravity sessions authenticate the consent page at `/oauth/consent`; consent binds the client, callback, workspace resource, session, and selected canonical tool scopes. Read tools are preselected; write access requires explicit selection and an eligible workspace role.

OAuth grants appear in the same account inventory as manually generated credentials. Access tokens expire after one hour and refresh within a 30-day grant. Revoking the connection ends both access and renewal. Tokens and authorization codes are stored as hashes; rotating refresh tokens retain replay detection. Workspace membership, current role, and workspace tool policy continue to constrain execution. OAuth renewal uses `/token`, not the manual credential refresh endpoint.

## HTTP client setup

Use a Streamable HTTP client with URL `https://your-gravity-host/api/v1/mcp` and these headers:

```json
{
  "Authorization": "Bearer <connection-token>",
  "X-Workspace-Id": "<workspace-id>"
}
```

An explicit bearer credential takes precedence over a browser session cookie: its scopes and revocation status still apply when both are present.

The endpoint is stateless. A client completes `initialize`, `notifications/initialized`, `tools/list`, and successive `tools/call` requests using the same reusable credential. POST returns JSON; valid notifications receive HTTP 202 without a body. GET and DELETE return 405 because this transport does not provide an SSE stream or server-side session resource. The old POST `/api/v1/mcp/sse` path remains an alias; it is not a legacy SSE transport. Application realtime updates use a separate channel.

Supported protocol versions are `2025-11-25`, `2025-06-18`, `2025-03-26`, and `2024-11-05`. Clients send the negotiated `MCP-Protocol-Version` header on subsequent requests. Supplied unsupported versions are rejected. Browser Origin headers must match configured `TRUSTED_ORIGINS`, `CORS_ORIGINS`, or the configured `BETTER_AUTH_BASE_URL` origin. Non-browser clients may omit Origin. Requests use `Content-Type: application/json` and accept JSON responses.

### Issue and manage credentials

An authenticated workspace member can POST `/api/v1/workspaces/:workspaceId/mcp/connection`:

```json
{
  "scopes": [
    "tools/list",
    "tools/call:list_projects",
    "tools/call:list_tickets",
    "tools/call:get_ticket"
  ],
  "singleUse": false,
  "ttlSeconds": 86400,
  "bindToIp": false
}
```

Credentials are reusable by default, expire after 24 hours by default, and permit only the explicitly selected operations. If scopes are omitted, the credential has only `tools/list` and cannot execute tools. The visible MCP tool list contains only permitted, enabled canonical tools. Use the settings catalog GET `/api/v1/workspaces/:workspaceId/mcp/tools` to select additional scopes; its `{ tools: [...] }` response includes descriptions, runtime schemas, aliases, annotations, exact scopes, `allowedForConnection`, and `policyParents` listing inherited workspace disablement controls.

Members may issue exact read-only tool scopes. Owner/admin permission is required to issue write scopes or the broad compatibility grants `tools/call` and `tools/call:*`. A write credential stops authorizing writes if its issuer is demoted. Issuer workspace access, credential expiry/revocation, and workspace tool settings are checked on use. MCP execution and connection management read membership and roles directly from the database, so a stale membership cache cannot preserve access or let a demoted administrator rotate another issuer’s credential. There is currently no project-specific credential restriction; grants apply within the selected workspace.

IP binding is opt-in because the browser issuing a credential and its external MCP client can use different networks. `bindToIp: true` binds the credential to the issuer's current source IP. Explicit `singleUse: true` remains available for one-off requests, but cannot complete a standard multi-request MCP lifecycle.

`ttlSeconds` must be an integer from 1 through 86400. Store the raw credential securely when it is returned; it is not retrievable later. Credential responses disable HTTP caching. GET `/api/v1/workspaces/:workspaceId/mcp/connections` lists metadata: members see their own credentials, owners/admins see all workspace credentials. POST `.../mcp/connection/:tokenId/revoke` revokes a credential. POST `.../mcp/connection/:tokenId/refresh` rotates its raw token and expiry; the previous raw token immediately stops working. Refresh preserves the choice of IP binding.

Creation and refresh share a limit of 10 requests per user and 60 per source IP in a sliding one-minute window. Revocation has its own counters with the same limits, so removing old credentials cannot block generation, and issuance throttling cannot prevent revocation. HTTP 429 responses include `Retry-After` and a JSON `retryAfterSeconds` value; the connection dialog displays that delay. Redis counters use explicit policy namespaces so unrelated operations cannot share a quota accidentally.

HMAC key rotation accepts API-issued credentials while the previous secret is retained in `BETTER_AUTH_OLD_SECRETS`, either as a plain secret or `key-id=secret`. Remove the retained secret to end that rotation window. Refresh moves the credential onto the current signing key.

## Local stdio clients

### Retired embedded agent command

`MCP_AGENT_COMMAND` is unsupported. The HTTP server does not launch agents or
interpret command strings. A non-empty value now fails environment validation
before either HTTP or standalone stdio startup, including values loaded from
`.env`; unset, empty, and whitespace-only values are accepted. Remove the key from environment files,
service definitions, and deployment configuration when upgrading. The validation
error does not echo the supplied command or any credentials it might contain.

Launch the standalone stdio entrypoint below through your MCP client or process
supervisor instead. Configure a trusted executable and a separate argument array
(for example, command `/usr/bin/node` and args
`["/opt/gravity/server/dist/modules/mcp/stdio.js"]`, adjusted to your installation).
Do not pass client-controlled values through a shell. Keep executable paths and
application files writable only by trusted administrators. Run the process as a
dedicated unprivileged OS user with only the credentials and filesystem access it
needs; process separation alone does not restrict privileges. The HTTP server
does not create this account or drop privileges for an external process.

### Standalone entrypoint

From the repository root, run `npm run --silent -w server mcp`. In a packaged deployment use `node dist/modules/mcp/stdio.js` from the server directory. Configure `DATABASE_URL`, `BETTER_AUTH_SECRET`, `NODE_IDENTITY_MASTER_KEY`, `MCP_STDIO_WORKSPACE_ID`, and `MCP_STDIO_ACTOR_USER_ID` in the process environment. The actor must have current access to that workspace. Do not accept these identity settings from untrusted client request arguments.

The standalone server initializes the database and tool registry. Standard input and output use one JSON-RPC message per line; logs and audit events go to stderr. Messages are limited to 10 MiB. The session class still accepts older Content-Length framed input; framed output requires explicit `framedOutput: true` and is not used by the standalone MCP server.

Closing stdin or sending SIGINT/SIGTERM stops the standalone session and closes its Redis bridge, shared Redis cache client, and database pool. This lets MCP clients stop the subprocess cleanly when they disconnect.

The standalone entry point uses fixed trusted context. Its optional embedded `stdio/handshake` extension is disabled by default. When enabled by an embedding application, only reusable tokens can establish a session; every subsequent request rechecks token hash, expiry, revocation, and issuer workspace access. Token refresh invalidates existing token-authenticated stdio sessions.

Embedded token handshakes require both `allowHandshake: true` and the administrator-controlled `MCP_STDIO_ALLOW_HANDSHAKE=true` environment setting. The standalone entrypoint always disables them, regardless of this setting. Only trusted local processes should have access to stdio or permission to launch the server; keep its environment and credentials under administrator control.

Each embedded session permits `MCP_STDIO_HANDSHAKE_MAX_ATTEMPTS` failed handshakes (default 20) within `MCP_STDIO_HANDSHAKE_WINDOW_MS` milliseconds (default 60000), measured from its first failure. Both settings must be positive safe integers; invalid settings reject session construction. Handshakes require a JSON-RPC 2.0 request with a string or finite numeric id and object params (when supplied). Malformed envelopes, missing/malformed credentials, rejected tokens, issuer membership failures, and verification errors count as failures. After the limit, requests receive JSON-RPC error `-32029` without token verification or consumption until the window expires. Blocked requests do not extend the window. Successful token authentication resets the counter; an empty context probe does not. Counters belong to the transport, so changing token/workspace does not evade the limit or lock out other sessions. Creating a new session resets this local protection, so process launch access must remain trusted.

## References and realtime

Stable database IDs are the default tool references and should be used across processes or replicas. Legacy `X-MCP-Sanitize: true` references are scoped to a workspace and actor, bounded to 5,000 references per scope and 1,000 scopes per process, and expire after one hour of inactivity. They do not survive process restarts or routing to another replica and do not replace authorization checks. Expired references are never reassigned to a different resource.

With Redis enabled, the MCP event bridge relays mutations between HTTP and stdio processes. Without Redis, realtime notifications are process-local. The bridge is a live notification channel, not a durable event log; consumers should reload current state after reconnecting.

The bridge channel includes the logical database selected by `REDIS_URL` (default `0`) and `MCP_EVENT_NAMESPACE` (default `default`). HTTP replicas and their stdio clients must use matching values. Set a separate `MCP_EVENT_NAMESPACE`, such as `staging` or `production`, for deployments sharing a Redis database. Compose passes this setting through from the environment. Channel names contain no Redis credentials. Explicit scoping is needed because [Redis Pub/Sub ignores logical database boundaries](https://redis.io/docs/latest/develop/pubsub/#database--scoping).

## Regression coverage

`npm run -w server test:config` checks legacy command rejection and standalone
stdio configuration without starting application services or accessing a database.

`server/tests/mcp-transport-lifecycle.test.ts` uses the official MCP SDK to initialize, discover tools, read, create, read back, and reject a revoked credential over HTTP. It also covers member read grants, catalog metadata, reusable defaults, optional IP binding, headers, notification responses, and API-issued HMAC rotation. `server/tests/mcp-stdio-sdk.test.ts` exercises the official SDK against a separate stdio process and verifies audit output stays off the protocol stream. Additional suites cover framing, token rotation/expiry/revocation, issuer removal, atomic single-use consumption, and scoped references.

`server/tests/mcp-stdio-shutdown.test.ts` verifies EOF and both shutdown signals release process resources. Bridge tests cover duplicate suppression, offline delivery, bounded publications, and Redis database/deployment isolation. A live Redis check also verified that matching processes relay a synthetic event while other databases and deployment namespaces do not receive it.
