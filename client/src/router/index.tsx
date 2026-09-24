import { createBrowserRouter, Navigate, useParams } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import type { ReactNode } from 'react';
import {
  ProjectContextProviders,
  WorkspaceTicketProviders,
} from '../context/TicketContext';
import { ProtectedRoute } from './ProtectedRoute';
import { LoadingPage } from '../pages/LoadingPage/LoadingPage';

// Keep workspace, editor, chat, and settings code out of the sign-in bundle.
const AppShellPage = lazy(() => import('../pages/AppShellPage/AppShellPage').then((module) => ({ default: module.AppShellPage })));
const WorkspaceShellPage = lazy(() => import('../pages/WorkspaceShellPage/WorkspaceShellPage').then((module) => ({ default: module.WorkspaceShellPage })));
const AccountPreferencesPageRoute = lazy(() => import('../pages/AccountPreferencesPage/AccountPreferencesPage').then((module) => ({ default: module.AccountPreferencesPageRoute })));
const WorkspaceSettingsPageRoute = lazy(() => import('../pages/WorkspaceSettingsPage/WorkspaceSettingsPage').then((module) => ({ default: module.WorkspaceSettingsPageRoute })));

const WorkspaceExportView = lazy(() => import('../pages/PlaceholderViews/WorkspaceExportView'));
const NotFoundView = lazy(() => import('../pages/PlaceholderViews/NotFoundView'));
const WorkspaceAccessDeniedView = lazy(() => import('../pages/PlaceholderViews/WorkspaceAccessDeniedView'));
const WorkspaceAccessErrorView = lazy(() => import('../pages/PlaceholderViews/WorkspaceAccessErrorView'));
const PlaceholderPage = lazy(() => import('../pages/PlaceholderPage'));
const OAuthConsentPage = lazy(() => import('../modules/mcpOAuth/OAuthConsentPage'));

function ProjectHomeGuard() {
  const { workspaceId, projectId } = useParams();
  return <Navigate to={`/workspaces/${workspaceId}/projects/${projectId}/tickets`} replace />;
}

function TeamLabelRedirect() {
  const { workspaceId, teamId, domainId } = useParams();
  return <Navigate to={`/workspaces/${workspaceId}/teams/${teamId}/labels/${domainId}`} replace />;
}

function protectedElement(children: ReactNode) {
  return (
    <ProtectedRoute>
      <Suspense fallback={<LoadingPage />}>{children}</Suspense>
    </ProtectedRoute>
  );
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

const appShellPaths = ['/', '/workspaces'];

const workspaceShellRouteGroups = [
  {
    basePath: '/workspaces/:workspaceId',
    suffixes: ['', '/projects', '/projects/list', '/teams', '/all'],
  },
  {
    basePath: '/workspaces/:workspaceId/teams/:teamId',
    suffixes: ['', '/tasks', '/views/:viewId', '/cycles/:cycleId', '/labels/:labelId', '/projects'],
  },
  {
    basePath: '/workspaces/:workspaceId/teams/:teamId/projects/:projectId',
    suffixes: ['/tickets', '/tickets/:ticketKey', '/notes', '/notes/:noteId'],
  },
  {
    basePath: '/workspaces/:workspaceId/projects/:projectId',
    suffixes: ['/tickets', '/tickets/:ticketKey', '/notes', '/notes/:noteId'],
  },
];

export const workspaceShellRoutePaths = workspaceShellRouteGroups.flatMap(({ basePath, suffixes }) => (
  suffixes.map((suffix) => `${basePath}${suffix}`)
));

const workspaceShellRoutes = workspaceShellRoutePaths.map((path) => ({
  path,
  element: workspaceShellElement(),
}));

const staticProtectedRoutes = [
  {
    path: '/workspaces/:workspaceId/teams/:teamId/domains/:domainId',
    element: <TeamLabelRedirect />,
  },
  {
    path: '/workspaces/:workspaceId/projects/:projectId',
    element: <ProjectHomeGuard />,
  },
  {
    path: '/workspaces/:workspaceId/settings',
    element: <WorkspaceSettingsPageRoute />,
  },
  {
    path: '/account',
    element: <AccountPreferencesPageRoute />,
  },
  {
    path: '/oauth/consent',
    element: <OAuthConsentPage />,
  },
  {
    path: '/workspace-access-denied',
    element: <WorkspaceAccessDeniedView />,
  },
  {
    path: '/workspace-access-error',
    element: <WorkspaceAccessErrorView />,
  },
];

export const staticProtectedRoutePaths = staticProtectedRoutes.map((route) => route.path);

export const router = createBrowserRouter([
  ...appShellPaths.map((path) => ({ path, element: appShellElement() })),
  ...workspaceShellRoutes,
  ...staticProtectedRoutes.map((route) => ({
    path: route.path,
    element: protectedElement(route.element),
  })),
  
  // Export tasks/notes
  {
    path: '/workspaces/:workspaceId/settings/export',
    element: protectedElement(<WorkspaceExportView />),
  },

  // Backward compatibility with legacy placeholder page
  {
    path: '/placeholder/:id',
    element: protectedElement(<PlaceholderPage />),
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
