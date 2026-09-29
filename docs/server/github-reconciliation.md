# Recovering missed GitHub ticket updates

Project settings include **Recover missed PR updates** for a project's saved GitHub repository. A project owner or workspace admin can preview and apply a reconciliation. This complements webhook delivery handling; it never writes to GitHub.

1. Save the repository URL, then open the reconciliation panel.
2. Public repositories can be scanned without a token. For private repositories, supply a fine-grained personal access token restricted to that repository with **Pull requests: read**, or a GitHub App installation token with the same permission. Classic PATs are not accepted. The token stays in the current panel's memory and is sent only to the server for the requested scan/apply; it is not stored, signed into previews, logged, or sent anywhere except GitHub's fixed API endpoint. Clear it by leaving the panel; a successful apply clears it too.
3. Preview up to five pages of 100 PRs each, ordered newest-created first. A partial scan always requires review because matching PRs can exist outside those pages. Use the next-pages button or start-page field for older history. Each scan has a 30-second deadline and no automatic retries; a GitHub error produces no ticket changes.
4. Inspect ticket/PR links, key or branch evidence, confidence, conflicts, and the proposed `done` / `merged` / PR-link changes. Existing PR links also count as explicit evidence. Title similarity is only a suggestion. Multiple matching PRs, suggestions, and partial scans require an individual review checkbox. Choose at most one PR per ticket and 100 matches per apply.
5. Apply selected matches. GitHub evidence is fetched again. The signed preview is bound to the actor/project and expires in 15 minutes. Changed PR evidence requires a fresh preview; changed ticket state is rejected inside the shared PR transaction. Each selected ticket is atomic; results report partial batch successes and failures separately.

Reconciliation preserves canceled tickets, reopened merged tickets, links to other PRs, and any ticket edited after the merge. Since legacy tickets have no reliable manual-change provenance, post-merge edits are conservatively protected even if unrelated to status. Protected matches cannot be forced through reconciliation; inspect and edit those tickets manually. Tracked open PRs are also protected by the shared PR service. A review acknowledgement resolves match ambiguity, not a manual-override conflict.

Already synchronized tickets are no-ops. Activity is system-authored and includes reconciliation source, requesting actor ID, evidence, and before/after values. Terminal ticket dependency cleanup and activity commit together with the ticket update. Realtime notifications occur after commit. Successful previews and apply results are recorded in the structured audit log without credentials.

There is no permanent high-water mark. After restoring a database, run another preview over the relevant pages. The shared transaction checks actual ticket state rather than suppressing reconciliation through the webhook delivery ledger, so missing ticket updates can be repaired even when older PR identity records survived.

## API

Both endpoints require session authorization and the normal CSRF protections:

- `POST /api/v1/projects/:projectId/github-reconciliation/preview`: `{ "startPage": 1, "maxPages": 5, "credential": "" }`. Returns candidates, scan coverage, expiry, and `previewToken`.
- `POST /api/v1/projects/:projectId/github-reconciliation/apply`: `{ "previewToken": "...", "selections": [{ "candidateId": "...", "reviewed": true }], "credential": "" }`. The server validates candidates against the signed preview. Each result is `applied`, `unchanged`, `stale`, `protected`, or `failed`.

Limits: 10 requests/minute/IP, start page 1–1000, five pages/request, 10 MiB/PR response page, 5,000 tickets and tracked open PRs/project, 500 preview candidates, 100 selected matches/apply. Reduce the page count if a scan exceeds the candidate/preview-size limit. Never include credentials in URLs, support screenshots, or issue reports.

GitHub documents the required read permission and public access behavior in [List pull requests](https://docs.github.com/en/rest/pulls/pulls#list-pull-requests).
