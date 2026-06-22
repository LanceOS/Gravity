import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { SettingsScreen as SettingsPage, useTheme } from '../../settings';
import { AuthScreen } from '../../auth';
import { OnboardingModal } from '../../onboarding';
import { useAuth } from '../../../context/auth/AuthContext';
import { useAccountSettings } from '../../../hooks/useAccountSettings';
import { useWorkspaceDirectory } from '../../../hooks/useWorkspaceDirectory';
import { useWorkspaceSettings } from '../../../hooks/useWorkspaceSettings';
import { useActiveView } from '../../../context/ui/ActiveViewContext';
import { LoadingPage } from '../../../pages/LoadingPage/LoadingPage';

export function WorkspaceSettingsPageRoute() {
  const { workspaceId = '' } = useParams<{ workspaceId: string }>();
  const navigate = useNavigate();
  const [localTutorialCompleted, setLocalTutorialCompleted] = useState(false);

  const { currentUser, loading } = useAuth();
  const { activeView, setView } = useActiveView();
  const { theme, setTheme, setDensity } = useTheme();

  const {
    workspaces,
    loading: workspacesLoading,
    resolvedUserId: workspacesResolvedUserId,
    refreshWorkspaces,
  } = useWorkspaceDirectory({ currentUser });

  const activeWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === workspaceId) || null,
    [workspaceId, workspaces]
  );
  const workspacesResolvedForCurrentUser = !currentUser || workspacesResolvedUserId === currentUser.id;

  const {
    settings,
    settingsLoading,
    saveLoading: settingsSaveLoading,
    saveSuccess: settingsSaveSuccess,
    saveError: settingsSaveError,
    members: workspaceMembers,
    invites: workspaceInvites,
    invitesLoading: workspaceInvitesLoading,
    joinRequests: workspaceJoinRequests,
    inviteLoading: workspaceInviteLoading,
    inviteError: workspaceInviteError,
    approveLoadingId,
    revokeLoadingId,
    updateSettings,
    saveSettings,
    createInvite,
    revokeInvite,
    approveJoinRequest,
    deleteWorkspace,
    deleteLoading,
    deleteError,
    clearDeleteError,
  } = useWorkspaceSettings({
    currentUser,
    activeWorkspaceId: workspaceId,
  });

  const {
    settings: accountSettings,
  } = useAccountSettings({
    currentUser,
    activeView,
    theme,
    setView,
    setTheme,
  });

  useEffect(() => {
    if (accountSettings) {
      setDensity(accountSettings.projectLayout === 'condensed' ? 'compact' : 'standard');
      setTheme(accountSettings.theme);
    }
  }, [accountSettings, setDensity, setTheme]);

  useEffect(() => {
    if (loading || workspacesLoading || !workspacesResolvedForCurrentUser) {
      return;
    }

    if (workspaceId && !activeWorkspace) {
      navigate('/workspaces', { replace: true });
    }
  }, [activeWorkspace, loading, navigate, workspacesLoading, workspacesResolvedForCurrentUser, workspaceId]);

  if (loading || workspacesLoading || !workspacesResolvedForCurrentUser) {
    return <LoadingPage />;
  }

  if (!currentUser) {
    return <AuthScreen />;
  }

  if (!activeWorkspace) {
    return <LoadingPage />;
  }

  const onboarding =
    !localTutorialCompleted && accountSettings.tutorialCompleted === false ? (
      <OnboardingModal
        onComplete={async () => {
          setLocalTutorialCompleted(true);
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

  const handleDeleteWorkspace = async () => {
    const success = await deleteWorkspace();
    if (success) {
      await refreshWorkspaces();
      navigate('/workspaces', { replace: true });
    }
  };

  return (
    <>
      <SettingsPage
        currentUser={currentUser}
        workspace={activeWorkspace}
        settings={settings}
        settingsLoading={settingsLoading}
        saveLoading={settingsSaveLoading}
        saveSuccess={settingsSaveSuccess}
        saveError={settingsSaveError}
        inviteError={workspaceInviteError}
        invitesLoading={workspaceInvitesLoading}
        inviteLoading={workspaceInviteLoading}
        invites={workspaceInvites}
        members={workspaceMembers}
        joinRequests={workspaceJoinRequests}
        approveLoadingId={approveLoadingId || null}
        revokeLoadingId={revokeLoadingId || null}
        deleteLoading={deleteLoading}
        deleteError={deleteError}
        onBackToWorkspace={() => navigate(`/workspaces/${workspaceId}`)}
        onOpenDirectory={() => navigate('/workspaces')}
        onChangeSettings={updateSettings}
        onSaveSettings={saveSettings}
        onCreateInvite={async (input) => Boolean(await createInvite(input))}
        onRevokeInvite={async (inviteId: string) => Boolean(await revokeInvite(inviteId))}
        onApproveJoinRequest={async (requestId: string) => Boolean(await approveJoinRequest(requestId))}
        onDeleteWorkspace={handleDeleteWorkspace}
        onClearDeleteError={clearDeleteError}
      />
      {onboarding}
    </>
  );
}
