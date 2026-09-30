# Client IPs and trusted proxies

Gravity uses `getRequestSourceIp` for client-IP rate limits and IP-bound MCP
credentials. `TRUSTED_PROXIES` is a comma-separated list of **exact proxy IPs or
IPv4/IPv6 CIDRs**. Empty means trust no proxies. Invalid entries fail startup.
There is no numeric hop-count mode: paths of different lengths must not turn a
client into a trusted proxy. Do not use public-client subnets, all-address CIDRs,
or broad private-network ranges unless every possible sender there is trusted.

The resolver starts with the TCP socket peer (not Express `req.ip`), then walks
`X-Forwarded-For` from right to left while the current hop matches this policy.
It stops at the first untrusted or malformed hop. `X-Real-IP` and `Forwarded` are
not fallback identity sources. IPv4-mapped IPv6 and equivalent IPv6 spellings
normalize to a single identity. Missing socket addresses use an unknown bucket.

Both production Compose entry points explicitly pass `TRUSTED_PROXIES` to the
backend; the development override inherits it. `server/docker-compose.yml`
provides dependencies only, so a separately launched server needs the variable
in its own environment. The default is deliberately empty: configure it before
using nginx in production, otherwise clients share nginx's rate-limit bucket.

## One nginx proxy

For `client -> nginx -> backend`, reserve nginx's address on the backend network
and set, for example, `TRUSTED_PROXIES=172.30.10.2` (replace this example with the
actual reserved address). Alternatively use a dedicated proxy-only CIDR if all
its members are trusted. Docker-assigned addresses may change on recreation;
do not copy a temporary address into a permanent deployment configuration.
Keep backend ports private and limit backend network access to trusted services.

The supplied nginx template overwrites `X-Forwarded-For` and `X-Real-IP` with
`$remote_addr` and removes `Forwarded`. It also overwrites `X-Forwarded-Host` with `$host`, on both `/api` and OAuth discovery/token
routes. A client-provided leftmost address cannot survive ingress. Two distinct
client socket addresses produce distinct backend rate-limit identities.

For direct backend access, leave `TRUSTED_PROXIES` empty. Forwarding headers are
ignored even if a caller supplies them. The development Vite proxy is not nginx;
configure and restrict its peer separately if client-IP separation is required.

## Load balancer before nginx

The stock template treats nginx as the public edge. With
`client -> load balancer -> nginx -> backend`, it intentionally reports the load
balancer as the client until nginx is configured to trust that upstream.
Supply a deployment-specific nginx configuration (based on the template) with
these directives in its `server` block:

```nginx
# Replace with actual, restricted load-balancer addresses/networks.
set_real_ip_from 192.0.2.20/32;
set_real_ip_from 2001:db8:20::/64;
real_ip_header X-Forwarded-For;
real_ip_recursive on;
```

Only trusted upstreams may set the client IP: the outermost public edge must
strip incoming client forwarding headers and write the observed socket address.
Each subsequent trusted upstream appends its observed peer. Configure nginx's
`set_real_ip_from` for those trusted upstreams only. Keep the template's
`X-Forwarded-For $remote_addr` overwrite: nginx now sends its validated client
address, so the backend still only needs to trust nginx's socket address.
Untrusted direct callers to nginx cannot activate real-IP rewriting. Verify the
nginx build has the real-IP module and validate the deployed config before use.

For a custom chain terminating directly at the backend, list each trusted
proxy's exact IP/CIDR in `TRUSTED_PROXIES`. The public edge must overwrite incoming
XFF, inner proxies append, and Gravity walks backward through these trusted hops
to the first untrusted client. Restrict backend ingress so clients cannot enter
through a trusted proxy network. Never replace this policy with Express
`trust proxy = true` or use `req.ip` for new client-IP consumers.

Changing from a shared proxy identity to individual client identities can
invalidate existing IP-bound MCP credentials; recreate affected credentials.

## Optional CSRF host fallback

CSRF uses the same validated exact-IP/CIDR matcher, but checks only the immediate
socket peer. With `CSRF_ALLOW_HOST_FALLBACK=true`, a request missing both Origin
and Referer may pass only with a single `X-Forwarded-Host` explicitly allowed by
the configured origins. For requests subject to CSRF origin checks, explicit
disallowed origins always fail; matching Host
headers cannot override them. Keep fallback disabled unless ingress provides
source-origin validation and overwrites forwarded hosts with validated values.
See [CSRF deployment requirements](CSRF_IMPLEMENTATION.md#proxy-deployment-note).

## Isolated validation

From `server/`, run `node node_modules/vitest/vitest.mjs run --config vitest.proxy.config.ts`
and `npm run typecheck`. The dedicated suite uses request
and Redis mocks with no database bootstrap or external services. It covers
spoofed XFF, direct access, trusted chains/CIDRs, malformed hops, IPv4/IPv6,
canonical identities, independent nginx client buckets, ingress directives, and
CSRF origin/host fallback policy.
It does not exercise a running nginx instance or deployment network topology.
