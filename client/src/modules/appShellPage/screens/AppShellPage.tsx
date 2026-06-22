import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { useAuth } from '../../../context/auth/AuthContext';
import { useProjectContext } from '../../../context/project/ProjectContext';
import { AuthScreen } from '../../auth';
import { OnboardingModal } from '../../onboarding';
import { useWorkspaceDirectory } from '../../../hooks/useWorkspaceDirectory';
import { LoadingPage } from '../../loadingPage';
import { WorkspaceDirectoryPage } from '../../workspaceDirectoryPage';
import { WorkspaceShellPage } from '../../workspaceShellPage';
import { usePendingWorkspaceInvite, useWorkspaceDirectoryState } from '../../workspaceShellPage/hooks';
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

  const { currentUser, loading, signOut } = useAuth();
  const { fetchInitialData } = useProjectContext();

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
  } = useWorkspaceDirectory({ currentUser });
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

    navigate('/workspaces', { replace: true });
  }, [navigate, pathname, activeWorkspaceId, workspaces, workspaceReady]);

  const [tutorialCompleted, setTutorialCompleted] = useState<boolean | null>(null);
  useEffect(() => {
    if (!currentUser) return;
    let cancelled = false;
    fetch(`/api/v1/settings/${currentUser.id}`)
      .then(res => res.json())
      .then(data => {
        if (!cancelled) setTutorialCompleted(data.tutorialCompleted ?? true);
      })
      .catch(() => {
        if (!cancelled) setTutorialCompleted(true);
      });
    return () => { cancelled = true; };
  }, [currentUser]);

  const handleCreateWorkspace = async (workspaceInput: {
    name: string;
    description: string;
    key: string;
    workspaceKey?: string;
    hierarchyMode?: 'teams' | 'flat';
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

  const onboarding = tutorialCompleted === false ? (
    <OnboardingModal
      onComplete={async () => {
        setTutorialCompleted(true);
        try {
          await fetch(`/api/v1/users/${currentUser.id}/tutorial`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ completed: true }),
          });
        } catch (e) {
          // Ignore
        }
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
          onSignOut={() => { void signOut(); }}
        />
        {onboarding}
      </>
    );
  }

  return <LoadingPage />;
}
