# Client Labels

## Scope and entry points

Labels use `POST /labels` with a project or team scope. In flat workspaces labels belong to a project. In team workspaces labels belong to a team and are available to that team's projects; creating through a project resolves its team on the server.

- Sidebar right-click → **New Label** opens `LabelCreateOverlay` with a **Team** selector in team workspaces or a **Project** selector in flat workspaces.
- The selector uses the active workspace's sidebar teams or project directory. It defaults to the route's team/project, falling back to the active project's context. With no valid context, the user must choose an available scope. An empty scope list cannot be submitted.
- Project management and inline creation in ticket create/detail retain their existing project context.
- Manage Teams creates labels directly for the selected team.

## Sidebar creation flow

1. `WorkspaceShellPage` supplies the hierarchy-specific choices and default to `AppShellOverlays` and `LabelCreateOverlay`.
2. The overlay submits the chosen `teamId` or `projectId` with name, color, and description. Loading prevents duplicate submission; validation or server errors retain the draft and selection. Reopening resets the form to the current context; background context refreshes do not erase an open draft. The submit shortcut is active only while the dialog is open.
3. `useWorkspaceManagementCommands` forwards explicit scope. An explicit team must never inherit the active project.
4. `LabelContext.createLabel` sends a team-only payload without a project header, or a project payload and matching header. The server authorizes and persists the scope.
5. Team creation invalidates the team's label query and the label queries for its projects. Project creation invalidates that project's label query. The sidebar dialog also refreshes the workspace sidebar tree.

`LabelCreateOverlay` accepts optional scope configuration so existing callers with a fixed scope can retain their current payloads.

## Permissions and failure handling

The server remains authoritative for membership, scope ownership, and duplicate-name checks. Labels are project-isolated in flat workspaces and team-isolated in team workspaces. A rejected request remains visible in the dialog even when the selected project differs from the active project.

## Regression checks

- `AppShellThemeIntegration.test.tsx`: actual sidebar right-click through the shell and overlay in both hierarchy modes, workspace-specific choices, selected-scope errors, and retry.
- `LabelCreateOverlay.test.tsx`: team/project selection, defaults, invalid or missing choices, retry draft retention, reopening, and existing fixed-scope callers.
- `useWorkspaceManagementCommands.test.tsx`: explicit project/team forwarding and active-project fallback.
- `LabelContext.test.tsx`: selected team request body with no active-project header.
- Server `projects-tickets.test.ts` and `teams.test.ts`: persistence and scope isolation, including a selected team with no projects.
