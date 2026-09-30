# Deleted-note storage recovery

Note deletion writes `note_bucket_cleanups` in the same PostgreSQL transaction
that removes metadata. Object deletion begins only after commit. If acknowledgement
is lost, the caller can receive an error although the note is gone; the durable
intent lets the next cleanup invocation reconcile that outcome safely.

Run `npm --workspace=server run cleanup:orphaned-assets -- --dry-run` to inspect
due work, then omit `--dry-run` to process it. Run this existing maintenance job
regularly in the deployment's scheduler; no new in-process scheduler is installed.
Deleted-note recovery runs before the live-note media scan, so an unreadable live
body does not prevent recovery of already deleted notes.

Each invocation selects at most 20 due prefixes, with one listing of at most 100
objects per prefix and sequential deletes. Further pages restart at the prefix
head on later runs. Pending, failed, and blocked entries become due after one
minute. Clean entries are checked again after 24 hours to remove delayed uploads.
The limits bound request counts, not total storage-provider response time.

Inspect `status`, `attempts`, `last_error`, `updated_at`, and `next_attempt_at` in
`note_bucket_cleanups`. Status is `pending`, `retry`, `blocked`, or `clean`.
`LIVE_NOTE` blocks deletion when any metadata has the note ID or bucket path;
`OBJECT_CLEANUP_FAILED` means a listing/delete needs retry. Raw provider errors
and credentials are not persisted. A crash before the status update leaves the
previous state due for an idempotent retry.

Keep these records permanently. They fence metadata publication into deleted
prefixes even if a delete RPC outlives its database connection, and authorize
resweeping uploads that finished late. The worker checks live metadata under the
same mutation lock as publication. Do not reuse deleted prefixes or manually
remove tombstones. This protects deletions performed after this schema upgrade;
it does not infer ownership of historical untracked orphan prefixes.

The runtime bootstrap and SQL migration create the ledger and recovery index;
required schema version is 4. Candidate selection has an index matching its due-time
and bucket ordering; live bucket checks have a separate metadata index. These
avoid full inventories as the ledger grows. Permanent retention costs one row per
deleted prefix and at least one listing per prefix per daily sweep. Schedule
frequent enough invocations to drain the due backlog (20 prefixes per run); watch
oldest `next_attempt_at` to detect lag. Oldest-due ordering moves each processed
prefix behind the backlog, including failures, rather than starving later rows. Unit/API and SDK-boundary tests use synthetic data.
Native PostgreSQL rollback/lock, upgrade, and live object-store fault-injection
validation is tracked by GRAV-259.
