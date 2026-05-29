# Ticket URL Base and Allowed Hosts

This document explains two environment variables used by the client to build ticket links and to validate that configured ticket URLs are safe.

* `VITE_TICKET_URL_BASE` — Optional base URL used to construct ticket links shown in the UI. Examples:
  * `https://tickets.example.com`
  * `/tickets` (relative path; used when the UI and tickets are served from the same origin)
* `VITE_ALLOWED_TICKET_HOSTS` — Comma-separated allowlist of hosts that are considered safe for `VITE_TICKET_URL_BASE`. If the provided base URL is not HTTPS or the host is not allowlisted, the client falls back to a safe placeholder: `https://tickets.placeholder.local`.

Supported `VITE_ALLOWED_TICKET_HOSTS` entry formats:

* Exact host: `example.com` — matches `example.com`.
* Wildcard subdomain: `*.example.com` — matches `api.example.com`, `tools.api.example.com`, etc. Does not match the root `example.com` unless `example.com` is also provided explicitly.
* Host with port: `example.com:8080` — matches that specific host and port pair.
* Wildcard all: `*` — allows any host (not recommended).

Examples:

VITE_ALLOWED_TICKET_HOSTS=example.com,\*.example.com,tickets.example.com:8080

Security guidance

* Set both variables at build/deploy time under your CI/CD (do not accept user input for these values at runtime).
* Prefer explicit hostnames or specific wildcard subdomains over `*`.
* If you use a relative `VITE_TICKET_URL_BASE` (starting with `/`), you do not need allowlist entries.


