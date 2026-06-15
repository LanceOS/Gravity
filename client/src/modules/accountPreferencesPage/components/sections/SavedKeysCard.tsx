import { Alert, Card, Stack } from '@library';

import { SavedKeyItem } from './SavedKeyItem';
import type { AIProvider, SavedApiCredential } from '../../../../utils/settings';
import {
  useAccountPreferencesCloudContext,
  useAccountPreferencesSettingsContext,
} from '../../../../context/accountPreferencesPage/accountPreferencesPageContextHooks';

interface SavedKeysCardProps {
  savedCredentials?: SavedApiCredential[];
  activeProvider?: AIProvider;
  onRemoveCredential?: (provider: AIProvider) => void;
}

export function SavedKeysCard({
  savedCredentials: runtimeSavedCredentials,
  activeProvider: runtimeActiveProvider,
  onRemoveCredential: runtimeOnRemoveCredential,
}: SavedKeysCardProps = {}) {
  const { savedCredentials: contextSavedCredentials, onRemoveCredential: contextOnRemoveCredential } =
    useAccountPreferencesCloudContext();
  const { settings } = useAccountPreferencesSettingsContext();

  const savedCredentials = runtimeSavedCredentials ?? contextSavedCredentials;
  const activeProvider = runtimeActiveProvider ?? settings.aiProvider;
  const onRemoveCredential = runtimeOnRemoveCredential ?? contextOnRemoveCredential;

  return (
    <Card className="account-preferences-page__section-card">
      <Stack gap="var(--space-md)">
        <div>
          <h3 className="account-preferences-page__section-subtitle">Saved keys</h3>
          <p className="account-preferences-page__section-description">
            Masked credentials stored securely for this account.
          </p>
          <span className="account-preferences-page__saved-key-count">
            {savedCredentials.length} saved
          </span>
        </div>

        {savedCredentials.length === 0 ? (
          <Alert type="info">Save a key above to add it to this list.</Alert>
        ) : (
          <Stack gap="var(--space-sm)">
            {savedCredentials.map((credential) => (
              <SavedKeyItem
                key={credential.provider}
                credential={credential}
                isActive={credential.provider === activeProvider}
                onRemove={() => onRemoveCredential(credential.provider)}
              />
            ))}
          </Stack>
        )}
      </Stack>
    </Card>
  );
}
