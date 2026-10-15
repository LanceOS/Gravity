# CSP reporting (GRAV-45)

The enforced application-shell policy is sent as an HTTP header by both
`client/nginx.template.conf` and the direct server in `server/src/app.ts`.
Both include `report-uri /api/v1/csp-reports`. The same-origin nginx `/api`
proxy forwards reports to the server. No client-side script or third-party
collector is needed. `report-uri` is best-effort telemetry: browsers that do
not support it still enforce the policy.

The unauthenticated endpoint accepts the legacy `application/csp-report` body
and Reporting API `application/reports+json` batches. It is available while the
server is starting or dependencies are degraded. The server accepts at most
16 KiB per request, 20 entries per batch, and 120 requests per minute per
process. nginx also caps this route at 16 KiB and suppresses its access log and
forwarded client IP headers. Excess requests receive 429; oversized requests
receive 413. These limits favor application availability over complete
telemetry.

The server discards report bodies immediately after parsing. It never stores
document URLs, blocked URLs, source locations, script samples, referrers,
cookies, IP addresses, or raw request headers. It keeps only counts grouped by
a fixed CSP directive name and blocked-resource category (`inline`, `eval`,
`wasm-eval`, `self`, `data`, `blob`, `about`, `filesystem`, `network`, `other`,
or `unknown`). Unexpected directive names become `other`. At most 198 groups
are held in memory. Every minute, one structured `csp_violations` log entry
emits the counts and dropped/ignored totals, then clears the in-memory window.
No report data is written to the application database. Operational log
retention controls the lifetime of these aggregate entries; configure the
production log sink to retain them for no more than seven days.
If another reverse proxy sits in front of nginx, exclude this path from its
access logs as well. Report bodies are untrusted and unauthenticated, so these
counts indicate trends rather than authenticated events.

Monitor `csp_violations` for a sustained rise in counts, especially
`script-src`, `trusted-types`, or `require-trusted-types-for`. Reproduce a
suspected issue in a disposable environment before changing the policy: these
aggregates intentionally cannot identify a user or page. Check both
`client/nginx.template.conf` and `server/src/app.ts` when adding a resource
source or Trusted Types policy. The server parity test compares the complete
header values, and the production browser test checks the reporting directive
alongside editor behavior. The local CI script checks the deployed header.
