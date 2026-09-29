# GitHub pull request processing

Supported webhook actions are `opened`, `reopened`, `review_requested`,
`ready_for_review`, and `closed`. Other actions (including `synchronize`, `edited`,
and `labeled`) return success without changing tickets, PR records, or comments.
Supported deliveries require `X-GitHub-Delivery`, a valid PR/repository identity,
and GitHub's `pull_request.updated_at`. Existing signature verification applies.

`processPullRequestEvent` commits the unique delivery claim, per-ticket PR
snapshot, ticket summary, dependency cleanup, and automation comment in one
PostgreSQL transaction. Failed processing releases the claim through rollback,
so GitHub can retry. Project row locks serialize concurrent deliveries with other
ticket writes. Realtime notifications happen after commit.

PR snapshots use canonical repository/PR URLs as identities. Older timestamps
are ignored; ties prefer merged, closed, review, then open. A merged PR cannot
be reopened by subsequent snapshots. Newer snapshots with unchanged lifecycle
only advance the ordering timestamp and create no comment. Existing ticket/PR
associations survive title or branch edits.

For multiple PRs, known open PRs take precedence over merged/closed PRs. A ticket
becomes done once it has a merged PR and no known open PRs. Closing an abandoned
PR without any merge preserves ticket status. Done/canceled tickets never reopen
automatically, and their merged summary takes precedence over later open PRs.
The system cannot account for PRs it has never received; GRAV-237 provides
reviewed reconciliation for missing updates. Existing manual PR links are retained
when another PR becomes tracked.

Automation comments use the reserved `system:webhook` actor, displayed as
“GitHub automation”; no login account is provisioned. GitHub PR author and event
sender are stored separately in `comments.automation` metadata.

The optional reconciliation input restricts processing to one reviewed ticket,
checks the expected ticket fields/revision while holding the project lock, and
rejects cancellation, conflicting links/open PRs, reopened merged work, and
post-merge edits. It applies exactly the reviewed merged PR. Current synchronized
state is a no-op; reconciliation deliberately does not use webhook delivery
suppression, allowing repaired/restored ticket fields to be reconciled again.
It records the reviewing user, evidence, and before/after state in comment metadata.

Schema additions are in `0012_github_webhook_reliability.sql` and the idempotent
startup bootstrap. Delivery IDs are retained indefinitely; purging them would
weaken replay protection.

Validation:

- `tests/github-webhooks.test.ts` covers lifecycle, unsupported actions, ordering,
  multiple PRs, attribution, dependency cleanup and reconciliation safeguards.
- `scripts/test-github-webhook-postgres.ts` exercises real concurrent delivery
  claims, project locking, rollback after an injected comment failure, and retry.
  Run it with `DATABASE_URL` set to a disposable `gravity_webhook_test_*`
  database on an existing PostgreSQL service; the caller creates/drops that database.
