import { createBrowserRouter, Navigate, useParams } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import type { ReactNode } from 'react';
import {
  ProjectContextProviders,
  WorkspaceTicketActionProviders,
  WorkspaceTicketProviders,
} from '../context/TicketContext';
import { AccountPreferencesPageRoute } from '../pages/AccountPreferencesPage/AccountPreferencesPage';
import { AppShellPage } from '../pages/AppShellPage/AppShellPage';
import { WorkspaceShellPage } from '../pages/WorkspaceShellPage/WorkspaceShellPage';
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

function protectedElement(children: ReactNode) {
  return <ProtectedRoute>{children}</ProtectedRoute>;
}

function projectElement(children: ReactNode) {
  return protectedElement(
    <ProjectContextProviders>
      {children}
    </ProjectContextProviders>
  );
}

function appShellElement() {
  return projectElement(<AppShellPage />);
}

function workspaceShellElement({ withTicketActions = true }: { withTicketActions?: boolean } = {}) {
  const shellPage = <WorkspaceShellPage />;

  return projectElement(
    <WorkspaceTicketProviders>
      {withTicketActions ? (
        <WorkspaceTicketActionProviders>{shellPage}</WorkspaceTicketActionProviders>
      ) : shellPage}
    </WorkspaceTicketProviders>
  );
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: appShellElement(),
  },
  
  // Workspace Directory / Workspace Overview Page
  {
    path: '/workspaces',
    element: appShellElement(),
  },
  {
    path: '/workspaces/:workspaceId',
    element: workspaceShellElement(),
  },
  {
    path: '/workspaces/:workspaceId/settings',
    element: protectedElement(<WorkspaceSettingsPageRoute />),
  },
  {
    path: '/workspaces/:workspaceId/projects',
    element: workspaceShellElement({ withTicketActions: false }),
  },
  {
    path: '/workspaces/:workspaceId/projects/list',
    element: workspaceShellElement({ withTicketActions: false }),
  },
  {
    path: '/workspaces/:workspaceId/teams',
    element: workspaceShellElement({ withTicketActions: false }),
  },
  {
    path: '/account',
    element: protectedElement(<AccountPreferencesPageRoute />),
  },

  // ----------------------------------------------------
  // New Workspace / Team / Project URL Structure Routes
  // ----------------------------------------------------

  // All tasks (workspace-level)
  {
    path: '/workspaces/:workspaceId/all',
    element: workspaceShellElement(),
  },
  // Team overview
  {
    path: '/workspaces/:workspaceId/teams/:teamId',
    element: workspaceShellElement(),
  },
  // Team-level all tasks
  {
    path: '/workspaces/:workspaceId/teams/:teamId/tasks',
    element: workspaceShellElement(),
  },
  // Team-level specific view
  {
    path: '/workspaces/:workspaceId/teams/:teamId/views/:viewId',
    element: workspaceShellElement(),
  },
  // Team cycle view
  {
    path: '/workspaces/:workspaceId/teams/:teamId/cycles/:cycleId',
    element: workspaceShellElement(),
  },
  // Legacy compatibility route for label-filtered views
  {
    path: '/workspaces/:workspaceId/teams/:teamId/domains/:domainId',
    element: protectedElement(<TeamLabelRedirect />),
  },
  // Label-filtered view
  {
    path: '/workspaces/:workspaceId/teams/:teamId/labels/:labelId',
    element: workspaceShellElement(),
  },
  // Team projects list page
  {
    path: '/workspaces/:workspaceId/teams/:teamId/projects',
    element: workspaceShellElement({ withTicketActions: false }),
  },
  // Team project overview
  {
    path: '/workspaces/:workspaceId/teams/:teamId/projects/:projectId',
    element: workspaceShellElement(),
  },
  // Team-level project ticket list
  {
    path: '/workspaces/:workspaceId/teams/:teamId/projects/:projectId/tickets',
    element: workspaceShellElement(),
  },
  // Team-level project ticket detail
  {
    path: '/workspaces/:workspaceId/teams/:teamId/projects/:projectId/tickets/:ticketKey',
    element: workspaceShellElement(),
  },
  // Team-level project notes list
  {
    path: '/workspaces/:workspaceId/teams/:teamId/projects/:projectId/notes',
    element: workspaceShellElement(),
  },
  // Team-level project note detail
  {
    path: '/workspaces/:workspaceId/teams/:teamId/projects/:projectId/notes/:noteId',
    element: workspaceShellElement(),
  },

  // Individual (no teams) routing:
  {
    path: '/workspaces/:workspaceId/projects/:projectId',
    element: protectedElement(<ProjectHomeGuard />),
  },
  {
    path: '/workspaces/:workspaceId/projects/:projectId/tickets',
    element: workspaceShellElement(),
  },
  {
    path: '/workspaces/:workspaceId/projects/:projectId/tickets/:ticketKey',
    element: workspaceShellElement(),
  },
  {
    path: '/workspaces/:workspaceId/projects/:projectId/notes',
    element: workspaceShellElement(),
  },
  {
    path: '/workspaces/:workspaceId/projects/:projectId/notes/:noteId',
    element: workspaceShellElement(),
  },
  
  // Export tasks/notes
  {
    path: '/workspaces/:workspaceId/settings/export',
    element: protectedElement(
      <Suspense fallback={<LoadingPage />}>
        <WorkspaceExportView />
      </Suspense>
    ),
  },

  // Backward compatibility with legacy placeholder page
  {
    path: '/placeholder/:id',
    element: protectedElement(
      <Suspense fallback={<LoadingPage />}>
        <PlaceholderPage />
      </Suspense>
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
