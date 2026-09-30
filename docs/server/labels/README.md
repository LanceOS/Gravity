# Server Labels

## 1. Purpose and Scope
This document explains how labels work on the server side of Gravity. Labels are the canonical, workspace-hierarchy-scoped tagging model for tickets, and they are stored with a normalized many-to-many relationship so a ticket can have multiple labels at once.

## 2. Non-Goals or Boundary Limits
- This document does not describe how labels are rendered in the client.
- It does not cover unrelated ticket fields such as comments, PR metadata, or cycle behavior except where they intersect with label loading and filtering.
- It does not replace the broader ticket and workspace data-model documents.

## 3. Entry Points
- `server/src/modules/tickets/routes.ts`
- `server/src/modules/tickets/services/tickets.ts`
- `server/src/modules/workspaces/schema.ts`
- `server/src/db/bootstrap.ts`

## 4. Flow Steps
1. **Schema Bootstrapping**
   - `server/src/db/bootstrap.ts` ensures the `labels` and `ticket_labels` tables exist.
   - The bootstrap path also backfills legacy `domains` data into the new label tables when possible.
2. **Ticket Read Paths**
   - `listTickets`, `listWorkspaceTickets`, and `getTicketDetails` attach labels to each ticket response.
   - The server exposes both `labels` and `labelIds` on ticket payloads so the client can render chips and perform selection logic without another lookup.
3. **Ticket Write Paths**
   - Ticket creation and update requests can include `labelIds`.
   - When `labelIds` are supplied, the server resolves them against the ticket’s project and replaces the join rows in `ticket_labels`.
4. **Label CRUD**
   - Labels are created, updated, listed, and deleted through dedicated endpoints.
   - Deleting a label removes the join-table rows for that label in the same transaction.
5. **Filtering**
   - Ticket list queries can filter by one or more labels using `labels=id1,id2` and `labelMode=all|any`.
   - `all` requires every selected label to be present on a ticket, while `any` returns tickets with at least one matching label.

## 5. Data Stores and Resources

### `labels`
- **Purpose**: Stores label metadata.
- **Fields**: `id`, `teamId`, `projectId`, `name`, `color`, `description`, `sortOrder`, `createdAt`.
- **Behavior**: Labels are project-scoped in flat workspaces and team-scoped in team workspaces. Renaming or deleting a label updates every ticket that references it through the join table.
- **Indexing**: `labels_project_id_idx` keeps project-scoped label reads fast.

### `ticket_labels`
- **Purpose**: Join table that links tickets to labels.
- **Fields**: `ticketId`, `labelId`.
- **Constraints**: Composite primary key on `(ticketId, labelId)` prevents duplicate assignments.
- **Indexing**: `ticket_labels_label_id_idx` supports label-centric queries and counts.

### `tickets`
- **Purpose**: Primary work-item record.
- **Label Relationship**: Ticket labels are not stored as a single column on `tickets`; they are resolved through `ticket_labels`.
- **Legacy Compatibility**: `tickets.domain_id` still exists during the migration window, but it is treated as compatibility data rather than the canonical tagging model.

## 6. Interfaces and Contracts
- `GET /labels?projectId=` returns labels available to that project according to workspace hierarchy. `GET /labels?teamId=` returns team-scoped labels.
- `POST /labels` accepts an explicit `projectId` or `teamId`. Project scope derives the owning team; flat workspaces persist both IDs, while team workspaces persist `teamId` with a null `projectId`. Team-only creation requires a team workspace and works even if that team has no projects. A supplied project header also participates in scope resolution, so team-only clients must omit it.
- A supplied team and project must agree. Scope access is authorized before insertion; successful creation invalidates the owning workspace sidebar cache.
- `PUT /labels/:id` updates label metadata.
- `DELETE /labels/:id` deletes the label and clears join-table rows.
- `GET /tickets/:id/labels` returns the labels assigned to one ticket.
- `POST /tickets/:id/labels` assigns a label to a ticket.
- `DELETE /tickets/:id/labels/:labelId` unassigns a label from a ticket.
- `GET /tickets?labels=id1,id2&labelMode=all|any` filters tickets by label membership.
- `GET /domains` and `POST /domains` return a deprecation response with a warning header so older integrations fail clearly instead of silently diverging.

## 7. Permissions, Guards, or Tenant Boundaries
- Label endpoints authorize project or team access according to the supplied scope.
- In flat workspaces a label must belong to the ticket project; in team workspaces it must belong to the ticket project’s team.
- Label assignment and filtering respect workspace hierarchy, preventing labels from leaking across projects in flat workspaces or across teams in team workspaces.

## 8. Failure Modes, Observability, or Operational Notes
- Label assignment is idempotent because the join table uses a composite primary key and the assignment path ignores duplicate inserts.
- `labelIds` are deduplicated before insert or replacement work is performed.
- The server broadcasts ticket updates after label assignment and unassignment so the client can refresh lists and active ticket views.
- If the label migration has not been applied yet, legacy `domains` data may still exist, but the new label routes and join table are the supported path.

## 9. Change Hazards, Invariants, or Migration Constraints
- Keep label scope strict: project boundaries in flat workspaces and team boundaries in team workspaces.
- Do not collapse labels back into a single `tickets` column. The normalized join table is required for multiple labels per ticket and efficient filtering.
- Preserve the legacy `domain_id` field until all compatibility paths are removed intentionally.
- When deleting a label, remove the join rows in the same transaction so ticket reads never point at a dangling label.

## 10. Related Docs
- [Ticket Data Model](../TICKET_DATA_MODEL.md)
- [Server Tickets Module](../SERVER_MODULE_TICKETS.md)
- [Database Architecture Flow](../DATABASE_ARCHITECTURE_FLOW.md)
- [Workspace Data Model](../WORKSPACE_DATA_MODEL.md)
