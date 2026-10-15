# Deployment configuration

## Compose secret setup

From the repository root, run `cp .env.example .env` before using any Compose
file. Keep `.env` private (`chmod 600 .env` on Unix). Generate five independent values with
`openssl rand -hex 32` and set `GRAVITY_POSTGRES_PASSWORD`,
`GRAVITY_REDIS_PASSWORD`, `BETTER_AUTH_SECRET`,
`NODE_IDENTITY_MASTER_KEY`, and `RUSTFS_SECRET_KEY`. The root and `docker/`
manifests require all five during Compose configuration;
`server/docker-compose.yml` requires the PostgreSQL, Redis, and RustFS service
passwords. The PostgreSQL and Redis entrypoints also exit immediately if either
password is empty. Do not use example placeholders or a shared secret. Use
URL-safe password characters because the app manifests place these values in
connection URLs.

`NODE_ENV=development` in `.env.example` is for a local stack. Production
Compose defaults to `NODE_ENV=production` when it is unset. In production, the
PostgreSQL and Redis entrypoints reject passwords shorter than 32 characters
and familiar placeholder values. The backend rejects known application and
storage secrets during its configuration check. Choose random values in every
environment; development mode only relaxes the service password length check.

Both app Compose files build `DATABASE_URL` and `REDIS_URL` from those values,
overriding any URL values in the backend's `env_file`. The service passwords
must contain only URL-unreserved letters, digits, `.`, `_`, `~`, or `-`; the
container entrypoints reject other characters before starting. Values from
`openssl rand -hex 32` meet this rule. For a backend run outside Compose,
configure both URLs explicitly, encoding passwords as URL components.

Run the `docker/` variant from the repository root with
`docker compose --env-file .env -f docker/docker-compose.yml up -d`, or from
`docker/` with `docker compose --env-file ../.env up -d`. Use the same `.env`
for `server/docker-compose.yml` (`--env-file ../.env` from `server/`).
The examples are templates only: copying one without setting the required
values causes Compose to fail before it creates containers. On a fresh checkout
without `.env`, Compose configuration fails; supply a completed `.env` before
running `up`.
Use `docker compose config --quiet` to validate a manifest without printing its
resolved environment. Compose environment variables remain visible to users
with access to the Docker API and the container configuration.
Run `node scripts/docker/compose-secrets.test.mjs` from the repository root to
check missing-secret failures and custom-password wiring across all three
Compose manifests; this check does not start containers.

Published ports in the root, `docker/`, and `server/` manifests bind to
`127.0.0.1` by default. The root and `docker/` manifests publish the frontend;
`server/` also publishes PostgreSQL, Redis, and RustFS for local development.
Set `GRAVITY_BIND_ADDRESS` only when you deliberately need another host
interface; `0.0.0.0` exposes these ports on every interface. Use an external
reverse proxy and firewall for public access. The internal Docker networks do
not replace host port access controls.

For production, also set the browser origin, storage credentials, and webhook
secret described below, then run the backend configuration check.

Run `npm --workspace=server run check-env` before deployment. This reads the same
configuration as startup, reports invalid fields without printing values, and
exits nonzero on failure. In a built production installation without dev dependencies,
run `node dist/check-env.js` from the server directory instead. It performs no
network calls or data changes. Startup
validates before opening HTTP listeners. Existing process environment values win
over `server/.env`, which wins over the root `.env` (run from the server workspace).

Generate each secret independently with `openssl rand -hex 32` (256 random bits).
`BETTER_AUTH_SECRET` and `NODE_IDENTITY_MASTER_KEY` accept strings; production
requires at least 32 UTF-8 bytes and rejects known test/placeholder values.
Hex and base64 encodings of 32 random bytes are suitable. Length checks cannot
prove entropy: do not use passwords or repeated/predictable strings.
`LOCAL_TESTING_KEK` is required only in development/test with credential features enabled, where the local KMS
provider accepts exactly 64 hex characters or exactly 32 raw UTF-8 bytes; base64
is not supported for this key. Production does not use this key: its KMS provider
is unsupported. `ENCRYPTED_CREDENTIALS_MODE` accepts only `disabled` or `required`.
Production defaults to `disabled`; development/test default to `required`.
Production `required` fails preflight and startup before any listener opens, even
if a local key is present. Disabled mode reports a startup/preflight warning and
exposes `encryptedCredentialsAvailable: false` in account settings. Credential
writes and cloud AI calls return an explicit unavailable error; saved key metadata
and deletion remain available. Production Compose defaults to `disabled`; the
development Compose override defaults to `required` (use `NODE_ENV=development`). Do not switch a public deployment
to development mode to work around this limitation.
Do not regenerate existing encryption keys casually: stored credentials and node
identities need their original keys to remain readable.

For production, set `NODE_ENV=production`, `BETTER_AUTH_BASE_URL` to the
browser-facing HTTPS OAuth origin, and explicit comma-separated `CORS_ORIGINS`
and `TRUSTED_ORIGINS`. Origins must have no credentials, wildcard, path, query,
or fragment. Equivalent origins (case, default port, trailing slash) are normalized
to the browser Origin format. Production rejects HTTP and localhost origins. Internal dependency
URLs may use HTTP and private service names. `DATABASE_URL` must use postgres or
postgresql; pgmem is accepted only in test mode. Redis URLs use redis/rediss.
Outside production, an unset or empty `CORS_ORIGINS` uses `TRUSTED_ORIGINS`
(which defaults to `http://localhost:<PORT>`). Set `CORS_ORIGINS` explicitly
to allow a separate browser origin during development; it replaces the fallback
list and does not add that origin to the auth/CSRF trust list. Origins in
`CORS_ORIGINS` but not `TRUSTED_ORIGINS` receive `Access-Control-Allow-Origin`
but not `Access-Control-Allow-Credentials`. Add a browser origin to both lists if
it needs cookie-based auth. OAuth redirects are ordinary browser navigation
and do not require the redirect destination in
`CORS_ORIGINS`.
`REDIS_REQUIRED=true` requires `REDIS_ENABLED=true`. Set non-default object
storage credentials and a nonempty bucket. `TRUSTED_PROXIES` accepts exact IPs or
CIDRs; see [proxy configuration](trusted-proxies.md).

For MCP bearer verification, `MCP_TOKEN_FAILURE_MAX_ATTEMPTS` defaults to 10
failed or concurrent verification attempts per source IP in
`MCP_TOKEN_FAILURE_WINDOW_MS` (default 60000).
Both settings must be positive integers; the maximums are 1000 attempts and one
hour. The next request after the threshold returns 429 until the window ends;
a successful verification releases its own reservation without clearing prior
failures. Configure
`TRUSTED_PROXIES` correctly so distinct clients have distinct source IPs.
For multiple server processes or replicas, enable Redis on every replica with
the same `REDIS_URL` and set `REDIS_REQUIRED=true` for dependency readiness.
Counters are shared through Redis. If configured Redis is unavailable before
verification, the request returns 503 with `Retry-After: 1`; it never switches to separate
per-replica counters. A Redis-disabled single-process deployment uses bounded
process-local counters. Reservation, completion, and expiry changes are atomic;
the reservation also repairs older counters that were left without a TTL.
If a valid credential was already verified when its reservation release fails,
that request completes and the conservative reservation expires with its window.

At the threshold, Gravity emits one structured `security.mcp_token_verification_failures`
alert per counter window. Route JSON logs with `securityAlert: true` and that
message to your alerting system; the event includes count, threshold and window,
but no bearer value, source IP, or workspace ID. For example, page on any such
event in a five-minute interval, or investigate a sustained rise across replicas.
`getThrottleMetrics()` also exposes process-local admitted `totalAttempts` and
`blockedEvents` counters for telemetry integrations; sum them across replicas.

Configure `GITHUB_WEBHOOK_SECRET` with the same independently generated random
secret in Gravity and GitHub. Production requires it (at least 32 bytes).
Development and test deployments without it reject deliveries with HTTP 503.
For local fixture testing only, explicitly set
`ALLOW_UNSIGNED_LOCAL_WEBHOOKS=true` with `NODE_ENV=development` or `test`.
Unsigned delivery is then allowed only from a direct IPv4/IPv6 loopback socket
without forwarding headers. Remote peers, containers on bridge networks, and
forwarded deliveries do not qualify. A configured signing secret always takes
precedence, even when this opt-in is set. Production rejects the opt-in.

The root Compose manifest forwards signing, proxy, origin, service-token, and
security settings explicitly. The `docker/` manifest loads other backend
settings from the root `.env` through `env_file`; both manifests construct
service connection URLs. Neither supplies
application test keys by default. Set public URLs and keys before deployment;
the examples intentionally contain empty placeholders and local URLs and are
not production-ready configuration.

Configuration validity is separate from availability. `/api/v1/health/ready`
continues to require initialization, PostgreSQL connectivity, the expected schema,
and whichever Redis/object-storage dependencies are marked required. A passing
`check-env` does not claim those services are reachable.
