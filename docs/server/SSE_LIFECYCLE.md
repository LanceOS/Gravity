# SSE buffering and shutdown

Gravity's workspace SSE streams use the same writer for initial messages,
broadcasts, and 15-second comment heartbeats. The writer checks the UTF-8 frame
size plus Node's pending response bytes against a 64 KiB per-stream limit before
writing. Oversized broadcasts become a constant-size `resync-required` event
without copying any payload fields; healthy subscribers stay connected. This
limit covers application/Node
response buffering, not kernel TCP buffers or the temporary serialized broadcast
payload shared across recipients.

There is no application event queue. When `write()` returns false, the stream has
up to five seconds to emit `drain`. A second frame arriving before drainage, or
expiry of that deadline, destroys the slow stream. A healthy peer can therefore
drain one larger frame without being disconnected merely for reaching Node's
high-water mark. Slow peers cannot accumulate additional queued events or block
other subscribers. Closed/erroring streams release their workspace, user, and
token registry entries, listeners, heartbeat, and drain timeout.

Clients reconnect using their existing retry behavior. SSE remains a best-effort
notification channel: a disconnect can lose pending events and does not replay
missed events. The client invalidates cached state on `init` (including reconnects)
and `resync-required`, so active queries refetch and inactive queries become stale.
Explicit invalidation also overrides infinite stale time for ticket details. Durable
event replay/reconciliation is separate work tracked by GRAV-226.

On SIGTERM/SIGINT, the HTTP process marks itself shutting down. The existing `/`
and `/api/v1/health` probes return 503 with `shutting_down` while reachable, and
new SSE subscriptions return 503, including requests whose authentication was
pending when shutdown began. The server stops accepting connections and ends all
active SSE responses before awaiting HTTP closure. Each SSE socket is ended after its response finishes; sockets still open after
one second are destroyed. The deadline tracks socket closure, not response closure. It then stops service-token refresh and
the event bridge, closes PostgreSQL and Redis, and exits. The existing 30-second
process deadline remains the safety bound for stuck non-SSE requests/dependencies.

Validation covers UTF-8 byte limits, backpressure/drain recovery, stalled writes,
heartbeat and listener cleanup, revocation, shutdown admission races, existing
authentication checks, and a child process receiving SIGTERM with an open real
HTTP SSE connection. The process test requires natural exit, so leaked heartbeat
timers or sockets cannot be hidden by `process.exit()`.
