import { ArrowLeft, Globe } from 'lucide-react';
import { Alert, Button, Divider, Flex, Stack } from '@library';
import { useIsMobile } from '../../../hooks/useIsMobile';

import { CloudProviderSection } from '../components/sections/CloudProviderSection';
import { GeneralSettingsSection } from '../components/sections/GeneralSettingsSection';
import { OnboardingSection } from '../components/sections/OnboardingSection';
import { OllamaSettingsSection } from '../components/sections/OllamaSettingsSection';
import { SavedKeysCard } from '../components/sections/SavedKeysCard';
import { AccountPreferencesSidebar } from '../layout/AccountPreferencesSidebar';
import { AccountPreferencesPageProps } from '../types';
import {
  useAccountPreferencesCategoryContext,
  useAccountPreferencesCloudContext,
  useAccountPreferencesNavigationContext,
  useAccountPreferencesOllamaContext,
  useAccountPreferencesRuntimeContext,
  useAccountPreferencesSettingsContext,
} from '../../../context/accountPreferencesPage/accountPreferencesPageContextHooks';
import { AccountPreferencesPageProviders } from './AccountPreferencesPageProviders';
import { SettingsPageLayout } from '../../../layouts/SettingsPageLayout/SettingsPageLayout';
import '../styles/accountPreferencesPage.css';

function AccountPreferencesPageContent() {
  const isMobile = useIsMobile();
  const { activeCategory, categories } = useAccountPreferencesCategoryContext();
  const {
    settingsLoading,
    saveError,
    hasChanges,
    saveSuccess,
    onSaveSettings,
    saveLoading,
  } = useAccountPreferencesRuntimeContext();
  const { onBack, onOpenDirectory } = useAccountPreferencesNavigationContext();
  const { settings, onChangeSettings } = useAccountPreferencesSettingsContext();
  const {
    hasProviderChanges,
    testing,
    testResult,
    onTestApiKey,
  } = useAccountPreferencesCloudContext();
  const { ollamaModels, ollamaModelsLoading, onRefreshOllamaModels } = useAccountPreferencesOllamaContext();

  const activeCategoryMeta =
    categories.find((category) => category.id === activeCategory) || categories[0];

  return (
    <SettingsPageLayout
      headerLeftContent={
        isMobile ? (
          <Button variant="ghost" size="sm" onClick={onBack} leftIcon={<ArrowLeft size={14} />}>
            Back
          </Button>
        ) : (
          <Flex align="center" gap="var(--space-md)">
            <Button variant="ghost" size="sm" onClick={onBack} leftIcon={<ArrowLeft size={14} />}>
              Back
            </Button>

            <Button variant="ghost" size="sm" onClick={onOpenDirectory} leftIcon={<Globe size={14} />}>
              Workspaces
            </Button>

            <Divider vertical style={{ height: '20px' }} />

            <div>
              <h1 className="account-preferences-page__title">Account Preferences</h1>
              <p className="account-preferences-page__title-description">Configure your local user environment</p>
            </div>
          </Flex>
        )
      }
      headerRightContent={
        isMobile ? (
          <Button variant="ghost" size="sm" onClick={onOpenDirectory} leftIcon={<Globe size={14} />}>
            Workspaces
          </Button>
        ) : (
          <Button variant="accent" size="sm" onClick={onSaveSettings} loading={saveLoading} disabled={!hasChanges}>
            {saveSuccess ? 'Changes Saved' : 'Save Changes'}
          </Button>
        )
      }
      sidebar={<AccountPreferencesSidebar />}
    >
      <div className="account-preferences-page__content">
        <Stack gap="var(--space-lg)">
          {!isMobile && (
            <div>
              <span className="account-preferences-page__eyebrow">Account Settings</span>
              <h2 className="account-preferences-page__heading">
                {activeCategoryMeta.label}
              </h2>
              <p className="account-preferences-page__heading-text">
                {activeCategoryMeta.description}
              </p>
            </div>
          )}

          {settingsLoading && (
            <Alert type="info">
              Loading saved account settings...
            </Alert>
          )}

          {saveError && (
            <Alert type="error">
              {saveError}
            </Alert>
          )}

          {(isMobile || activeCategory === 'general') && <GeneralSettingsSection />}

          {(isMobile || activeCategory === 'providers') && (
            <Stack gap="var(--space-md)">
              <CloudProviderSection
                settings={settings}
                onChangeSettings={onChangeSettings}
                saveLoading={saveLoading}
                hasProviderChanges={hasProviderChanges}
                testing={testing}
                testResult={testResult}
                onSaveSettings={onSaveSettings}
                onTestApiKey={onTestApiKey}
                isMobile={isMobile}
              />
              <SavedKeysCard />
            </Stack>
          )}

          {(isMobile || activeCategory === 'ollama') && (
            <OllamaSettingsSection
              settings={settings}
              ollamaModels={ollamaModels}
              ollamaModelsLoading={ollamaModelsLoading}
              onChangeSettings={onChangeSettings}
              onRefreshOllamaModels={onRefreshOllamaModels}
              isMobile={isMobile}
            />
          )}

          {(isMobile || activeCategory === 'onboarding') && <OnboardingSection />}

          {isMobile && (
            <div className="account-preferences-page__mobile-save">
              <Button
                className="account-preferences-page__button-full"
                variant="accent"
                onClick={onSaveSettings}
                loading={saveLoading}
                disabled={!hasChanges}
              >
                {saveSuccess ? 'Changes Saved' : 'Save Changes'}
              </Button>
            </div>
          )}
        </Stack>
      </div>
    </SettingsPageLayout>
  );
}

export function AccountPreferencesPage(props: AccountPreferencesPageProps) {
  return (
    <AccountPreferencesPageProviders {...props}>
      <AccountPreferencesPageContent />
    </AccountPreferencesPageProviders>
  );
}
