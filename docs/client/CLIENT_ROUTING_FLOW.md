# Client Routing & Flow

## 1. Purpose and Scope
This document explains the URL-based routing architecture of the React client using `react-router-dom`. The application integrates page-level URL paths with the application shell, providing shareable/bookmarkable URLs for settings, directory views, project lists, task boards, and notes.

## 2. Non-Goals or Boundary Limits
- Server-side API routing (Express routes) is not covered.
- The detailed API state synchronization backing these routes is covered in [Client State Management](CLIENT_STATE_MANAGEMENT.md).

## 3. Entry Points
- `client/src/router/index.tsx`: Defines the `createBrowserRouter` configuration containing all application routes, redirect patterns, and authentication guards.
- `client/src/pages/AppShellPage/AppShellPage.tsx`: The primary shell orchestrator that synchronizes its active view states (`activeSection`, `activeWorkspaceId`) with the active URL parameters.

## 4. Proposed Route Structure

The application supports the following URL structure:

### Workspace & Global Views
- `/` - Home entry point (evaluates active workspace and redirects)
- `/workspaces` - Workspace Directory (select, create, or join workspaces)
- `/workspaces/:workspaceId` - Workspace Overview Dashboard
- `/workspaces/:workspaceId/all` - Workspace-level All Tasks (consolidated backlog)
- `/workspaces/:workspaceId/settings` - Workspace settings (invites, member approvals)
- `/workspaces/:workspaceId/settings/export` - Export workspace tickets & notes
- `/account` - Global user account settings & preferences

### Team-scoped Views (Mock / Premium)
- `/workspaces/:workspaceId/teams/:teamId` - Team overview dashboard
- `/workspaces/:workspaceId/teams/:teamId/tasks` - Team backlog
- `/workspaces/:workspaceId/teams/:teamId/views/:viewId` - Custom filtered team view
- `/workspaces/:workspaceId/teams/:teamId/cycles/:cycleId` - Active team cycle burndown chart
- `/workspaces/:workspaceId/teams/:teamId/domains/:domainId` - Domain-filtered team backlog
- `/workspaces/:workspaceId/teams/:teamId/projects/:projectId` - Team project overview dashboard

### Individual (No Teams) Views
- `/workspaces/:workspaceId/projects/:projectId/tickets` - Project-level tickets board/list
- `/workspaces/:workspaceId/projects/:projectId/tickets/:ticketKey` - Ticket detail inspector
- `/workspaces/:workspaceId/projects/:projectId/notes` - Project-level notes directory
- `/workspaces/:workspaceId/projects/:projectId/notes/:noteId` - Rich-text note editor

---

## 5. Routing Guards & Redirections

### Authentication Guard (`ProtectedRoute`)
All authenticated paths are wrapped in a `<ProtectedRoute>` component. If the user session is loading, a loading page is displayed; if unauthenticated, the user is redirected to the Auth Screen module.

### Home / Backward Compatibility Redirection
- When a user lands on `/`, the `HomeRedirect` component runs:
  1. Checks if the user is authenticated.
  2. Resolves the user's last-active workspace ID from `localStorage`.
  3. Redirects to `/workspaces/:workspaceId` if found; otherwise, redirects to the directory view at `/workspaces`.
- Legacy entry point `/placeholder/:id` redirects to `/workspaces/:id` for backward compatibility.

### Graceful Degradation for Team Project Routing
Since teams are not yet fully implemented in the database/workspace models, any attempt to access team-scoped project paths automatically redirects to individual equivalents:
- `/workspaces/:workspaceId/teams/:teamId/projects/:projectId/tickets` ➔ `/workspaces/:workspaceId/projects/:projectId/tickets`
- `/workspaces/:workspaceId/teams/:teamId/projects/:projectId/tickets/:ticketKey` ➔ `/workspaces/:workspaceId/projects/:projectId/tickets/:ticketKey`
- `/workspaces/:workspaceId/teams/:teamId/projects/:projectId/notes` ➔ `/workspaces/:workspaceId/projects/:projectId/notes`
- `/workspaces/:workspaceId/teams/:teamId/projects/:projectId/notes/:noteId` ➔ `/workspaces/:workspaceId/projects/:projectId/notes/:noteId`

General team-level views (e.g., cycles, custom views) render beautiful placeholder dashboards displaying a friendly alert explaining that teams are a premium feature, offering navigation fallback links.

---

## 6. App Shell Synchronization
The `AppShellPage` synchronizes its internal section flags with URL parameters using a `useEffect` hook:
```typescript
const { workspaceId } = useParams();
const { pathname } = useLocation();

useEffect(() => {
  if (pathname === '/workspaces' || pathname === '/workspaces/') {
    setActiveSection('directory');
  } else if (pathname === '/account' || pathname === '/account/') {
    setActiveSection('account');
  } else if (workspaceId) {
    setActiveWorkspaceId(workspaceId);
    if (pathname.includes('/settings')) {
      setActiveSection('settings');
    } else if (pathname.includes('/projects')) {
      setActiveSection('projects');
    } else {
      setActiveSection('workspace');
    }
  }
}, [pathname, workspaceId]);
```

This synchronization enables bookmarkable/shareable links while maintaining the underlying UI layout shell structure.

---

## 7. Related Docs
- [Client Architecture Overview](CLIENT_ARCHITECTURE_OVERVIEW.md)
- [Client State Management](CLIENT_STATE_MANAGEMENT.md)
