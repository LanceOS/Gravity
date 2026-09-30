import { useState } from 'react';
import { Button, Stack, Card } from '@library';

import { StatusNotice } from '../StatusNotice';
import { useAccountPreferencesOnboardingContext } from '../../../../context/accountPreferencesPage/accountPreferencesPageContextHooks';
import { type StatusMessage } from '../../types';

interface OnboardingSectionProps {
  tutorialResult?: StatusMessage | null;
  onResetTutorial?: () => void;
}

export function OnboardingSection({
  tutorialResult: runtimeTutorialResult,
  onResetTutorial: runtimeOnResetTutorial,
}: OnboardingSectionProps = {}) {
  const { tutorialResult: contextTutorialResult, onResetTutorial: contextOnResetTutorial } =
    useAccountPreferencesOnboardingContext();

  const tutorialResult = runtimeTutorialResult ?? contextTutorialResult;
  const onResetTutorial = runtimeOnResetTutorial ?? contextOnResetTutorial;

  const [pending, setPending] = useState(false);

  return (
    <Card className="account-preferences-page__section-card">
      <Stack gap="var(--space-lg)">
        <div>
          <h2 className="account-preferences-page__section-title">Onboarding and guidance</h2>
          <p className="account-preferences-page__section-description">
            Replay the product tour the next time you reload or sign in with this account.
          </p>
        </div>

        <div>
          <Button className="account-preferences-page__button-secondary" variant="default" loading={pending} disabled={tutorialResult?.success} onClick={async () => {
            if (pending) return;
            setPending(true);
            try { await onResetTutorial(); } finally { setPending(false); }
          }}>
            Reset & Start Tutorial
          </Button>
        </div>

        {tutorialResult && (
          <StatusNotice message={tutorialResult} tone={tutorialResult.success ? 'success' : 'error'} />
        )}
      </Stack>
    </Card>
  );
}
