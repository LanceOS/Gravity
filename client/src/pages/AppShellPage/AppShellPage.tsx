import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { AuthScreen } from '../../modules/auth';
import { OnboardingModal } from '../../modules/onboarding';
import { useTickets } from '../../context/TicketContext';
import { useWorkspaceDirectory } from '../../hooks/useWorkspaceDirectory';
import { LoadingPage } from '../LoadingPage/LoadingPage';
import { WorkspaceDirectoryPage } from '../WorkspaceDirectoryPage/WorkspaceDirectoryPage';
import { WorkspaceShellPage } from '../WorkspaceShellPage/WorkspaceShellPage';
import { usePendingWorkspaceInvite, useWorkspaceDirectoryState } from '../../modules/workspaceShellPage/hooks';
import './AppShellPage.css';

export function AppShellPage() {
  const { pathname } = useLocation();

  const isWorkspaceRoute = /^\/workspaces\/[^/]+/.test(pathname);
  if (isWorkspaceRoute) {
    return <WorkspaceShellPage />;
  }

  return <AppShellLandingPage />;
}

function AppShellLandingPage() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isWorkspaceDirectory = pathname === '/workspaces' || pathname === '/workspaces/';

  const {
    currentUser,
    fetchInitialData,
    loading,
    setCurrentUser,
    signOut,
  } = useTickets();

  const {
    workspaces,
    loading: workspacesLoading,
    resolvedUserId: workspacesResolvedUserId,
    pendingAction,
    error: workspaceDirectoryError,
    successMessage: workspaceDirectorySuccess,
    refreshWorkspaces,
    createWorkspace,
    requestJoinByInvite,
  } = useWorkspaceDirectory({ currentUser, setCurrentUser });
  const workspacesResolvedForCurrentUser = !currentUser || workspacesResolvedUserId === currentUser.id;

  const { activeWorkspaceId, workspaceReady } = useWorkspaceDirectoryState({
    currentUser,
    workspaces,
    workspacesLoading,
    workspacesResolvedForCurrentUser,
  });

  usePendingWorkspaceInvite({
    currentUser,
    requestJoinByInvite,
    refreshWorkspaces,
  });

  useEffect(() => {
    if (pathname !== '/' || !workspaceReady) {
      return;
    }

    if (activeWorkspaceId) {
      navigate(`/workspaces/${activeWorkspaceId}`, { replace: true });
    } else if (workspaces.length === 0) {
      navigate('/workspaces', { replace: true });
    }
  }, [navigate, pathname, activeWorkspaceId, workspaces, workspaceReady]);

  const handleCreateWorkspace = async (workspaceInput: {
    name: string;
    description: string;
    key: string;
    workspaceKey?: string;
  }) => {
    const workspace = await createWorkspace(workspaceInput);
    if (!workspace || !currentUser) {
      return;
    }

    await fetchInitialData(currentUser.id);
    navigate(`/workspaces/${workspace.id}`);
  };

  const handleRequestJoin = async (inviteCode: string, message?: string) => {
    await requestJoinByInvite(inviteCode, message);
    navigate('/workspaces');
  };

  const handleSelectWorkspace = (workspaceId: string) => {
    navigate(`/workspaces/${workspaceId}`);
  };

  if (loading || workspacesLoading || !workspacesResolvedForCurrentUser || (pathname === '/' && !workspaceReady)) {
    return <LoadingPage />;
  }

  if (!currentUser) {
    return <AuthScreen />;
  }

  const onboarding = currentUser.tutorial_completed === 0 || currentUser.tutorial_completed === false ? (
    <OnboardingModal
      onComplete={() => {
        setCurrentUser({ ...currentUser, tutorial_completed: 1 });
      }}
    />
    ) : null;

  if (isWorkspaceDirectory || workspaces.length === 0) {
    return (
      <>
        <WorkspaceDirectoryPage
          currentUser={currentUser}
          workspaces={workspaces}
          loading={workspacesLoading}
          activeWorkspaceId={activeWorkspaceId}
          pendingAction={pendingAction}
          errorMessage={workspaceDirectoryError}
          successMessage={workspaceDirectorySuccess}
          onCreateWorkspace={handleCreateWorkspace}
          onRequestJoin={handleRequestJoin}
          onOpenWorkspace={handleSelectWorkspace}
          onOpenSettings={(wsId) => {
            navigate(`/workspaces/${wsId}/settings`);
          }}
          onOpenAccountPreferences={() => navigate('/account')}
          onSignOut={signOut}
        />
        {onboarding}
      </>
    );
  }

  return <LoadingPage />;
}
