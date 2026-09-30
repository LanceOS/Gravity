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
`REDIS_REQUIRED=true` requires `REDIS_ENABLED=true`. Set non-default object
storage credentials and a nonempty bucket. `TRUSTED_PROXIES` accepts exact IPs or
CIDRs; see [proxy configuration](trusted-proxies.md).

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
