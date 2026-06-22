# Provider Ordering Plan

## Shell Hierarchy

`TicketProvider` is now the compatibility shell for the ticket domain. It composes the full provider stack below, while `QueryClientProvider` still remains the outermost React Query boundary in `App.tsx`.

```
QueryClientProvider
  TicketProvider
    AuthProvider
      ThemeProvider
        SettingsThemeProvider
          ActiveProjectProvider
            ProjectProvider
              ActiveViewProvider
                TicketFiltersProvider
                  UserDirectoryProvider
                    CycleProvider
                      LabelProvider
                        TicketListProvider
                          TicketDetailProvider
                            TicketMutationProvider
                              CommentProvider
                                TicketRelationsProvider
                                  RealtimeProvider
                                    CompatibilityTicketProvider (legacy)
```

## Ordering Rules

### Rule 1 - `QueryClientProvider` must stay outermost
`AuthProvider`, `ProjectProvider`, `TicketListProvider`, and `RealtimeProvider` all depend on React Query. They must stay below the query client.

### Rule 2 - Theme state is initialized before workspace data
`ThemeProvider` owns app theme state and `SettingsThemeProvider` layers density and CSS variables on top of it. They remain above workspace and ticket providers so the rest of the tree can safely read theme context.

### Rule 3 - `TicketProvider` must wrap routed app content
All routed pages that read ticket data, project data, auth state, or ticket mutations should live under `TicketProvider`.

### Rule 4 - Leaf providers should not import siblings
Shared utilities continue to live under `context/shared/`, and provider files should only depend on contexts above them in the tree or pure helpers.

## Migration Notes

- `useAuth()` replaces direct session reads in high-traffic components that only need user identity or sign-out behavior.
- `useTicketList()` exposes the live ticket list and ticket map without dragging in the legacy compatibility object.
- `useUserDirectory()` exposes the workspace-wide user list.
- `useTicketRelationsContext()` and `useCommentContext()` provide narrower mutation surfaces for relation and comment flows.
- `TicketContext` remains available through the compatibility provider while consumers are migrated incrementally.
