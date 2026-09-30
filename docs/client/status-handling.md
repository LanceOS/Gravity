# Save and generation status audit

The application mounts one `NotificationCenter` beside the router. Notifications remain visible when a save closes a modal or navigates to another app route. The center also restores still-active notifications on remount and exposes a live region.

## Reviewed flows

| Surface | Result handling and completion behavior |
| --- | --- |
| Account preferences: general, appearance/layout, AI provider/key | Hook owns save/error toasts. Pending saves are guarded; Save/Save Key use dirty state. Confirmed snapshots do not overwrite edits typed during a save. |
| Saved API keys and tutorial reset | Pending controls, success/error feedback, retry on failure. Reset is disabled after confirmation. |
| Workspace settings: overview, access policy/key, MCP tools | Hook owns feedback; desktop/mobile saves use a confirmed baseline, retain failed drafts, and re-enable for edits. |
| Invites and access requests | Creation/approval/revocation receive result toasts; existing pending controls and completed-row removal remain. Invite creation clears only on success. |
| Workspace create/join | Guarded requests, actionable errors, navigation only on success. Join feedback distinguishes pending approval from approved access. A submitted join form remains disabled until edited. |
| Project settings, including team projects | Await updates before acknowledging; completed saves stay disabled until edited. Failed drafts remain available. Shared project provider owns mutation toasts. |
| Project/team/label creation and label editors | Existing form pending states plus keyboard submission guards; shared project/label mutations own toasts. Label save tracks the submitted input. |
| Team settings | Removed premature optimistic success; waits for PATCH, retains failed input, gates repeated saves, and re-enables for changes. |
| MCP connection generation | Validates returned credentials before success; Generate disables after confirmation. Copy/download/close remain available. Changed options or the explicit Generate another connection action allow intentional regeneration. Refresh failure does not discard generated credentials. |
| External AI connections and OAuth consent | Revocation/consent feedback follows server confirmation. OAuth preserves its existing pending/completed/expired-request gating. |
| Tour Skip, Finish, and dismiss | One persistence owner in the modal; no parent duplicate writes. Failure keeps the tour open for retry. Intermediate Next/Back do not persist. |
| Ticket creation, updates, title/description, and comments | Creation and comment submission guard duplicates and preserve failed input. Ticket updates return confirmed outcomes; shared mutation owns update toasts. Menus no longer announce early/duplicate success. Description has a retry action; title saves retain failed drafts. |
| Notes | Creation is guarded and acknowledged. Autosaves toast on acknowledgement, retaining the existing serialized queue, local draft recovery, and retry controls. Upload failures now surface feedback. |
| Chat generation and agent simulator | Chat success occurs only after the SSE `done` event; empty/error streams are failures. Retry/regenerate remain intentional actions. Simulator detects MCP `isError` and gates repeated completed prompts. |
| GitHub reconciliation and task export | Preview/apply/download feedback follows the result. Apply clears selection only after a response and directs users to per-match outcomes. |

## Ownership and intentional repeat actions

`useActionStatus` ties completion to submitted input and protects against same-tick duplicate submissions. It treats false/null outcomes as failures and emits one result toast. Existing settings and domain mutation owners retain their own feedback; callers must not add a second toast for the same mutation.

Preview refreshes, exporting current task data, copying/downloading an existing credential, and chat regenerate are intentionally repeatable. Note/title/description autosaves have no initiating Save button; their drafts and confirmed snapshots govern subsequent saves. Authentication and read-only settings/navigation controls are not save/generation actions. No background job acceptance endpoint is used by these generation UIs: MCP generation returns credentials and chat waits for completion, so neither announces completion on mere request acceptance.

OAuth redirects leave Gravity for an external client. Its confirmation is shown before redirect; Gravity cannot retain its toast on a third-party page. Internal navigation keeps the application-level center mounted.

## Validation

- Full client suite under Node 22: 129 files, 873 tests passed. The subsequent targeted run passed all 17 tests, including two additional regression cases for label completion state and newer credential edits.
- Added deferred-request regression coverage for duplicate protection, pending states, failed saves/retry, post-success disabling, edits during requests, team saves, confirmed ticket updates, and navigation/remount notification retention.
- TypeScript application checks and `git diff --check` pass. Run the suite with Node 22 (`/usr/bin/node client/node_modules/vitest/vitest.mjs run --root client --maxWorkers=2`); Node 26 has unrelated jsdom storage/AbortSignal incompatibilities.
- The Vite crash was traced to a corrupted installed Rolldown 1.0.3 Linux native binding. Restoring the exact binary from the cached archive (verified against the lockfile SHA-512 integrity) fixes the minimal reproduction and production bundling. The normal `npm run build:client` command now passes (TypeScript and Vite) without environment overrides; only the existing large-chunk warning remains. No dependency version or build configuration change was needed. No deployment or merge was performed.

### Vite crash investigation

The installed `@rolldown/binding-linux-x64-gnu` binary differed from the lockfile-verified archive by 3,404 bytes. A one-line virtual Rolldown bundle reproduced the native crash without loading Gravity source or Vite configuration. Both SIGILL and SIGSEGV occurred; a core backtrace located the fault inside the binding, and disassembly showed malformed instructions. Limiting Rayon to one thread did not help. JavaScript imports and a standalone TypeScript transform succeeded.

The clean archive binary successfully built the application. The shared installation at `/home/lance/Documents/Code/Gravity/node_modules/@rolldown/binding-linux-x64-gnu/rolldown-binding.linux-x64-gnu.node` was then restored, preserving the damaged copy at `/tmp/gravity-corrupted-binding.node`. The underlying cause of the installed-file corruption is unknown.

- Damaged binary SHA-256: `227c2d0a592d014d2e58a02022bb616577007722eccb6d49efefae03d81d3f13`
- Verified/restored SHA-256: `5d1ab12e2c49ff3007ebdeda92a81effed2d054d386dbbbb3ff48733bf9701ac`
