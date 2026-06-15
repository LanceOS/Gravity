import { useMemo } from 'react';
import { Alert, Button, Card, Grid, Select, Stack, TextInput } from '@library';
import { useIsMobile } from '../../../../hooks/useIsMobile';

import {
  getProviderOption,
  type AIProvider,
  type WorkspaceSettings,
} from '../../../../utils/settings';
import { CLOUD_PROVIDER_OPTIONS, isStoredApiKey } from '../../utils/accountPreferences';
import { StatusNotice } from '../StatusNotice';
import type { StatusMessage } from '../../types';
import {
  useAccountPreferencesCloudContext,
  useAccountPreferencesRuntimeContext,
  useAccountPreferencesSettingsContext,
} from '../../../../context/accountPreferencesPage/accountPreferencesPageContextHooks';

interface CloudProviderSectionProps {
  settings?: WorkspaceSettings;
  onChangeSettings?: (updates: Partial<WorkspaceSettings>) => void;
  saveLoading?: boolean;
  hasProviderChanges?: boolean;
  testing?: boolean;
  testResult?: StatusMessage | null;
  onSaveSettings?: () => void;
  onTestApiKey?: () => void;
  isMobile?: boolean;
}

export function CloudProviderSection({
  settings: runtimeSettings,
  onChangeSettings: runtimeOnChangeSettings,
  saveLoading: runtimeSaveLoading,
  hasProviderChanges: runtimeHasProviderChanges,
  testing: runtimeTesting,
  testResult: runtimeTestResult,
  onSaveSettings: runtimeOnSaveSettings,
  onTestApiKey: runtimeOnTestApiKey,
  isMobile: runtimeIsMobile,
}: CloudProviderSectionProps = {}) {
  const { settings, onChangeSettings } = useAccountPreferencesSettingsContext();
  const { hasProviderChanges, testing, testResult, onTestApiKey } = useAccountPreferencesCloudContext();
  const { saveLoading, onSaveSettings } = useAccountPreferencesRuntimeContext();
  const isMobileFromContext = useIsMobile();

  const resolvedSettings = runtimeSettings ?? settings;
  const resolvedOnChangeSettings = runtimeOnChangeSettings ?? onChangeSettings;
  const resolvedSaveLoading = runtimeSaveLoading ?? saveLoading;
  const resolvedHasProviderChanges = runtimeHasProviderChanges ?? hasProviderChanges;
  const resolvedTesting = runtimeTesting ?? testing;
  const resolvedTestResult = runtimeTestResult ?? testResult;
  const resolvedOnSaveSettings = runtimeOnSaveSettings ?? onSaveSettings;
  const resolvedOnTestApiKey = runtimeOnTestApiKey ?? onTestApiKey;
  const isMobile = runtimeIsMobile ?? isMobileFromContext;

  const providerOption = useMemo(
    () => getProviderOption(resolvedSettings.aiProvider),
    [resolvedSettings.aiProvider]
  );
  const hasStoredApiKey = isStoredApiKey(resolvedSettings.apiKey);

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
            value={resolvedSettings.aiProvider}
            onChange={(event) => resolvedOnChangeSettings({ aiProvider: event.target.value as AIProvider })}
            options={CLOUD_PROVIDER_OPTIONS}
          />

          <TextInput
            label={providerOption.keyLabel}
            type="password"
            autoComplete="new-password"
            value={hasStoredApiKey ? '' : resolvedSettings.apiKey}
            placeholder={hasStoredApiKey ? 'Stored in KMS. Enter a new key to replace.' : providerOption.keyPlaceholder}
            onChange={(event) => resolvedOnChangeSettings({ apiKey: event.target.value })}
          />
        </Grid>

        <div className="account-preferences-page__action-row">
          <Button variant="default" onClick={resolvedOnTestApiKey} loading={resolvedTesting}>
            Test {providerOption.label}
          </Button>
          <Button variant="accent" onClick={resolvedOnSaveSettings} loading={resolvedSaveLoading} disabled={!resolvedHasProviderChanges}>
            Save Key
          </Button>
        </div>

        {resolvedTestResult && (
          <StatusNotice message={resolvedTestResult} tone={resolvedTestResult.success ? 'success' : 'error'} />
        )}

        <Alert type="warning">
          <strong>Token warning:</strong> Cloud requests consume external credits. Prefer Ollama when you want fully local execution.
        </Alert>
      </Stack>
    </Card>
  );
}
