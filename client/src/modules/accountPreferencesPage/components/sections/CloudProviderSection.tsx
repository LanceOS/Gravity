import { useMemo } from 'react';
import { Alert, Button, Card, Grid, Select, Stack, TextInput } from '@library';
import { useIsMobile } from '../../../../hooks/useIsMobile';

import {
  getProviderOption,
  type AIProvider,
} from '../../../../utils/settings';
import { CLOUD_PROVIDER_OPTIONS, isStoredApiKey } from '../../utils/accountPreferences';
import { StatusNotice } from '../StatusNotice';
import {
  useAccountPreferencesCloudContext,
  useAccountPreferencesRuntimeContext,
  useAccountPreferencesSettingsContext,
} from '../../../../context/accountPreferencesPage/accountPreferencesPageContextHooks';

export function CloudProviderSection() {
  const { settings, onChangeSettings } = useAccountPreferencesSettingsContext();
  const {
    hasProviderChanges,
    testing,
    testResult,
    onTestApiKey,
  } = useAccountPreferencesCloudContext();
  const { saveLoading, onSaveSettings } = useAccountPreferencesRuntimeContext();
  const isMobile = useIsMobile();

  const providerOption = useMemo(() => getProviderOption(settings.aiProvider), [settings.aiProvider]);
  const hasStoredApiKey = isStoredApiKey(settings.apiKey);

  return (
    <Card className="account-preferences-page__section-card">
      <Stack gap="var(--space-lg)">
        <div>
          <h2 className="account-preferences-page__section-title">Cloud AI provider</h2>
          <p className="account-preferences-page__section-description">
            These credentials stay with your local account and are not part of shared workspace settings.
          </p>
        </div>

        <Grid columns={isMobile ? 1 : '1.5fr 3fr'} gap="var(--space-md)">
          <Select
            label="Provider"
            value={settings.aiProvider}
            onChange={(event) => onChangeSettings({ aiProvider: event.target.value as AIProvider })}
            options={CLOUD_PROVIDER_OPTIONS}
          />

          <TextInput
            label={providerOption.keyLabel}
            type="password"
            autoComplete="new-password"
            value={hasStoredApiKey ? '' : settings.apiKey}
            placeholder={hasStoredApiKey ? 'Stored in KMS. Enter a new key to replace.' : providerOption.keyPlaceholder}
            onChange={(event) => onChangeSettings({ apiKey: event.target.value })}
          />
        </Grid>

        <div className="account-preferences-page__action-row">
          <Button variant="default" onClick={onTestApiKey} loading={testing}>
            Test {providerOption.label}
          </Button>
          <Button variant="accent" onClick={onSaveSettings} loading={saveLoading} disabled={!hasProviderChanges}>
            Save Key
          </Button>
        </div>

        {testResult && (
          <StatusNotice message={testResult} tone={testResult.success ? 'success' : 'error'} />
        )}

        <Alert type="warning">
          <strong>Token warning:</strong> Cloud requests consume external credits. Prefer Ollama when you want fully local execution.
        </Alert>
      </Stack>
    </Card>
  );
}
