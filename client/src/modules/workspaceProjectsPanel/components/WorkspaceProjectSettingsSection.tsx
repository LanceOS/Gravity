import { Button, TextInput } from '@library';
import { FormSection } from '../../../components/FormSection';
import { useWorkspaceProjectPanelActionsContext } from '../context/WorkspaceProjectPanelActionsContext';
import { useWorkspaceProjectPanelProjectStateContext } from '../context/WorkspaceProjectPanelProjectStateContext';

export function WorkspaceProjectSettingsSection() {
  const { managedProject, isProjectSettingsSaving, settingsFeedback: stateSettingsFeedback, setGithubRepoUrl, githubRepoUrl } =
    useWorkspaceProjectPanelProjectStateContext();
  const { saveProjectSettings } = useWorkspaceProjectPanelActionsContext();

  if (!managedProject) {
    return null;
  }

  return (
    <section className="workspace-page__project-domains">
      <div className="workspace-page__project-domain-header">
        <div>
          <div className="workspace-page__projects-eyebrow">Project Settings</div>
          <h3 className="workspace-page__project-manager-title">{managedProject?.name} settings</h3>
        </div>
        <p className="workspace-page__project-browser-copy workspace-page__project-browser-copy--left">
          Connect this project to a GitHub repository to enable automatic ticket status updates based on PR lifecycle.
        </p>
      </div>

      <FormSection.Root
        layout="none"
        className="workspace-page__domain-form"
        onSubmit={saveProjectSettings}
        style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'end', gap: '16px' }}
      >
        <TextInput
          label="GitHub Repository URL"
          value={githubRepoUrl}
          onChange={(event) => setGithubRepoUrl(event.target.value)}
          placeholder="https://github.com/owner/repository"
          disabled={isProjectSettingsSaving}
          type="url"
          pattern="https://github\\.com/.+/.+"
          title="Must be a full HTTPS GitHub repository URL (https://github.com/owner/repo)"
        />

        <FormSection.Actions className="workspace-page__project-form-actions workspace-page__project-form-actions--inline" style={{ minHeight: '36px' }}>
          <Button type="submit" variant="primary" loading={isProjectSettingsSaving} style={{ minHeight: '36px' }}>
            Save Settings
          </Button>
        </FormSection.Actions>

        {stateSettingsFeedback ? (
          <FormSection.Feedback
            type={stateSettingsFeedback.type}
            className={`workspace-page__project-feedback workspace-page__project-feedback--${stateSettingsFeedback.type}`}
            style={{ gridColumn: '1 / -1', marginTop: '8px' }}
          >
            {stateSettingsFeedback.message}
          </FormSection.Feedback>
        ) : null}
      </FormSection.Root>
    </section>
  );
}
