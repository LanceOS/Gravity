import { createBrowserRouter, Navigate, useParams } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import type { ReactNode } from 'react';
import {
  ProjectContextProviders,
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

function workspaceShellElement() {
  return projectElement(
    <WorkspaceTicketProviders>
      <WorkspaceShellPage />
    </WorkspaceTicketProviders>
  );
}

const appShellPaths = [
  '/',
  '/workspaces',
];

const workspaceShellPaths = [
  '/workspaces/:workspaceId',
  '/workspaces/:workspaceId/projects',
  '/workspaces/:workspaceId/projects/list',
  '/workspaces/:workspaceId/teams',
  '/workspaces/:workspaceId/all',
];

const workspaceTeamShellSuffixes = [
  '/teams/:teamId',
  '/teams/:teamId/tasks',
  '/teams/:teamId/views/:viewId',
  '/teams/:teamId/cycles/:cycleId',
  '/teams/:teamId/labels/:labelId',
  '/teams/:teamId/projects',
];

const workspaceTeamProjectShellSuffixes = [
  '/teams/:teamId/projects/:projectId',
  '/teams/:teamId/projects/:projectId/tickets',
  '/teams/:teamId/projects/:projectId/tickets/:ticketKey',
  '/teams/:teamId/projects/:projectId/notes',
  '/teams/:teamId/projects/:projectId/notes/:noteId',
];

const workspaceProjectShellSuffixes = [
  '/projects/:projectId/tickets',
  '/projects/:projectId/tickets/:ticketKey',
  '/projects/:projectId/notes',
  '/projects/:projectId/notes/:noteId',
];

const workspaceRoutes = [
  ...appShellPaths.map((path) => ({ path, element: appShellElement() })),
  ...workspaceShellPaths.map((path) => ({ path, element: workspaceShellElement() })),
  ...workspaceTeamShellSuffixes.map((suffix) => ({
    path: `/workspaces/:workspaceId${suffix}`,
    element: workspaceShellElement(),
  })),
  ...workspaceTeamProjectShellSuffixes.map((suffix) => ({
    path: `/workspaces/:workspaceId${suffix}`,
    element: workspaceShellElement(),
  })),
  ...workspaceProjectShellSuffixes.map((suffix) => ({
    path: `/workspaces/:workspaceId${suffix}`,
    element: workspaceShellElement(),
  })),
];

const staticProtectedRoutes = [
  {
    path: '/workspaces/:workspaceId/settings',
    element: <WorkspaceSettingsPageRoute />,
  },
  {
    path: '/account',
    element: <AccountPreferencesPageRoute />,
  },
];

export const router = createBrowserRouter([
  ...workspaceRoutes,

  // Legacy compatibility route for label-filtered views
  {
    path: '/workspaces/:workspaceId/teams/:teamId/domains/:domainId',
    element: protectedElement(<TeamLabelRedirect />),
  },
  {
    path: '/workspaces/:workspaceId/projects/:projectId',
    element: protectedElement(<ProjectHomeGuard />),
  },
  ...staticProtectedRoutes.map((route) => ({
    path: route.path,
    element: protectedElement(route.element),
  })),
  
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
