# Note media deletion claims (GRAV-250)

Orphan cleanup and explicit media deletion first scan all committed note bodies
under the PostgreSQL note mutation lock. An unreferenced file gets a durable
`note_media_deletions` row before the object-store DELETE starts. Note body
publication checks that row under the same lock, as well as checking HEAD.
The row therefore continues to fence publication if the deleting process or
database connection disappears while the object store is still handling DELETE.

The first DELETE keeps the mutation lock until its response. A confirmed
response marks the claim `confirmed`. A failed response marks it `ambiguous`;
a lost process leaves it `pending`. The scheduled orphan-assets job retries
pending and ambiguous claims in bounded batches, using the original ETag.
Recovery keeps them ambiguous even if a retry succeeds: a successful retry
cannot prove an earlier timed-out request has finished. Rechecks continue daily
after a quiet retry, or after one minute on a storage error. Claims are not
removed merely because HEAD reports a missing object.

The media upload endpoint holds the note mutation lock through PUT. It may
reuse a filename with a `confirmed` claim and clears that claim only after PUT
completes. It rejects a `pending` or `ambiguous` claim with HTTP 409. The user
can use another filename; this conservative rule prevents a delayed DELETE
from deleting a new object, including an identical upload with the same ETag.
Direct internal object-store writes must not reuse claimed filenames.

Claims are per bucket and filename, not per URL text. The table is created by
the server bootstrap and by the SQL migration for deployments using Drizzle.
The test suite injects deletion delays and process-loss claims without relying
on timing sleeps; PostgreSQL's table lock provides the cross-replica boundary.
