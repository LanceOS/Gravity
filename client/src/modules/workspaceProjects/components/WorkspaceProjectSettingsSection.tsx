import { Button, TextInput } from '@library';

import type { ProjectSettingsFeedback } from '../types/WorkspaceProjectPanel';

interface WorkspaceProjectSettingsSectionProps {
  managedProjectName: string;
  githubRepoUrl: string;
  isSaving: boolean;
  settingsFeedback: ProjectSettingsFeedback;
  onGithubRepoUrlChange: (url: string) => void;
  onSaveSettings: (event: React.FormEvent<HTMLFormElement>) => void;
}

export function WorkspaceProjectSettingsSection({
  managedProjectName,
  githubRepoUrl,
  isSaving,
  settingsFeedback,
  onGithubRepoUrlChange,
  onSaveSettings,
}: WorkspaceProjectSettingsSectionProps) {
  return (
    <section className="workspace-page__project-domains">
      <div className="workspace-page__project-domain-header">
        <div>
          <div className="workspace-page__projects-eyebrow">Project Settings</div>
          <h3 className="workspace-page__project-manager-title">{managedProjectName} settings</h3>
        </div>
        <p className="workspace-page__project-browser-copy workspace-page__project-browser-copy--left">
          Connect this project to a GitHub repository to enable automatic ticket status updates based on PR lifecycle.
        </p>
      </div>

      <form
        className="workspace-page__domain-form"
        onSubmit={onSaveSettings}
        style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'end', gap: '16px' }}
      >
        <TextInput
          label="GitHub Repository URL"
          value={githubRepoUrl}
          onChange={(event) => onGithubRepoUrlChange(event.target.value)}
          placeholder="https://github.com/owner/repository"
          disabled={isSaving}
          type="url"
          pattern="https://github\\.com/.+/.+"
          title="Must be a full HTTPS GitHub repository URL (https://github.com/owner/repo)"
        />

        <div className="workspace-page__project-form-actions workspace-page__project-form-actions--inline" style={{ minHeight: '36px' }}>
          <Button type="submit" variant="primary" loading={isSaving} style={{ minHeight: '36px' }}>
            Save Settings
          </Button>
        </div>

        {settingsFeedback ? (
          <div
            className={`workspace-page__project-feedback workspace-page__project-feedback--${settingsFeedback.type}`}
            style={{ gridColumn: '1 / -1', marginTop: '8px' }}
          >
            {settingsFeedback.message}
          </div>
        ) : null}
      </form>
    </section>
  );
}

