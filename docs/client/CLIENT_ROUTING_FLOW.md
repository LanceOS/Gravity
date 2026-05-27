# Client Routing & Flow

## 1. Purpose and Scope
This document explains how the React client handles routing, navigation flows, and layout composition. The application employs a custom section-based routing state inside a primary application shell instead of a traditional URL-based router like `react-router-dom`.

## 2. Non-Goals or Boundary Limits
- Server-side routing (e.g., Express routes) is not covered here.
- The detailed API state synchronization backing these routes is covered in [Client State Management](CLIENT_STATE_MANAGEMENT.md).

## 3. Entry Points
- `client/src/pages/AppShellPage/AppShellPage.tsx`: The primary orchestrator component that handles all conditional rendering based on authentication and active sections.

## 4. Flow Steps
1. **Authentication Check**: 
   - If `!currentUser`, the `AuthScreen` is rendered.
   - If `loading` or workspaces are fetching, `LoadingPage` is rendered.
2. **Onboarding Check**:
   - If the user has not completed the tutorial (`currentUser.tutorial_completed === 0`), the `OnboardingModal` renders on top of the current screen.
3. **Workspace Resolution**:
   - The app reads `gravity_active_workspace:{userId}` from `localStorage`.
   - If no workspaces exist, the user is locked to the `directory` section.
4. **Section Rendering**:
   - Based on `activeSection` state, one of the following is rendered:
     - `'directory'`: `WorkspaceDirectoryPage`
     - `'workspace'`: `WorkspaceLayout` wrapping `WorkspacePage`
     - `'projects'`: `WorkspaceLayout` wrapping `WorkspaceProjectsPage`
     - `'settings'`: `SettingsPage`
     - `'account'`: `AccountPreferencesPage`

## 5. Data Stores and Resources
- **Local Storage (`gravity_active_workspace`)**: Persists the user's last visited workspace across reloads.
- **Local Storage (`gravity_pending_invite`)**: Temporarily stores an invite code when the app boots from a `?invite=...` URL parameter, so the invite can be processed post-login.

## 6. Interfaces and Contracts
- `activeSection` state drives the top-level view:
  ```typescript
  type AppSection = 'directory' | 'workspace' | 'settings' | 'account' | 'projects';
  ```

## 7. Key Files and Modules
- `client/src/pages/AppShellPage/AppShellPage.tsx`: The router logic.
- `client/src/layouts/WorkspaceLayout/WorkspaceLayout.tsx`: The main layout wrapper providing the Sidebar, Workspace header, and right-hand drawer panels (e.g., AI Chat).

## 8. Permissions, Guards, or Tenant Boundaries
- Users cannot navigate to `'workspace'`, `'settings'`, or `'projects'` if they do not belong to at least one workspace.
- Invite links bypass standard workspace selection by capturing the `?invite=` query param and automatically resolving the workspace join request.

## 9. Failure Modes, Observability, or Operational Notes
- If local storage contains an invalid `activeWorkspaceId`, the application gracefully falls back to the first available workspace in the user's list.
- If all workspaces are deleted, the application falls back to the `'directory'` section.

## 10. Change Hazards, Invariants, or Migration Constraints
- **URL Syncing**: Since the app uses state-based routing rather than standard URL paths, users cannot bookmark specific tickets or projects currently. Future migrations to a real router must preserve the invite query parameter logic.

## 11. Related Docs
- [Client Architecture Overview](CLIENT_ARCHITECTURE_OVERVIEW.md)
- [Client State Management](CLIENT_STATE_MANAGEMENT.md)
