import { Select, Stack, Grid, Card, Alert } from '@library';

import { useIsMobile } from '../../../../hooks/useIsMobile';
import { AGENT_INTEGRATION_OPTIONS, PROJECT_LAYOUT_OPTIONS, THEME_OPTIONS, VIEW_MODE_OPTIONS } from '../../utils/accountPreferences';
import { useAccountPreferencesSettingsContext } from '../../contexts/accountPreferencesPageContexts';
import type { WorkspaceSettings } from '../../../../utils/settings';

export function GeneralSettingsSection() {
  const { settings, onChangeSettings } = useAccountPreferencesSettingsContext();
  const isMobile = useIsMobile();

  return (
    <Card className="account-preferences-page__section-card">
      <Stack gap="var(--space-lg)">
        <div>
          <h2 className="account-preferences-page__section-title">Local account preferences</h2>
          <p className="account-preferences-page__section-description">
            These settings apply to your signed-in Gravity account on this device, not to the shared workspace.
          </p>
        </div>

        <Grid columns={isMobile ? 1 : 2} gap="var(--space-md)">
          <div className="account-preferences-page__form-stack">
            <Select
              label="Default View Mode"
              value={settings.defaultView}
              onChange={(event) => onChangeSettings({ defaultView: event.target.value as WorkspaceSettings['defaultView'] })}
              options={VIEW_MODE_OPTIONS}
            />
            {isMobile && (
              <Alert type="warning">
                Only <strong>List mode</strong> is available on mobile. Your default view preference will apply on desktop.
              </Alert>
            )}
          </div>

          <Select
            label="Workspace Theme"
            value={settings.theme}
            onChange={(event) => onChangeSettings({ theme: event.target.value as WorkspaceSettings['theme'] })}
            options={THEME_OPTIONS}
          />

          <Select
            label="Project Layout"
            value={settings.projectLayout}
            onChange={(event) => onChangeSettings({ projectLayout: event.target.value as WorkspaceSettings['projectLayout'] })}
            options={PROJECT_LAYOUT_OPTIONS}
          />

          <Select
            label="Active Agent Integration"
            value={settings.agentIntegration}
            onChange={(event) => onChangeSettings({ agentIntegration: event.target.value as WorkspaceSettings['agentIntegration'] })}
            options={AGENT_INTEGRATION_OPTIONS}
          />
        </Grid>
      </Stack>
    </Card>
  );
}
