# GitHub Repository Integration

## 1. Purpose and Scope

The GitHub integration allows a Gravity **project** to be linked to a GitHub repository by storing its HTTPS URL. Once linked, Gravity listens for incoming GitHub pull request webhook events at `POST /api/v1/webhooks/github` and automatically transitions ticket statuses based on the lifecycle of the PR.

This feature is implemented across three layers:

- **Database**: a `github_repo_url` column on the `projects` table.
- **Server**: a stateless webhook handler in `server/src/modules/webhooks/routes.ts`.
- **Client**: a "Project Settings" form in the Manage Projects panel.

## 2. Non-Goals or Boundary Limits

- Does not create or delete GitHub PRs or branches.
- Does not support per-ticket branch overrides; ticket keys are parsed from the PR **title** and **branch name** by a regex pattern.
- Multiple projects can link to the same repository, but a ticket will only be updated if it belongs to one of those linked projects.

---

## 3. End-to-End Flow

The complete flow consists of two separate user-initiated setup steps and then an automated runtime loop.

### Step 1 — Link a Project to a Repository (User Action)

A workspace owner or member opens **Manage Projects → Project Settings** and types the full HTTPS URL of the GitHub repository (e.g. `https://github.com/owner/repository`) into the **GitHub Repository URL** input, then clicks **Save Settings**.

The client sends:

```
PATCH /api/v1/projects/:projectId
Content-Type: application/json

{ "githubRepoUrl": "https://github.com/owner/repository" }
```

The handler in [projects-routes.ts](../../server/src/modules/workspaces/projects-routes.ts) passes the field to `updateProjectRecord`, which persists it to the `github_repo_url` column in PostgreSQL. An empty string from the form is sent as `null` to clear the link.

### Step 2 — Configure the GitHub Webhook (User Action)

In the target GitHub repository, the user must add a webhook with the following settings:

| Setting | Value |
|---|---|
| Payload URL | `https://<your-gravity-host>/api/v1/webhooks/github` |
| Content type | `application/json` |
| Secret | The value of `GITHUB_WEBHOOK_SECRET` set on the server |
| Events | **Pull requests** only |

The `GITHUB_WEBHOOK_SECRET` must be a cryptographically strong random string (e.g., `openssl rand -hex 32`). It is configured in the server's environment and is used for HMAC-SHA256 signature verification of every delivery.

### Step 3 — Automated Ticket Updates (Runtime)

When a pull request event fires, GitHub POSTs a payload to the endpoint. Gravity processes it as follows:

```
POST /api/v1/webhooks/github
x-github-event: pull_request
Content-Type: application/json
```

#### 3a. Validate the Event Type and Signature

Before any other processing:

1. The raw request body is read as a `Buffer` (via `express.raw()` mounted before the global JSON parser in `app.ts`).
2. The `x-hub-signature-256` header is verified with `HMAC-SHA256(GITHUB_WEBHOOK_SECRET, rawBody)` using a timing-safe comparison (`crypto.timingSafeEqual`). Any mismatch returns `401 Unauthorized`.
3. In production, if no `GITHUB_WEBHOOK_SECRET` is configured, the endpoint returns `503 Service Unavailable` rather than allowing unauthenticated deliveries.
4. The raw buffer is parsed to JSON only after the signature passes.
5. If `x-github-event` is not `pull_request`, the handler returns `200 OK`. All other event types are safely ignored.

#### 3b. Resolve the Repository URL

The handler extracts the canonical repository URL from the payload using:

```
repoUrl = pr.base?.repo?.html_url || payload?.repository?.html_url
```

This dual-path lookup handles both standard PR payloads (which include `pull_request.base.repo`) and simplified webhook payloads that only include a top-level `repository` object.

If no URL can be resolved, the handler returns `400 Bad Request`.

#### 3c. Match Against Linked Projects

```sql
SELECT id, created_by FROM projects WHERE github_repo_url = $repoUrl
```

If no project rows are returned, the handler returns `200 OK` and stops. A **uniform `{ success: true }` response** is returned in all no-match cases to prevent repository URL and ticket key enumeration.

#### 3d. Extract Ticket Keys from the PR

The handler searches for ticket key patterns (e.g. `CORE-123`, `bug-7`) in:

1. The **PR title** (`pull_request.title`)
2. The **branch name** (`pull_request.head.ref`)

Pattern: `/([A-Za-z]+)-\d+/g` — results are normalized to uppercase.

Multiple keys may be extracted from a single PR. Processing is **capped at 10 keys per delivery** to prevent query-storm abuse from crafted PR titles with many pattern matches.

#### 3e. Batch Ticket Lookup

All matched keys are resolved in a **single batched database query** (`WHERE key IN (...)`), rather than one query per key. This eliminates the N+1 query pattern from the original implementation.

#### 3f. Validate Ticket Ownership

The resolved tickets are filtered to those whose `projectId` is in the set of project IDs linked to the incoming repository URL. Tickets from other projects that happen to share a matching key pattern are silently skipped.

#### 3g. Map PR Action to Ticket Status

The `action` field of the webhook payload drives the status transition:

| GitHub PR Action | `prStatus` set to | Ticket `status` set to |
|---|---|---|
| `opened` | `open` | `in_progress` |
| `reopened` | `open` | `in_progress` |
| `review_requested` | `open` | `in_review` |
| `ready_for_review` | `open` | `in_review` |
| `closed` + `merged: true` | `merged` | `done` |
| `closed` + `merged: false` | `closed` | _(unchanged)_ |
| Any other action | _(unchanged)_ | _(unchanged)_ |

> **Note on closed, non-merged PRs**: If a PR is closed without being merged (e.g., abandoned), `prStatus` is set to `closed` but the ticket's `status` is intentionally left at its current value. This avoids regressing a ticket's workflow state for abandoned branches.

#### 3h. Sanitize Payload Values

Before constructing the auto-comment:
- `pr.number` is validated as a positive integer.
- `pr.user.login` is stripped to alphanumeric + hyphen characters only (max 39 chars) — matching GitHub's actual username rules.
- `prUrl` is validated as a `https://github.com/` URL before storage; invalid values are stored as empty string.

#### 3i. Persist and Broadcast

For each successfully updated ticket:

1. `updateTicketRecord` writes the new `status`, `prStatus`, and `prUrl` to PostgreSQL.
2. An automatic comment is added, authored by the ticket's assignee or the project creator (looked up from the already-loaded project data — no extra DB query).
3. Two real-time SSE events are broadcast via `broadcastEvent`:
   - `comments-updated` — with the latest comment list for the ticket.
   - `tickets-updated` — with the full refreshed ticket list for the project.

#### 3j. Response

All code paths return the same uniform `{ "success": true }` regardless of whether any tickets were matched or updated. This prevents ticket key and repository URL enumeration.

---

## 4. Data Stores and Resources

### `projects` table (PostgreSQL)

The only schema change required for this feature:

| Column | Type | Nullable | Description |
|---|---|---|---|
| `github_repo_url` | `TEXT` | Yes | Full HTTPS URL of the linked GitHub repository. `NULL` means not linked. |

Added via `ALTER TABLE` in [bootstrap.ts](../../server/src/db/bootstrap.ts) on startup:

```sql
ALTER TABLE projects ADD COLUMN IF NOT EXISTS github_repo_url TEXT;
```

---

## 7. Security Controls

| Control | Where enforced |
|---|---|
| HMAC-SHA256 signature verification | `lib/webhookSignature.ts` · `webhooks/routes.ts` |
| Production hard-fail when secret absent | `webhooks/routes.ts` (returns 503) |
| Per-IP rate limiting (60 req/min) | `webhooks/routes.ts` via `express-rate-limit` |
| Batch key lookup (no N+1) | `webhooks/routes.ts` · `tickets` schema `WHERE key IN (...)` |
| Key cap (max 10 per delivery) | `webhooks/routes.ts` constant `MAX_KEYS_PER_WEBHOOK` |
| Payload value sanitization | `lib/webhookSignature.ts` `sanitizeGitHubLogin` + integer check |
| `prUrl` URL validation | `lib/webhookSignature.ts` `isValidGitHubUrl` |
| Uniform success response (no enumeration) | `webhooks/routes.ts` — single `res.json({ success: true })` |
| Auth + membership on `PATCH /projects/:projectId` | `projects-routes.ts` |
| Server-side GitHub URL format validation | `projects-routes.ts` + `lib/webhookSignature.ts` `isValidGitHubRepoUrl` |
| Client-side GitHub URL format validation | `WorkspaceProjectPanel.tsx` `handleSaveProjectSettings` + `pattern` attr |

---

## 8. Key Files and Modules

| File | Role |
|---|---|
| [server/src/modules/webhooks/routes.ts](../../server/src/modules/webhooks/routes.ts) | Stateless webhook handler: validates, matches, maps, updates, and broadcasts. |
| [server/src/modules/workspaces/schema.ts](../../server/src/modules/workspaces/schema.ts) | Drizzle ORM definition of `github_repo_url` on the `projects` table. |
| [server/src/modules/workspaces/services/projects.ts](../../server/src/modules/workspaces/services/projects.ts) | `listProjectsWithDetails` (selects `githubRepoUrl`) and `updateProjectRecord` (persists it). |
| [server/src/modules/workspaces/projects-routes.ts](../../server/src/modules/workspaces/projects-routes.ts) | `PATCH /projects/:projectId` — exposes the field over REST. |
| [server/src/db/bootstrap.ts](../../server/src/db/bootstrap.ts) | Idempotent `ALTER TABLE` migration for `github_repo_url`. |
| [client/src/modules/workspaces/components/WorkspaceProjectPanel.tsx](../../client/src/modules/workspaces/components/WorkspaceProjectPanel.tsx) | "Project Settings" form — reads, saves, and displays feedback for the GitHub URL. |
| [client/src/context/TicketContext.tsx](../../client/src/context/TicketContext.tsx) | `updateProject` mutation — `PATCH /api/v1/projects/:id` + invalidates cached projects. |
| [client/src/types/domain.ts](../../client/src/types/domain.ts) | `Project` interface — `githubRepoUrl?: string | null`. |

---

## 6. API Contracts

### `PATCH /api/v1/projects/:projectId`

Updates mutable project fields, including the GitHub repository link.

**Request body** (all fields optional):
```json
{
  "name": "string",
  "description": "string",
  "status": "planned | active | completed",
  "githubRepoUrl": "https://github.com/owner/repo"
}
```

Setting `githubRepoUrl` to `null` explicitly removes the link.

**Response** (`200 OK`):
```json
{
  "id": "p_abc123",
  "name": "My Project",
  "key": "CORE",
  "status": "active",
  "workspaceId": "ws_xyz",
  "githubRepoUrl": "https://github.com/owner/repo"
}
```

### `POST /api/v1/webhooks/github`

Receives GitHub pull request events. No authentication required. Intended to be called by GitHub's webhook delivery system only.

**Headers:**
- `x-github-event: pull_request` (required for processing; other values are silently ignored)

**Body:** Standard [GitHub pull request event payload](https://docs.github.com/en/webhooks/webhook-events-and-payloads#pull_request).

---

## 7. Permissions, Guards, or Tenant Boundaries

- **Webhook endpoint**: Public — no session or API key is required. GitHub delivers webhooks without authentication headers. The only implicit security boundary is that the `github_repo_url` must exactly match the `repository.html_url` in the incoming payload. An attacker would need to know a valid repository URL and the corresponding ticket keys to craft a meaningful request.
- **Project settings (`PATCH /projects/:projectId`)**: Inherits the same project membership checks as all other project mutation routes — the request actor must be a member of the project.

---

## 8. Failure Modes and Operational Notes

| Scenario | Behavior |
|---|---|
| PR from a repository not linked to any project | `200 OK`, no-op message, no database writes |
| Ticket key in PR doesn't match any ticket in DB | Silently skipped; other keys in the same PR still process |
| Ticket exists but belongs to a different project than the linked one | Silently skipped (tenant boundary enforcement) |
| PR closed without merging | `prStatus` → `closed`, ticket `status` unchanged |
| Webhook payload missing `repository.html_url` | `400 Bad Request` |
| `updateTicketRecord` returns null (ticket deleted mid-flight) | Skipped; no comment posted |

---

## 9. Change Hazards and Invariants

- The `github_repo_url` stored in the database must be the **canonical HTTPS URL** exactly matching `repository.html_url` in GitHub's webhook payload (e.g. `https://github.com/LanceOS/Gravity`, not `git@github.com:LanceOS/Gravity.git`).
- Renaming or transferring a GitHub repository changes its `html_url`, requiring the Gravity project setting to be manually updated.
- Ticket key extraction uses a broad regex (`[A-Za-z]+-\d+`). Branch names like `fix/express-5` would match as `fix-5` if that key existed in the database. Teams should use branch naming conventions that start with a valid project key (e.g. `feature/CORE-123-description`).

---

## 10. Related Docs

- [SERVER_MODULE_WORKSPACES.md](SERVER_MODULE_WORKSPACES.md)
- [SERVER_MODULE_TICKETS.md](SERVER_MODULE_TICKETS.md)
- [TICKET_DATA_MODEL.md](TICKET_DATA_MODEL.md)
- [WORKSPACE_DATA_MODEL.md](WORKSPACE_DATA_MODEL.md)
