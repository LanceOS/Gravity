import { Button, Stack, Card } from '@library';

import { StatusNotice } from '../StatusNotice';
import { useAccountPreferencesOnboardingContext } from '../../contexts/accountPreferencesPageContexts';

export function OnboardingSection() {
  const { tutorialResult, onResetTutorial } = useAccountPreferencesOnboardingContext();

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
          <Button className="account-preferences-page__button-secondary" variant="default" onClick={onResetTutorial}>
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
