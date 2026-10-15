# Deployment configuration

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
list and does not add that origin to the auth/CSRF trust list. OAuth redirects
are ordinary browser navigation and do not require the redirect destination in
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
security settings explicitly. The `docker/` manifest loads secrets from the root
`.env` through `env_file`. Neither supplies application test keys by default.
Set public URLs and keys before deployment; the examples intentionally contain
empty placeholders and local URLs and are not production-ready configuration.

Configuration validity is separate from availability. `/api/v1/health/ready`
continues to require initialization, PostgreSQL connectivity, the expected schema,
and whichever Redis/object-storage dependencies are marked required. A passing
`check-env` does not claim those services are reachable.
