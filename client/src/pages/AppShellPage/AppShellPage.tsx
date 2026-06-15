import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { AuthScreen } from '../../modules/auth';
import { OnboardingModal } from '../../modules/onboarding';
import { useTickets } from '../../context/TicketContext';
import { useWorkspaceDirectory } from '../../hooks/useWorkspaceDirectory';
import { LoadingPage } from '../LoadingPage/LoadingPage';
import { WorkspaceDirectoryPage } from '../WorkspaceDirectoryPage/WorkspaceDirectoryPage';
import { WorkspaceShellPage } from '../WorkspaceShellPage/WorkspaceShellPage';
import { getActiveWorkspaceStorageKey, usePendingWorkspaceInvite } from './hooks/useWorkspaceLifecycle';
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

  const [activeWorkspaceId, setActiveWorkspaceId] = useState('');
  const [workspaceReady, setWorkspaceReady] = useState(false);

  usePendingWorkspaceInvite({
    currentUser,
    requestJoinByInvite,
    refreshWorkspaces,
  });

  useEffect(() => {
    if (!currentUser) {
      setWorkspaceReady(false);
      setActiveWorkspaceId('');
      return;
    }

    if (!workspacesResolvedForCurrentUser || workspacesLoading) {
      return;
    }

    if (workspaces.length === 0) {
      setWorkspaceReady(true);
      setActiveWorkspaceId('');
      return;
    }

    const storageKey = getActiveWorkspaceStorageKey(currentUser.id);
    const storedWorkspaceId = window.localStorage.getItem(storageKey);
    const nextWorkspaceId =
      storedWorkspaceId && workspaces.some((workspace) => workspace.id === storedWorkspaceId)
        ? storedWorkspaceId
        : workspaces[0].id;

    if (nextWorkspaceId !== activeWorkspaceId) {
      setActiveWorkspaceId(nextWorkspaceId);
    }

    setWorkspaceReady(true);
  }, [
    activeWorkspaceId,
    currentUser,
    workspaces,
    workspacesLoading,
    workspacesResolvedForCurrentUser,
  ]);

  useEffect(() => {
    if (!currentUser || typeof window === 'undefined') {
      return;
    }

    const storageKey = getActiveWorkspaceStorageKey(currentUser.id);
    if (!activeWorkspaceId) {
      window.localStorage.removeItem(storageKey);
      return;
    }

    window.localStorage.setItem(storageKey, activeWorkspaceId);
  }, [activeWorkspaceId, currentUser]);

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
