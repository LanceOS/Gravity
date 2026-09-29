# Complete object-store inventories (GRAV-217)

`RustFS.listFiles(prefix)` returns relative filenames only after all
`ListObjectsV2` pages have completed. It requests up to 1,000 keys per page,
follows `IsTruncated` / `NextContinuationToken`, and continues across empty
pages. Requests are sequential. Prefix directory markers are excluded and
out-of-prefix keys are rejected. Every page must supply an explicit boolean
`IsTruncated`, and every content entry must have a nonempty key; malformed
responses are rejected rather than treated as complete inventories.

To bound memory and work, an inventory may contain at most 100,000 filenames
and 32 MiB of UTF-8 relative filename data, spanning at most 1,000 response
pages. Continuation tokens are limited to 16 KiB each and repeated tokens are
rejected. Exceeding a bound throws; callers never receive a silently truncated
array. These bounds exclude SDK response parsing overhead and string/object
overhead, but bound the number of retained entries and tokens.

An initially absent bucket preserves the existing empty-array behavior.
`NoSuchBucket` after pagination starts, other listing failures, and malformed
continuation responses fail the entire inventory. No partial result is returned.

Prefix deletion and per-note media cleanup both finish listing before starting
deletions. The scheduled orphan cleanup inventories all note prefixes and bounds
its complete deletion plan to 100,000 entries / 32 MiB of bucket-plus-filename
data before deleting anything. All three deletion paths use one request at a
time. Team deletion also processes note prefixes sequentially, so a large team
cannot multiply the inventory memory bound by its note count. It continues
best-effort cleanup of other prefixes if one prefix fails. The scheduled job no longer relists and deletes supposedly empty prefixes:
S3 directories are virtual, and that second pass could capture new uploads.

The existing list API is the common path for note cleanup and prefix deletion;
future export/backup callers should also use it and propagate inventory-limit
errors rather than interpreting them as empty storage. The repository currently
has no export/backup object inventory path to migrate.

This is not a storage snapshot or a transactional delete. Concurrent writers can
change objects between listing and deletion, and an individual deletion failure
can occur after earlier deletions succeeded. Missing-body and cross-note
reference-policy hardening remain separate work (GRAV-215).

Regression tests intercept the SDK boundary and cover continuation across empty
pages, UTF-8/nested filenames, inventory bounds, cursor failures, no deletion
after listing failure, complete cleanup planning, dry runs, and bounded deletion
concurrency. They do not delete live storage.
