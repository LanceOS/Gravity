import { Alert, Card, Stack } from '@library';

import { SavedKeyItem } from './SavedKeyItem';
import {
  useAccountPreferencesCloudContext,
  useAccountPreferencesSettingsContext,
} from '../../../../context/accountPreferencesPage/accountPreferencesPageContextHooks';

export function SavedKeysCard() {
  const { savedCredentials, onRemoveCredential } = useAccountPreferencesCloudContext();
  const { settings } = useAccountPreferencesSettingsContext();

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
                isActive={credential.provider === settings.aiProvider}
                onRemove={() => onRemoveCredential(credential.provider)}
              />
            ))}
          </Stack>
        )}
      </Stack>
    </Card>
  );
}
