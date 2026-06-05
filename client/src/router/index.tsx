import { createBrowserRouter, Navigate, useParams } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { AppShellPage } from '../pages/AppShellPage/AppShellPage';
import { ProtectedRoute } from './ProtectedRoute';
import { LoadingPage } from '../pages/LoadingPage/LoadingPage';
import { useTickets } from '../context/TicketContext';

// Lazy load placeholder views for code-splitting
const WorkspaceDashboardView = lazy(() => import('../pages/PlaceholderViews/WorkspaceDashboardView'));
const WorkspaceAllTasksView = lazy(() => import('../pages/PlaceholderViews/WorkspaceAllTasksView'));
const TeamOverviewView = lazy(() => import('../pages/PlaceholderViews/TeamOverviewView'));
const TeamAllTasksView = lazy(() => import('../pages/PlaceholderViews/TeamAllTasksView'));
const TeamSpecificViewView = lazy(() => import('../pages/PlaceholderViews/TeamSpecificViewView'));
const TeamCycleViewView = lazy(() => import('../pages/PlaceholderViews/TeamCycleViewView'));
const TeamDomainViewView = lazy(() => import('../pages/PlaceholderViews/TeamDomainViewView'));
const ProjectOverviewView = lazy(() => import('../pages/PlaceholderViews/ProjectOverviewView'));
const ProjectTicketListView = lazy(() => import('../pages/PlaceholderViews/ProjectTicketListView'));
const ProjectTicketDetailView = lazy(() => import('../pages/PlaceholderViews/ProjectTicketDetailView'));
const ProjectNotesListView = lazy(() => import('../pages/PlaceholderViews/ProjectNotesListView'));
const ProjectNoteDetailView = lazy(() => import('../pages/PlaceholderViews/ProjectNoteDetailView'));
const WorkspaceSettingsView = lazy(() => import('../pages/PlaceholderViews/WorkspaceSettingsView'));
const WorkspaceExportView = lazy(() => import('../pages/PlaceholderViews/WorkspaceExportView'));
const NotFoundView = lazy(() => import('../pages/PlaceholderViews/NotFoundView'));
const PlaceholderPage = lazy(() => import('../pages/PlaceholderPage'));

// --- Backward Compatibility Home Redirect ---
function HomeRedirect() {
  const { currentUser } = useTickets();
  
  if (!currentUser) {
    // If not logged in, render AppShellPage which automatically presents the Auth screen
    return <AppShellPage />;
  }

  const storedWorkspaceId = localStorage.getItem(`gravity_active_workspace:${currentUser.id}`);
  if (storedWorkspaceId) {
    return <Navigate to={`/workspaces/${storedWorkspaceId}`} replace />;
  }

  return <Navigate to="/workspaces" replace />;
}

// --- Legacy Placeholder Redirect ---
function PlaceholderRedirect() {
  const { id } = useParams();
  return <Navigate to={`/workspaces/${id}`} replace />;
}

// --- Team to Project Graceful Degradation Guards ---
function TeamProjectTicketListGuard() {
  const { workspaceId, projectId } = useParams();
  return <Navigate to={`/workspaces/${workspaceId}/projects/${projectId}/tickets`} replace />;
}

function TeamProjectTicketDetailGuard() {
  const { workspaceId, projectId, ticketKey } = useParams();
  return <Navigate to={`/workspaces/${workspaceId}/projects/${projectId}/tickets/${ticketKey}`} replace />;
}

function TeamProjectNotesListGuard() {
  const { workspaceId, projectId } = useParams();
  return <Navigate to={`/workspaces/${workspaceId}/projects/${projectId}/notes`} replace />;
}

function TeamProjectNoteDetailGuard() {
  const { workspaceId, projectId, noteId } = useParams();
  return <Navigate to={`/workspaces/${workspaceId}/projects/${projectId}/notes/${noteId}`} replace />;
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
        <AppShellPage />
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
    path: '/account',
    element: (
      <ProtectedRoute>
        <AppShellPage />
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
        <Suspense fallback={<LoadingPage />}>
          <WorkspaceAllTasksView />
        </Suspense>
      </ProtectedRoute>
    ),
  },
  // Team overview
  {
    path: '/workspaces/:workspaceId/teams/:teamId',
    element: (
      <ProtectedRoute>
        <Suspense fallback={<LoadingPage />}>
          <TeamOverviewView />
        </Suspense>
      </ProtectedRoute>
    ),
  },
  // Team-level all tasks
  {
    path: '/workspaces/:workspaceId/teams/:teamId/tasks',
    element: (
      <ProtectedRoute>
        <Suspense fallback={<LoadingPage />}>
          <TeamAllTasksView />
        </Suspense>
      </ProtectedRoute>
    ),
  },
  // Team-level specific view
  {
    path: '/workspaces/:workspaceId/teams/:teamId/views/:viewId',
    element: (
      <ProtectedRoute>
        <Suspense fallback={<LoadingPage />}>
          <TeamSpecificViewView />
        </Suspense>
      </ProtectedRoute>
    ),
  },
  // Team cycle view
  {
    path: '/workspaces/:workspaceId/teams/:teamId/cycles/:cycleId',
    element: (
      <ProtectedRoute>
        <Suspense fallback={<LoadingPage />}>
          <TeamCycleViewView />
        </Suspense>
      </ProtectedRoute>
    ),
  },
  // Domain-filtered view
  {
    path: '/workspaces/:workspaceId/teams/:teamId/domains/:domainId',
    element: (
      <ProtectedRoute>
        <Suspense fallback={<LoadingPage />}>
          <TeamDomainViewView />
        </Suspense>
      </ProtectedRoute>
    ),
  },
  // Team project overview
  {
    path: '/workspaces/:workspaceId/teams/:teamId/projects/:projectId',
    element: (
      <ProtectedRoute>
        <Suspense fallback={<LoadingPage />}>
          <ProjectOverviewView />
        </Suspense>
      </ProtectedRoute>
    ),
  },
  // Team-level project ticket list (Degrades to individual project tickets)
  {
    path: '/workspaces/:workspaceId/teams/:teamId/projects/:projectId/tickets',
    element: (
      <ProtectedRoute>
        <TeamProjectTicketListGuard />
      </ProtectedRoute>
    ),
  },
  // Team-level project ticket detail (Degrades to individual ticket detail)
  {
    path: '/workspaces/:workspaceId/teams/:teamId/projects/:projectId/tickets/:ticketKey',
    element: (
      <ProtectedRoute>
        <TeamProjectTicketDetailGuard />
      </ProtectedRoute>
    ),
  },
  // Team-level project notes list (Degrades to individual project notes)
  {
    path: '/workspaces/:workspaceId/teams/:teamId/projects/:projectId/notes',
    element: (
      <ProtectedRoute>
        <TeamProjectNotesListGuard />
      </ProtectedRoute>
    ),
  },
  // Team-level project note detail (Degrades to individual note detail)
  {
    path: '/workspaces/:workspaceId/teams/:teamId/projects/:projectId/notes/:noteId',
    element: (
      <ProtectedRoute>
        <TeamProjectNoteDetailGuard />
      </ProtectedRoute>
    ),
  },

  // Individual (no teams) routing:
  {
    path: '/workspaces/:workspaceId/projects/:projectId/tickets',
    element: (
      <ProtectedRoute>
        <Suspense fallback={<LoadingPage />}>
          <ProjectTicketListView />
        </Suspense>
      </ProtectedRoute>
    ),
  },
  {
    path: '/workspaces/:workspaceId/projects/:projectId/tickets/:ticketKey',
    element: (
      <ProtectedRoute>
        <Suspense fallback={<LoadingPage />}>
          <ProjectTicketDetailView />
        </Suspense>
      </ProtectedRoute>
    ),
  },
  {
    path: '/workspaces/:workspaceId/projects/:projectId/notes',
    element: (
      <ProtectedRoute>
        <Suspense fallback={<LoadingPage />}>
          <ProjectNotesListView />
        </Suspense>
      </ProtectedRoute>
    ),
  },
  {
    path: '/workspaces/:workspaceId/projects/:projectId/notes/:noteId',
    element: (
      <ProtectedRoute>
        <Suspense fallback={<LoadingPage />}>
          <ProjectNoteDetailView />
        </Suspense>
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
