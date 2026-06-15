import { createBrowserRouter, Navigate, useParams } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { AccountPreferencesPageRoute } from '../pages/AccountPreferencesPage/AccountPreferencesPage';
import { AppShellPage } from '../pages/AppShellPage/AppShellPage';
import { WorkspaceSettingsPageRoute } from '../pages/WorkspaceSettingsPage/WorkspaceSettingsPage';
import { ProtectedRoute } from './ProtectedRoute';
import { LoadingPage } from '../pages/LoadingPage/LoadingPage';

// Lazy load placeholder views for code-splitting
const WorkspaceExportView = lazy(() => import('../pages/PlaceholderViews/WorkspaceExportView'));
const NotFoundView = lazy(() => import('../pages/PlaceholderViews/NotFoundView'));
const PlaceholderPage = lazy(() => import('../pages/PlaceholderPage'));

function ProjectHomeGuard() {
  const { workspaceId, projectId } = useParams();
  return <Navigate to={`/workspaces/${workspaceId}/projects/${projectId}/tickets`} replace />;
}

function TeamLabelRedirect() {
  const { workspaceId, teamId, domainId } = useParams();
  return <Navigate to={`/workspaces/${workspaceId}/teams/${teamId}/labels/${domainId}`} replace />;
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <AppShellPage />
      </ProtectedRoute>
    ),
  },
  
  // Workspace Directory / Workspace Overview Page
  {
    path: '/workspaces',
    element: (
      <ProtectedRoute>
        <AppShellPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/workspaces/:workspaceId',
    element: (
      <ProtectedRoute>
        <AppShellPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/workspaces/:workspaceId/settings',
    element: (
      <ProtectedRoute>
        <WorkspaceSettingsPageRoute />
      </ProtectedRoute>
    ),
  },
  {
    path: '/workspaces/:workspaceId/projects',
    element: (
      <ProtectedRoute>
        <AppShellPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/workspaces/:workspaceId/projects/list',
    element: (
      <ProtectedRoute>
        <AppShellPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/workspaces/:workspaceId/teams',
    element: (
      <ProtectedRoute>
        <AppShellPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/account',
    element: (
      <ProtectedRoute>
        <AccountPreferencesPageRoute />
      </ProtectedRoute>
    ),
  },

  // ----------------------------------------------------
  // New Workspace / Team / Project URL Structure Routes
  // ----------------------------------------------------

  // All tasks (workspace-level)
  {
    path: '/workspaces/:workspaceId/all',
    element: (
      <ProtectedRoute>
        <AppShellPage />
      </ProtectedRoute>
    ),
  },
  // Team overview
  {
    path: '/workspaces/:workspaceId/teams/:teamId',
    element: (
      <ProtectedRoute>
        <AppShellPage />
      </ProtectedRoute>
    ),
  },
  // Team-level all tasks
  {
    path: '/workspaces/:workspaceId/teams/:teamId/tasks',
    element: (
      <ProtectedRoute>
        <AppShellPage />
      </ProtectedRoute>
    ),
  },
  // Team-level specific view
  {
    path: '/workspaces/:workspaceId/teams/:teamId/views/:viewId',
    element: (
      <ProtectedRoute>
        <AppShellPage />
      </ProtectedRoute>
    ),
  },
  // Team cycle view
  {
    path: '/workspaces/:workspaceId/teams/:teamId/cycles/:cycleId',
    element: (
      <ProtectedRoute>
        <AppShellPage />
      </ProtectedRoute>
    ),
  },
  // Legacy compatibility route for label-filtered views
  {
    path: '/workspaces/:workspaceId/teams/:teamId/domains/:domainId',
    element: (
      <ProtectedRoute>
        <TeamLabelRedirect />
      </ProtectedRoute>
    ),
  },
  // Label-filtered view
  {
    path: '/workspaces/:workspaceId/teams/:teamId/labels/:labelId',
    element: (
      <ProtectedRoute>
        <AppShellPage />
      </ProtectedRoute>
    ),
  },
  // Team projects list page
  {
    path: '/workspaces/:workspaceId/teams/:teamId/projects',
    element: (
      <ProtectedRoute>
        <AppShellPage />
      </ProtectedRoute>
    ),
  },
  // Team project overview
  {
    path: '/workspaces/:workspaceId/teams/:teamId/projects/:projectId',
    element: (
      <ProtectedRoute>
        <AppShellPage />
      </ProtectedRoute>
    ),
  },
  // Team-level project ticket list
  {
    path: '/workspaces/:workspaceId/teams/:teamId/projects/:projectId/tickets',
    element: (
      <ProtectedRoute>
        <AppShellPage />
      </ProtectedRoute>
    ),
  },
  // Team-level project ticket detail
  {
    path: '/workspaces/:workspaceId/teams/:teamId/projects/:projectId/tickets/:ticketKey',
    element: (
      <ProtectedRoute>
        <AppShellPage />
      </ProtectedRoute>
    ),
  },
  // Team-level project notes list
  {
    path: '/workspaces/:workspaceId/teams/:teamId/projects/:projectId/notes',
    element: (
      <ProtectedRoute>
        <AppShellPage />
      </ProtectedRoute>
    ),
  },
  // Team-level project note detail
  {
    path: '/workspaces/:workspaceId/teams/:teamId/projects/:projectId/notes/:noteId',
    element: (
      <ProtectedRoute>
        <AppShellPage />
      </ProtectedRoute>
    ),
  },

  // Individual (no teams) routing:
  {
    path: '/workspaces/:workspaceId/projects/:projectId',
    element: (
      <ProtectedRoute>
        <ProjectHomeGuard />
      </ProtectedRoute>
    ),
  },
  {
    path: '/workspaces/:workspaceId/projects/:projectId/tickets',
    // Renders AppShellPage so the workspace shell + ticket list context is fully preserved
    element: (
      <ProtectedRoute>
        <AppShellPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/workspaces/:workspaceId/projects/:projectId/tickets/:ticketKey',
    // Renders AppShellPage; it reads ticketKey from URL params to open the detail panel
    element: (
      <ProtectedRoute>
        <AppShellPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/workspaces/:workspaceId/projects/:projectId/notes',
    element: (
      <ProtectedRoute>
        <AppShellPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/workspaces/:workspaceId/projects/:projectId/notes/:noteId',
    element: (
      <ProtectedRoute>
        <AppShellPage />
      </ProtectedRoute>
    ),
  },
  
  // Export tasks/notes
  {
    path: '/workspaces/:workspaceId/settings/export',
    element: (
      <ProtectedRoute>
        <Suspense fallback={<LoadingPage />}>
          <WorkspaceExportView />
        </Suspense>
      </ProtectedRoute>
    ),
  },

  // Backward compatibility with legacy placeholder page
  {
    path: '/placeholder/:id',
    element: (
      <ProtectedRoute>
        <Suspense fallback={<LoadingPage />}>
          <PlaceholderPage />
        </Suspense>
      </ProtectedRoute>
    ),
  },

  // 404 Route for invalid paths
  {
    path: '*',
    element: (
      <Suspense fallback={<LoadingPage />}>
        <NotFoundView />
      </Suspense>
    ),
  },
]);
