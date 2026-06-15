import { Button, Divider, Flex } from '@library';
import { DashboardLayout } from '../../../components/DashboardLayout/DashboardLayout';
import { Globe, ArrowLeft } from 'lucide-react';
import {
  useAccountPreferencesNavigationContext,
  useAccountPreferencesRuntimeContext,
} from '../contexts/accountPreferencesPageContexts';

export function AccountPreferencesHeader({
  isMobile,
}: {
  isMobile: boolean;
}) {
  const { onBack, onOpenDirectory } = useAccountPreferencesNavigationContext();
  const { saveLoading, saveSuccess, hasChanges, onSaveSettings } = useAccountPreferencesRuntimeContext();

  return (
    <DashboardLayout.Header
      leftContent={
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
      rightContent={
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
    />
  );
}
