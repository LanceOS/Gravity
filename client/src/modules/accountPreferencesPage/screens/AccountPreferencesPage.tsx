import { Alert, Button, Stack } from '@library';
import { DashboardLayout } from '../../../components/DashboardLayout/DashboardLayout';
import { useIsMobile } from '../../../hooks/useIsMobile';

import { CloudProviderSection } from '../components/sections/CloudProviderSection';
import { GeneralSettingsSection } from '../components/sections/GeneralSettingsSection';
import { OnboardingSection } from '../components/sections/OnboardingSection';
import { OllamaSettingsSection } from '../components/sections/OllamaSettingsSection';
import { SavedKeysCard } from '../components/sections/SavedKeysCard';
import { AccountPreferencesHeader } from '../layout/AccountPreferencesHeader';
import { AccountPreferencesSidebar } from '../layout/AccountPreferencesSidebar';
import { AccountPreferencesPageProps } from '../types';
import {
  useAccountPreferencesCategoryContext,
  useAccountPreferencesRuntimeContext,
} from '../contexts/accountPreferencesPageContexts';
import { AccountPreferencesPageProviders } from './AccountPreferencesPageProviders';
import './styles/accountPreferencesPage.css';

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

  const activeCategoryMeta =
    categories.find((category) => category.id === activeCategory) || categories[0];

  return (
    <DashboardLayout>
      <AccountPreferencesHeader isMobile={isMobile} />

      <DashboardLayout.Sidebar>
        <AccountPreferencesSidebar />
      </DashboardLayout.Sidebar>

      <DashboardLayout.Main>
        <DashboardLayout.Content>
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
                  <CloudProviderSection />
                  <SavedKeysCard />
                </Stack>
              )}

              {(isMobile || activeCategory === 'ollama') && <OllamaSettingsSection />}

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
        </DashboardLayout.Content>
      </DashboardLayout.Main>
    </DashboardLayout>
  );
}

export function AccountPreferencesPage(props: AccountPreferencesPageProps) {
  return (
    <AccountPreferencesPageProviders {...props}>
      <AccountPreferencesPageContent />
    </AccountPreferencesPageProviders>
  );
}
