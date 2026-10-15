# Note media deletion claims (GRAV-250)

Orphan cleanup and explicit media deletion first scan all committed note bodies
under the PostgreSQL note mutation lock. An unreferenced file gets a durable
`note_media_deletions` row before the object-store DELETE starts. Note body
publication checks that row under the same lock, as well as checking HEAD.
The row therefore continues to fence publication if the deleting process or
database connection disappears while the object store is still handling DELETE.

Explicit DELETE keeps the mutation lock until its response, preserving the
existing explicit-delete ordering. Orphan DELETE runs after its claim commits,
without holding that lock; its claim finalization is locked. A confirmed
response marks the claim `confirmed`. A failed response marks it `ambiguous`;
a lost process leaves it `pending`. The scheduled orphan-assets job retries
pending and ambiguous claims in bounded batches, using the original ETag.
Recovery keeps them ambiguous even if a retry succeeds: a successful retry
cannot prove an earlier timed-out request has finished. Rechecks continue daily
after a quiet retry, or after one minute on a storage error. Claims are not
removed merely because HEAD reports a missing object.

Recovery runs before the next orphan scan, so a malformed note cannot stop
older claims from being retried. It marks each attempt ambiguous before doing
storage I/O, then updates its result under the mutation lock. If recovery
overlaps a slow orphan DELETE, the later response cannot turn the claim into
a confirmed one.

The media upload endpoint holds the note mutation lock through PUT. It may
reuse a filename with a `confirmed` claim and clears that claim only after PUT
completes. It rejects a `pending` or `ambiguous` claim with HTTP 409. The user
can use another filename; this conservative rule prevents a delayed DELETE
from deleting a new object, including an identical upload with the same ETag.
Direct internal object-store writes must not reuse claimed filenames.
The streamed PUT has a one-minute application deadline; DELETE requests have a
30-second deadline. Other note mutations have a five-second lock
wait limit, so a slow upload can make them fail before its deadline. The
deadlines release application waits even if storage ignores cancellation;
claims keep late DELETE effects fenced. Moving uploads to durable per-file
intents would remove the remaining contention, but requires a recovery policy
for abandoned or ambiguous PUTs.

Claims are per bucket and filename, not per URL text. The server bootstrap
creates the table; the matching SQL migration is available for migration-managed
deployments.
The schema readiness version is bumped so older replicas fail readiness after
the new bootstrap runs. Drain older replicas before resuming media deletion
during a rolling upgrade: they do not check the new claim table when publishing
note bodies.
The test suite injects deletion delays and process-loss claims without relying
on timing sleeps; PostgreSQL's table lock provides the cross-replica boundary.
