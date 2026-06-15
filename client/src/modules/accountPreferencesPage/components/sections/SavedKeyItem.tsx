import { Button } from '@library';
import { Trash2 } from 'lucide-react';

import type { SavedApiCredential } from '../../../../utils/settings';
import { getProviderOption } from '../../../../utils/settings';

export function SavedKeyItem({
  credential,
  isActive,
  onRemove,
}: {
  credential: SavedApiCredential;
  isActive: boolean;
  onRemove: () => void;
}) {
  const option = getProviderOption(credential.provider);

  return (
    <div className="account-preferences-page__saved-key-item">
      <div className="account-preferences-page__saved-key-title">
        {option.label}{credential.preferredModel ? ` — ${credential.preferredModel}` : ''}
      </div>

      <div className="account-preferences-page__saved-key-token">
        {credential.apiKey}
      </div>

      <div className="account-preferences-page__saved-key-meta">
        <span className={`account-preferences-page__saved-key-state ${isActive ? 'account-preferences-page__saved-key-state--active' : ''}`}>
          {isActive ? 'Active' : 'Inactive'}
        </span>

        <Button
          variant="danger"
          size="sm"
          onClick={onRemove}
          aria-label={`Remove ${option.label} key`}
          title={`Remove ${option.label} key`}
        >
          <Trash2 size={13} aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
