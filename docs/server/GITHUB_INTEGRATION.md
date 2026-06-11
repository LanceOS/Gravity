# GitHub Repository Integration

## 1. Purpose and Scope

The GitHub integration allows a Gravity **project** to be linked to a GitHub repository by storing its HTTPS URL. Once linked, Gravity listens for incoming GitHub pull request webhook events at `POST /api/v1/webhooks/github` and automatically transitions ticket statuses based on the lifecycle of the PR.

This feature is implemented across three layers:

- **Database**: a `github_repo_url` column on the `projects` table.
- **Server**: a stateless webhook handler in `server/src/modules/webhooks/routes.ts`.
- **Client**: a "Project Settings" form in the Manage Projects panel.

## 2. Non-Goals or Boundary Limits

- Does not verify GitHub webhook signatures (HMAC-SHA256). This is a future hardening concern.
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
| Events | **Pull requests** only |

No secret verification is required by the current implementation, but the endpoint silently ignores all non-`pull_request` event types.

### Step 3 — Automated Ticket Updates (Runtime)

When a pull request event fires, GitHub POSTs a payload to the endpoint. Gravity processes it as follows:

```
POST /api/v1/webhooks/github
x-github-event: pull_request
Content-Type: application/json
```

#### 3a. Validate the Event Type

If `x-github-event` is not `pull_request`, the handler returns `200 OK` with a no-op message. All other event types are safely ignored.

#### 3b. Resolve the Repository URL

The handler extracts the canonical repository URL from the payload using:

```
repoUrl = pr.base?.repo?.html_url || payload?.repository?.html_url
```

This dual-path lookup handles both standard PR payloads (which include `pull_request.base.repo`) and simplified webhook payloads that only include a top-level `repository` object.

If no URL can be resolved, the handler returns `400 Bad Request`.

#### 3c. Match Against Linked Projects

```sql
SELECT * FROM projects WHERE github_repo_url = $repoUrl
```

If no project rows are returned, the handler returns `200 OK` with a no-op message and stops processing. This prevents spurious updates from repositories not connected to any Gravity project.

#### 3d. Extract Ticket Keys from the PR

The handler searches for ticket key patterns (e.g. `CORE-123`, `bug-7`) in:

1. The **PR title** (`pull_request.title`)
2. The **branch name** (`pull_request.head.ref`)

Pattern: `/([A-Za-z]+)-\d+/g` — results are normalized to uppercase.

Multiple keys may be extracted from a single PR (e.g., a branch named `feature/CORE-42-ui` with a title of `CORE-43: update styles`).

#### 3e. Validate Ticket Ownership

For each key found, `getTicketByKey(key)` fetches the ticket from the database. The ticket is **skipped** if:

- It does not exist in the database.
- Its `projectId` is not in the set of project IDs linked to the incoming repository URL.

This prevents tickets from other projects matching similar key patterns from being affected.

#### 3f. Map PR Action to Ticket Status

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

#### 3g. Persist and Broadcast

For each successfully updated ticket:

1. `updateTicketRecord` writes the new `status`, `prStatus`, and `prUrl` to PostgreSQL.
2. An automatic comment is added to the ticket timeline (authored by the ticket's assignee, or by the project owner if unassigned):
   ```
   GitHub PR update: #42 was opened by octocat (https://github.com/owner/repo/pull/42).
   ```
3. Two real-time SSE events are broadcast via `broadcastEvent`:
   - `comments-updated` — with the latest comment list for the ticket.
   - `tickets-updated` — with the full refreshed ticket list for the project.

#### 3h. Response

```json
// One or more tickets updated:
{ "success": true, "updatedTickets": ["CORE-42", "CORE-43"] }

// No matching tickets found:
{ "success": true, "message": "Webhook received but no matching tickets found" }
```

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

## 5. Key Files and Modules

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
