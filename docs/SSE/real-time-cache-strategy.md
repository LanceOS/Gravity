# Real-time Data Sync Architecture (SSE + React Query Cache)

## Purpose

This document reflects the current implementation used to keep ticket and comment UI state fresh without triggering full UI refreshes on every mutation.

We now use:

- direct cache writes from SSE payloads when possible,
- coalesced SSE handling,
- immediate single-ticket fallback hydration when direct mutation is impossible,
- `keepPreviousData` to keep list/detail UIs stable during any fallback refetches.
- `ticketDetail` query staleness is long-lived (`staleTime: Number.POSITIVE_INFINITY`); freshness is driven by SSE cache writes and targeted hydration.

## Problem Context

Before this change, user actions were causing both optimistic cache writes and immediate invalidation from SSE response handling. This caused visible refresh churn and extra network work.

The goal is to remove that refresh loop while still keeping remote updates visible in near real time.

## Relevant Components

- `server/src/lib/mcp-event-bus.ts`
  - Shared SSE event types and dispatch entrypoint for MCP-originated events.
- `server/src/realtime.ts`
  - Broadcast bridge that pushes workspace events to connected clients.
- `server/src/modules/tickets/routes.ts`
  - REST ticket/comment routes that emit richer SSE payloads.
- `server/src/modules/tickets/mcp.ts`
  - MCP tool handlers that emit richer SSE payloads.
- `client/src/services/sseService.ts`
  - EventSource connection lifecycle.
- `client/src/services/SseEventCoalescer.ts`
  - Coalesces duplicate events during burst windows.
- `client/src/context/TicketContext.tsx`
  - Core SSE parser, cache mutation logic, and per-entity fallback hydration.
- `client/src/hooks/useTicketRelationActions.ts`
  - Relation mutations with detail-cache updates.
- `client/src/context/useMoveTicket.ts`
  - Move flow with cache-consistent behavior.

## Server Payload Contract

### Ticket events

- `ticket.created`
  - emits `data.ticket` and `data.projectId`
- `ticket.updated`
  - emits `data.ticket` and `data.projectId`
- `ticket.deleted`
  - emits `data.ticket`, `data.ticketId`, `data.projectId`

### Comment events

- `comment.added`
  - emits `data.comment`, `data.commentId`, `data.ticketId`, `data.ticketKey`
- `comment.updated`
  - emits `data.comment`, `data.commentId`, `data.ticketId`, `data.ticketKey`
- `comment.deleted`
  - emits `data.commentId`, `data.ticketId`, `data.ticketKey`

### Generic sync events

- `tickets-updated` and `comments-updated` remain for compatibility.
- They can still trigger single-ticket fallback hydration when payload detail is not sufficient for direct cache mutation.

## Client Flow in `TicketContext`

### 1. SSE ingress

- `TicketContext` subscribes to the workspace stream via `getSseService`.
- Each message is parsed into a `SseCoalescedEvent` with:
  - `type`
  - `projectId`
  - `ticketKey`
  - `data`
- Events from the same actor (`actorUserId === currentUserIdRef.current`) are ignored.

### 2. Coalescing

`SseEventCoalescer` merges duplicate events within the coalesce window and passes a batch to the SSE processor.

- dedupe key uses event `type`, `projectId`, and `ticketKey`.

### 3. Direct cache mutation path

For each event in a batch, `TicketContext` attempts direct state updates first.

- `upsertTicketFromSse(ticket)`
  - normalizes incoming ticket payload
  - updates `queryKeys.ticketDetail(ticket.id)`
  - updates list entries for all matching `['tickets', ...]` query keys
  - applies `updatedAt` freshness check (`shouldAcceptSseTicketUpdate`) before overwrite
- `upsertSseComment(comment)`
  - updates `queryKeys.comments(comment.ticketId)` by inserting/updating the comment row
  - applies `shouldAcceptSseCommentUpdate` before overwrite so optimistic local edits are preserved
- `removeSseComment(ticketId, commentId)`
  - removes a comment from `queryKeys.comments(ticketId)`
- `removeSseTicketEntries(ticketKey, ticketId)`
  - removes ticket rows from list/detail/relation caches
  - clears related comments/detail cache for that ticket id

The event-to-handler mapping is now:

- `ticket.created` / `ticket.updated` -> `upsertTicketFromSse` when `data.ticket` exists
- `ticket.deleted` -> `removeSseTicketEntries`
- `comment.added` / `comment.updated` -> `upsertSseComment`
- `comment.deleted` -> `removeSseComment`
- if payload is incomplete, processor attempts a per-ticket fetch from:
  - `GET /tickets/:id`
  - then applies `upsertTicketFromSse`

### 4. Targeted fallback hydration

Even with richer payloads, some events still arrive without full hydrated entities.
In those cases, we hydrate only the single ticket by ID and apply it through existing
`setQueryData` cache writes, avoiding broad ticket-list invalidation.

Fallback action:

- ticket refresh -> `GET /tickets/:id` + `upsertTicketFromSse` (per-entity hydration)
- comment refresh -> `invalidateQueries(queryKeys.comments(ticketId))` when the active ticket matches

## Staleness Control

`shouldAcceptSseTicketUpdate` and `shouldAcceptSseCommentUpdate` prevent stale SSE payloads from overwriting newer local or optimistic state by comparing `updatedAt` values.

If local data is newer or equal, the event update is ignored.

## Smooth rendering behavior

To avoid spinner/flicker when background invalidation triggers fetches:

- `queryKeys.tickets(activeProjectId)` uses `placeholderData: keepPreviousData`
- `queryKeys.comments(activeTicketId)` uses `placeholderData: keepPreviousData`
- `useTicketRelationActions` active detail query uses `placeholderData: keepPreviousData`

This keeps the existing visible data while a refetch happens.

## Guarantees

- UI does not immediately full-refetch on every user action.
- Most updates are applied immediately from SSE payloads into the local cache.
- Actor-originated echo events are filtered.
- Fallback invalidation remains deterministic for sparse payload paths.
- The app stays responsive under high-frequency event bursts.

## Tradeoffs

- Fallback behavior is immediate but scoped.
- Correctness still depends on payload completeness from all producers.
- Direct cache writes are expected to cover ticket/comment mutation-heavy paths now.

## Files changed by this refactor

- [client/src/context/TicketContext.tsx](/home/lance/Documents/Code/Gravity/client/src/context/TicketContext.tsx)
- [client/src/context/useMoveTicket.ts](/home/lance/Documents/Code/Gravity/client/src/context/useMoveTicket.ts)
- [client/src/hooks/useTicketRelationActions.ts](/home/lance/Documents/Code/Gravity/client/src/hooks/useTicketRelationActions.ts)
- [client/src/services/SseEventCoalescer.ts](/home/lance/Documents/Code/Gravity/client/src/services/SseEventCoalescer.ts)
- [client/src/services/sseService.ts](/home/lance/Documents/Code/Gravity/client/src/services/sseService.ts)
- [server/src/lib/mcp-event-bus.ts](/home/lance/Documents/Code/Gravity/server/src/lib/mcp-event-bus.ts)
- [server/src/modules/tickets/routes.ts](/home/lance/Documents/Code/Gravity/server/src/modules/tickets/routes.ts)
- [server/src/modules/tickets/mcp.ts](/home/lance/Documents/Code/Gravity/server/src/modules/tickets/mcp.ts)
- [docs/SSE/fixing-real-time-cache.md](/home/lance/Documents/Code/Gravity/docs/SSE/fixing-real-time-cache.md)
