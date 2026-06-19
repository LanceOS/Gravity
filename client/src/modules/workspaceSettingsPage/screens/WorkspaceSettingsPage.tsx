import { useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { SettingsScreen as SettingsPage, useTheme } from '../../settings';
import { AuthScreen } from '../../auth';
import { OnboardingModal } from '../../onboarding';
import { useAccountSettings } from '../../../hooks/useAccountSettings';
import { useWorkspaceDirectory } from '../../../hooks/useWorkspaceDirectory';
import { useWorkspaceSettings } from '../../../hooks/useWorkspaceSettings';
import { useTickets } from '../../../context/TicketContextContext';
import { LoadingPage } from '../../../pages/LoadingPage/LoadingPage';

export function WorkspaceSettingsPageRoute() {
  const { workspaceId = '' } = useParams<{ workspaceId: string }>();
  const navigate = useNavigate();

  const {
    activeView,
    currentUser,
    loading,
    setCurrentUser,
    setTheme,
    setView,
    theme,
  } = useTickets();

  const {
    workspaces,
    loading: workspacesLoading,
    resolvedUserId: workspacesResolvedUserId,
    refreshWorkspaces,
  } = useWorkspaceDirectory({ currentUser, setCurrentUser });

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
  const { setDensity, setTheme: setDashboardTheme } = useTheme();

  useEffect(() => {
    if (accountSettings) {
      setDensity(accountSettings.projectLayout === 'condensed' ? 'compact' : 'standard');
      setDashboardTheme(accountSettings.theme);
    }
  }, [accountSettings, setDensity, setDashboardTheme]);

  useEffect(() => {
    if (loading || workspacesLoading || !workspacesResolvedForCurrentUser) {
      return;
    }

    if (workspaceId && !activeWorkspace) {
      navigate('/workspaces', { replace: true });
    }
  }, [activeWorkspace, loading, navigate, workspacesLoading, workspacesResolvedForCurrentUser, workspaceId]);

  const onboarding =
    currentUser && (currentUser.tutorial_completed === 0 || currentUser.tutorial_completed === false) ? (
      <OnboardingModal
        onComplete={() => {
          setCurrentUser({ ...currentUser, tutorial_completed: 1 });
        }}
      />
    ) : null;

  if (loading || workspacesLoading || !workspacesResolvedForCurrentUser) {
    return <LoadingPage />;
  }

  if (!currentUser) {
    return <AuthScreen />;
  }

  if (!activeWorkspace) {
    return <LoadingPage />;
  }

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
