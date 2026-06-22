# Ticket Provider Order

`TicketProvider` now acts as a compatibility shell that composes the decomposed ticket-domain providers in a fixed order.

## Runtime Order

```tsx
QueryClientProvider
  AuthProvider
    ThemeProvider
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
                                CompatibilityTicketProvider
                                  RouterProvider
```

## Notes

- `ThemeProvider` in the shell is a composition layer: it mounts the persisted app-theme provider first and the settings-theme provider second so both `useTheme()` hooks remain available.
- `ProjectProvider` stays above `RealtimeProvider` because realtime workspace resolution depends on project metadata.
- `TicketDetailProvider` stays above `TicketRelationsProvider` because relation actions need the active ticket detail snapshot.
- `CompatibilityTicketProvider` must remain last so the legacy `TicketContextType` is rebuilt from the narrower contexts instead of owning state directly.

## Guardrails

- Providers may depend only on providers listed above them.
- New high-traffic consumers should prefer narrow hooks such as `useAuth()`, `useTheme()`, `useTicketList()`, and `useTicketFilters()`.
- Shared helpers in `context/shared/` must remain leaf modules and must not import provider files.
