# Client State Management

## 1. Purpose and Scope
This document outlines how the React client manages application state, data fetching, and context sharing across components. The application relies on custom React Contexts and hooks for state rather than external libraries like Redux or MobX.

## 2. Non-Goals or Boundary Limits
- Detailed component-level local state (e.g., `useState` in forms) is excluded unless it drives global application behavior.
- Database persistence details on the server side are covered in backend docs.

## 3. Entry Points
- `client/src/context/TicketContext.tsx`: The primary global context provider for tickets, projects, and domains.
- `client/src/hooks/useWorkspaceDirectory.ts`: Hook for managing workspaces globally.
- `client/src/hooks/useAccountSettings.ts`: Hook for managing user settings and themes.

## 4. Flow Steps
1. **Initial Mount**:
   - `App.tsx` wraps the application in `ThemeProvider` and `TicketProvider`.
2. **User Authentication Check**:
   - `TicketContext` uses `useEffect` to fetch `GET /api/auth/session` with `credentials: 'same-origin'`. If a valid user is returned, `currentUser` is set.
3. **Initial Data Hydration**:
   - Once `currentUser` is set, `fetchInitialData(userId)` fetches projects and users, and initializes tickets, domains, and cycles as empty state.
4. **Project-Scoped Data Hydration**:
   - When `activeProjectId` is set or changes, `fetchProjectData(activeProjectId)` loads the active project's tickets, domains, and cycles into global state.
5. **Workspace Context**:
   - `useWorkspaceDirectory` fetches the list of workspaces the user is a member of. The active workspace filters the globally available tickets and projects.

## 5. Data Stores and Resources
- **React Context (`TicketContext`)**: Holds virtually all primary domain objects (Tickets, Users, Projects, Domains, Cycles) in memory.
- **Custom Hooks**:
  - `useWorkspaceDirectory`: manages workspaces list and workspace join/create requests.
  - `useWorkspaceSettings`: manages workspace settings and members for the active workspace.
  - `useAccountSettings`: manages personal account preferences and Local AI settings.

## 6. Interfaces and Contracts
- `TicketContextType` in `TicketContext.tsx` defines the shape of the global state and mutations.
- `fetchInitialData` hydrates projects and users, while initializing tickets, domains, and cycles as empty state; ticket data is loaded later by `fetchProjectData(activeProjectId)`.

## 7. Key Files and Modules
- `client/src/context/TicketContext.tsx`: Central state hub.
- `client/src/hooks/useAccountSettings.ts`: Account API integration.
- `client/src/hooks/useWorkspaceDirectory.ts`: Directory API integration.
- `client/src/hooks/useWorkspaceSettings.ts`: Workspace admin API integration.

## 8. Permissions, Guards, or Tenant Boundaries
- Data fetching in `TicketContext` and custom hooks rely on the server verifying the user's session cookie. 
- Client-side filtering applies `activeWorkspaceId` to ensure users only see projects and tickets belonging to the workspace they are currently viewing. However, the true tenant boundary is enforced by the server on every API call.

## 9. Failure Modes, Observability, or Operational Notes
- **State Stagnation / Partial Real-Time Sync**: The app does not use WebSockets, but `TicketContext` does subscribe to Server-Sent Events (SSE) via `/api/v1/events/subscribe` and reacts to events such as `tickets-updated` and `comments-updated`. In practice, this means some ticket/comment changes can appear without a full page refresh. However, the live updates are still limited to what the active SSE handling refreshes (for example, the currently active project or ticket context), so users may still need to refresh or navigate to see changes outside that active scope.
- **Race Conditions**: Some hooks have loading states (`settingsLoading`, `saveLoading`). UI components must respect these states to prevent double-submissions.

## 10. Change Hazards, Invariants, or Migration Constraints
- **Fat Context**: `TicketContext` holds a significant amount of data and business logic. Future refactoring should consider splitting it into smaller, domain-specific contexts (e.g., `ProjectContext`, `UserContext`) to avoid unnecessary re-renders.

## 11. Related Docs
- [Client Architecture Overview](CLIENT_ARCHITECTURE_OVERVIEW.md)
- [Client Routing Flow](CLIENT_ROUTING_FLOW.md)
