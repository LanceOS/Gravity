# Ticket Provider Order

The ticket-domain providers are split by route scope. `AppContextProviders` is the app-wide shell, `ProjectContextProviders` is mounted around app-shell routes that need project metadata, and `WorkspaceTicketProviders` is mounted only around workspace shell routes that need ticket state/metadata/realtime. Ticket action/detail/comment providers are a separate opt-in layer. `TicketProvider` remains as a compatibility shell for callers that still need the full historical stack.

## Runtime Order

```tsx
QueryClientProvider
  AppContextProviders
    AuthProvider
      ThemeProvider
        ActiveViewProvider
          RouterProvider

App shell routes
  ProtectedRoute
    ProjectContextProviders
      ActiveProjectProvider
        ProjectProvider
          AppShellPage

Workspace shell routes with ticket actions
  ProtectedRoute
    ProjectContextProviders
      ActiveProjectProvider
        ProjectProvider
          WorkspaceTicketProviders
            WorkspaceTicketStateProviders
              TicketFiltersProvider
                UserDirectoryProvider
                  TicketListProvider
            WorkspaceTicketMetadataProviders
              CycleProvider
                LabelProvider
            WorkspaceTicketRealtimeProviders
              RealtimeProvider
            WorkspaceShellPage
              WorkspaceTicketActionProviders
                TicketDetailProvider
                  TicketMutationProvider
                    CommentProvider
                      TicketRelationsProvider
                        WorkspaceIssueSurface

Workspace management routes
  ProtectedRoute
    ProjectContextProviders
      ActiveProjectProvider
        ProjectProvider
          WorkspaceTicketProviders
            WorkspaceShellPage
              WorkspaceTicketActionProviders
                WorkspaceWebMcpRegistration (only when browser-native WebMCP is supported)

Legacy compatibility wrapper
  TicketProvider
    AppContextProviders
      ProjectContextProviders
        WorkspaceTicketProviders
          WorkspaceTicketActionProviders
            CompatibilityTicketProvider
```

## Notes

- `ThemeProvider` in the shell is a composition layer: it mounts the persisted app-theme provider first and the settings-theme provider second so both `useTheme()` hooks remain available.
- `ProtectedRoute` depends only on `AuthProvider`; project loading belongs to routes/pages that mount `ProjectContextProviders`.
- `ProjectProvider` stays above `RealtimeProvider` because realtime workspace resolution depends on project metadata.
- `TicketDetailProvider` stays above `TicketRelationsProvider` because relation actions need the active ticket detail snapshot.
- `CompatibilityTicketProvider` is no longer mounted by production workspace routes. It must remain inside the legacy `TicketProvider` so the legacy `TicketContextType` is rebuilt from the narrower contexts instead of owning state directly.
- `WorkspaceTicketProviders` intentionally excludes `WorkspaceTicketActionProviders`; routes or components that need mutations/detail/comments/relations opt into the action layer explicitly.
- Pure management surfaces such as workspace project management, workspace project list, teams management, and team project management skip `WorkspaceTicketActionProviders` unless browser-native WebMCP registration is available and needs ticket actions.
- `WorkspaceShellPage` owns the frame, routing, sidebar, workspace/project management, WebMCP action bridge placement, and non-ticket overlays. `WorkspaceIssueSurface` owns ticket mutations, detail, comments, relations, and the create-ticket modal.

## Guardrails

- Providers may depend only on providers listed above them.
- New routes should mount the narrowest provider bundle that satisfies their hooks.
- New high-traffic consumers should prefer narrow hooks such as `useAuth()`, `useTheme()`, `useTicketList()`, and `useTicketFilters()`.
- Shared helpers in `context/shared/` must remain leaf modules and must not import provider files.
