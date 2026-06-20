# Provider Ordering Plan

## Current Provider Hierarchy (App.tsx)

```
QueryClientProvider          ← outermost data layer
  ThemeContextProvider       ← theme state + persistence
    SettingsThemeProvider    ← CSS variables + density
      ActiveProjectProvider  ← active project selection
        TicketProvider       ← ticket / user / comment orchestration
          RouterProvider     ← routing; consumes context via hooks
```

## Ordering Rules

### Rule 1 — `QueryClientProvider` must be outermost
`TicketProvider` calls `useQueryClient()` internally. If `QueryClientProvider` were nested inside `TicketProvider`, the hook would throw. It must wrap everything that touches React Query.

### Rule 2 — Theme providers have separate responsibilities
`ThemeContextProvider` owns persisted theme state and `SettingsThemeProvider` only reads that state to manage CSS custom properties and density. Neither provider calls `useCurrentUser()`, `useTicketListContext()`, or `useQueryClient()`, so they can sit anywhere between `QueryClientProvider` and `TicketProvider` without causing dependency issues.

### Rule 3 — `TicketProvider` must wrap `RouterProvider`
All routed page components that read ticket data (`useTicketListContext()`, `useProjectContext()`, `useTicketDetailContext()`, or `useCommentContext()`) must have `TicketProvider` mounted above them.

### Rule 4 — Future contexts that **depend on** ticket data
Any new context/provider that calls `useTicketListContext()`, `useTicketDetailContext()`, or `useCommentContext()` internally must be nested **inside** `TicketProvider`.

Example (correct):
```tsx
<TicketProvider>
  <NotificationProvider>   {/* reads tickets via ticket-specific hooks */}
    <RouterProvider ... />
  </NotificationProvider>
</TicketProvider>
```

### Rule 5 — Future contexts that ticket logic **depends on**
Any new context/provider that `TicketProvider` itself consumes via a hook must be nested **outside** `TicketProvider`.

Example (correct):
```tsx
<AuthProvider>             {/* TicketProvider reads auth state */}
  <TicketProvider>
    <RouterProvider ... />
  </TicketProvider>
</AuthProvider>
```

## Planned Future Contexts (Phase 1+)

When the monolithic `TicketProvider` is decomposed into smaller providers, the intended nesting order is:

```
QueryClientProvider
  ThemeContextProvider
    SettingsThemeProvider
      ActiveProjectProvider  ← active project selection
        TicketProvider       ← composes current-user, project, ticket, and realtime state
          RouterProvider
```

If a future ticket-specific provider is split out of `TicketProvider`, the decomposition should follow the earlier planned ordering and keep each provider dependent only on the layer above it.

## Circular Import Guard

All shared utilities live in `context/shared/` and import exclusively from:
- `src/types/domain.ts`
- `src/modules/tickets/utils/ticketRelations.ts`

No shared module imports from any context provider file. This is enforced by the directory structure: shared modules are leaves in the dependency graph.
