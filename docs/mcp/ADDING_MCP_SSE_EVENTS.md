# Adding an MCP Tool That Emits SSE Events

## Purpose
Use this guide when adding a new MCP tool or mutation path that should update the UI in real time. The goal is to keep the write path authoritative on the server while letting the client stay in sync through SSE broadcasts and targeted cache refreshes.

## Recommended Pattern

1. Add or update the MCP tool definition in the owning module.
2. Perform the write in the module service layer.
3. Publish a typed event on `mcpEventBus` after the write succeeds.
4. Let `server/src/realtime.ts` broadcast the event to workspace-scoped SSE clients.
5. Update the client handler only if the new event type needs a new refetch target.
6. Add E2E coverage for the mutation-to-UI path.

## Event Contract

Every realtime event should carry the same envelope:

- `type`
- `workspaceId`
- `projectId`
- `teamId`
- `ticketKey`
- `actorUserId`
- `timestamp`
- `data`

Keep `data` specific to the mutation and avoid stuffing the full application state into the event. The client should usually refetch the authoritative resource instead of trusting an oversized payload.

## Choosing an Event Type

Prefer the existing typed events when possible:

- `ticket.created`
- `ticket.updated`
- `ticket.deleted`
- `comment.added`
- `comment.updated`
- `comment.deleted`
- `labels.added`
- `labels.removed`
- `labels.set`
- `dependency.added`
- `dependency.removed`

Use legacy broad-refresh events only when you need compatibility with older listeners.

## Implementation Checklist

- Verify the actor is authorized to mutate the workspace or project.
- Update the canonical data source first.
- Emit the event only after the write succeeds.
- Include the affected `workspaceId` and `ticketKey` whenever the mutation is ticket-scoped.
- If the mutation affects comments, make sure the payload identifies the ticket or comment thread that the client should refetch.
- If the mutation touches labels or dependencies, prefer a targeted ticket refresh over a global refresh.
- Do not publish directly to the SSE transport from the tool handler.

## Client Side Expectations

The current client uses `TicketContext` plus `SseEventCoalescer` to turn a burst of SSE messages into a small number of requests. That means new events should map cleanly to one of these refresh paths:

- Ticket detail with relations
- Comment thread
- A compatibility fallback for broader refreshes

If a new mutation type needs a different refresh target, update the client handler in the same change.

## Testing Expectations

Add or extend E2E coverage for:

- A happy-path mutation that updates the UI without refresh
- A disconnected client that reconnects and resumes updates
- A non-member client that receives no events
- A burst of rapid mutations that is coalesced into a small number of fetches

The existing `MCP SSE pipeline` test suite is the right place to expand coverage for new mutation types.

## Related Docs

- [MCP Flow](MCP_FLOW.md)
- [Client State Management](../client/CLIENT_STATE_MANAGEMENT.md)
- [Server Architecture Overview](../server/SERVER_ARCHITECTURE_OVERVIEW.md)
