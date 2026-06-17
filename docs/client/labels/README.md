# Client Labels

## 1. Purpose and Scope
This document explains how labels are handled in the React client across two scopes:

- Team workspace labels (team scoped)
- Project workspace labels (project scoped)

Both scopes currently use the same `Label` visual components and the same `/labels` endpoint, but they are separate workflows and should not be mixed.

## 2. Label Scope Model

### 2.1 Project Workspace Labels
- Scope key: `projectId`
- Use case: classify and filter tickets within a project
- Storage: loaded through `TicketContext` via `queryKeys.labels(activeProjectId)` and shared to ticket and filter UI
- Assignment: used in ticket `labelIds` add/remove flows
- Primary surfaces:
  - `CreateTicketModal`
  - `TicketDetail`
  - `TicketFilterBar`
  - `WorkspaceProjectPanel`

### 2.2 Team Workspace Labels
- Scope key: `teamId`
- Use case: team-level label metadata in Manage Teams
- Storage: queried in shell routes under `['teamLabels', route.teamIdParam]` with `GET /labels?teamId=`
- Assignment: not wired into ticket `labelIds` flows
- Primary surfaces:
  - `WorkspaceTeamsPage` in the Team management workspace
  - Team sidebar label route handlers (currently a placeholder path for team-label views)

### 2.3 Isolation Rule
- Team labels and project labels are not interchangeable. A team label must not be passed into ticket assignment actions.
- Name/color overlap is allowed, but the IDs are scope-specific.
- Client views should choose the active set based on route/context (`activeProjectId` vs `teamId`).

## 3. Entry Points
- `client/src/modules/workspaceTeamsPage/screens/WorkspaceTeamsPage.tsx`
- `client/src/modules/workspaceShellPage/screens/WorkspaceShellPage.tsx`
- `client/src/modules/workspaceProjectsPanel/context/WorkspaceProjectPanelActionsContext.tsx`
- `client/src/modules/workspaceProjectsPanel/components/WorkspaceProjectLabelCreateForm.tsx`
- `client/src/context/TicketContext.tsx`
- `client/src/modules/tickets/components/CreateTicketModal.tsx`
- `client/src/modules/tickets/components/TicketDetail.tsx`
- `client/src/modules/tickets/components/TicketFilterBar.tsx`
- `client/src/modules/tickets/components/LabelBadge.tsx`

## 4. Flow Steps
1. `TicketContext` hydrates active-project `tickets`, `labels`, and `cycles` from `queryKeys` and `Ticket` data queries.
2. Project views use project labels for ticket assignment, display, and filters.
3. Team views query team labels independently via `GET /labels` with `teamId`.
4. Mutations in one scope invalidate only that scope's cache keys.

## 5. Project Label Lifecycle
1. Open project management for a project.
2. Use the project label create form in `WorkspaceProjectPanel`.
3. Submit `name`, `color`, `description`, `sortOrder`.
4. Action builds payload with `projectId` and calls `TicketContext.createLabel`.
5. The context sends `POST /labels` with `projectId` and invalidates `queryKeys.labels(projectId)`.
6. Ticket UI updates use this refreshed project label list.

## 6. Team Label Lifecycle
1. Open `WorkspaceTeamsPage`.
2. Select a team and expand the `Team Labels` section.
3. Click `Create Label` and fill name/color/description.
4. The page sends `POST /labels` with `teamId` and related payload fields.
5. Sidebar cache/state is updated and the team list is refreshed.

## 7. Where Each Scope Is Used
- Project labels:
  - Ticket create and detail assignment.
  - Ticket filtering (`filters.labels`, `filters.labelMode`).
  - Project-level panel management and inline create operations in ticket create/detail.
- Team labels:
  - Manage Teams label list and create action.
  - Team aggregate route label context (team-level label route scaffolding).
  - Not used for ticket-level tagging in current project ticket flows.

## 8. Data Stores and Contracts
- `TicketContext` label actions are project-oriented:
  - `createLabel`
  - `updateLabel`
  - `deleteLabel`
  - `assignLabelToTicket`
  - `unassignLabelFromTicket`
- Project views keep labels in `TicketContext.labels` and query cache by project.
- Team views keep labels in team-related shell caches (`teamLabels`, sidebar tree team labels).
- API contract distinction is by query/payload fields:
  - Project scope: `projectId`
  - Team scope: `teamId`

## 9. Permissions and Tenant Boundaries
- The active project scope governs assignment and filtering in ticket surfaces.
- Team scope governs metadata visible in Manage Teams.
- Route context determines which endpoint query param is sent (`projectId` or `teamId`).

## 10. Known Edge Cases
- Changing projects should drop label selections that are not valid for the new project context.
- If a mutation fails, keep form state where possible so users can retry.
- A future schema change is required if ticket-level flows need to consume team-scoped labels.

## 11. Change Hazards, Invariants, or Migration Constraints
- Do not reuse `Project` label actions for team-scoped data without explicit API contract change.
- Avoid adding team label objects to ticket picker/filter sources.
- Preserve cache invalidation boundaries (`queryKeys.labels(projectId)` vs team label sources).

## 12. Related Docs
- [Client Architecture Overview](../CLIENT_ARCHITECTURE_OVERVIEW.md)
- [Client State Management](../CLIENT_STATE_MANAGEMENT.md)
- [Client Routing Flow](../CLIENT_ROUTING_FLOW.md)
- [Client User Interactions](../CLIENT_USER_INTERACTIONS.md)
