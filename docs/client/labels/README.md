# Client Labels

## 1. Purpose and Scope
This document explains how labels are represented and used in the React client. Labels are treated as project-scoped tags that can be added to or removed from tickets at any time, and the client keeps them available across ticket creation, ticket detail, project administration, and filtering.

## 2. Non-Goals or Boundary Limits
- This document does not describe database migrations or server authorization rules in depth.
- It does not cover unrelated UI areas such as auth screens, notes, or workspace invite flows.
- It focuses on the label-specific state and UI surfaces that are already part of the ticketing experience.

## 3. Entry Points
- `client/src/context/TicketContext.tsx`
- `client/src/pages/AppShellPage/AppShellPage.tsx`
- `client/src/modules/tickets/components/CreateTicketModal.tsx`
- `client/src/modules/tickets/components/TicketDetail.tsx`
- `client/src/modules/tickets/components/TicketFilterBar.tsx`
- `client/src/modules/workspaces/components/WorkspaceProjectPanel.tsx`
- `client/src/modules/tickets/components/LabelBadge.tsx`

## 4. Flow Steps
1. **Initial Data Hydration**
   - `TicketContext` loads projects, tickets, labels, cycles, and users into global client state.
   - Labels are stored as a first-class collection in context so multiple UI surfaces can render the same project label data without separate fetches.
2. **Project-Scoped Refreshes**
   - When the active project changes, the client refreshes project data and replaces the label list for that project.
   - Label CRUD and assignment actions also trigger a refresh so the sidebar, detail pane, and list filters stay in sync.
3. **Ticket Creation**
   - `CreateTicketModal` shows the label picker as a multi-select control.
   - The modal only offers labels that belong to the current project and submits the selected `labelIds` with the new ticket payload.
4. **Ticket Detail Editing**
   - `TicketDetail` renders assigned labels as removable chips and offers an add-label popover.
   - Users can assign existing labels, unassign labels, or create a new label inline and immediately attach it to the active ticket.
5. **Label Management**
   - `WorkspaceProjectPanel` provides project-level label CRUD.
   - Users can create a label, edit its metadata, or delete it from every ticket in that project.
6. **Filtering and URL Sync**
   - `TicketFilterBar` lets users select one or more labels and choose whether tickets must match `all` selected labels or `any` selected label.
   - `AppShellPage` persists `labels` and `labelMode` to the query string so label filters survive navigation and page refreshes.

## 5. Data Stores and Resources

### Ticket Context
- `labels`: The active project label list in memory.
- `filters.labels`: The selected label IDs used to filter visible tickets.
- `filters.labelMode`: The current filter mode, either `all` or `any`.
- Label actions exposed by context:
  - `createLabel`
  - `updateLabel`
  - `deleteLabel`
  - `assignLabelToTicket`
  - `unassignLabelFromTicket`

### Ticket Objects
- Tickets carry both `labels` and `labelIds` in client-facing payloads.
- `labelIds` are used for selection state and API submission.
- `labels` are used for rendering chips, counts, and detailed metadata.
- `domainId` still exists in the type model for migration compatibility, but it is not the primary user-facing tag system.

### UI Components
- `LabelBadge` is the shared chip used wherever a label needs to be displayed consistently.
- `CreateTicketModal` uses a popover-based multi-select for labels.
- `TicketFilterBar` uses the label filter toggle and AND/OR mode switch.
- `WorkspaceProjectPanel` is the label administration surface for the active project.

## 6. Interfaces and Contracts
- `CreateTicketModal` submits `labelIds` as part of the ticket create payload.
- `TicketDetail` expects label assignment and removal to be immediate and reversible.
- `TicketFilterBar` expects `filters.labels` and `filters.labelMode` to round-trip through `AppShellPage` URL synchronization.
- The client assumes label operations are project-scoped and will refresh the active project state after label mutations.

## 7. Permissions, Guards, or Tenant Boundaries
- The client only exposes labels for the currently active project in the creation and management surfaces.
- Label assignment controls are scoped to the active ticket and its project, which keeps the UI aligned with the server-side project boundary.
- Even though the client filters by `activeWorkspaceId`, the server remains the final source of truth for label ownership and assignment validity.

## 8. Failure Modes, Observability, or Operational Notes
- When the project changes in `CreateTicketModal`, any selected labels that do not belong to the new project are pruned automatically.
- A ticket can have zero labels, one label, or many labels at once, so UI components should never assume a single tag.
- The filter count badge is intentionally decoupled from the button layout so the trigger remains a stable size when active filters change.
- If a label action fails, the relevant screen should surface the error and preserve the current selection state until the user retries or cancels.

## 9. Change Hazards, Invariants, or Migration Constraints
- Keep label UI text consistent with the new terminology. User-facing copy should say “Label,” not “Domain.”
- Do not regress to single-label semantics in the client. The picker, detail view, and filters all assume multi-label support.
- Keep the client and server label payloads aligned, especially for `labelIds`, `labels`, and `labelMode`.
- Avoid introducing project-agnostic label management in the client unless the server schema changes to match.

## 10. Related Docs
- [Client Architecture Overview](../CLIENT_ARCHITECTURE_OVERVIEW.md)
- [Client State Management](../CLIENT_STATE_MANAGEMENT.md)
- [Client Routing Flow](../CLIENT_ROUTING_FLOW.md)
- [Client User Interactions](../CLIENT_USER_INTERACTIONS.md)
