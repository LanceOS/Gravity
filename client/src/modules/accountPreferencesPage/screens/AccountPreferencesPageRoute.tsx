import { AuthScreen } from '../../auth';
import { OnboardingModal } from '../../onboarding';
import { LoadingPage } from '../../loadingPage';

import { useAccountPreferencesPageRoute } from '../hooks/useAccountPreferencesPageRoute';
import { AccountPreferencesPage } from './AccountPreferencesPage';

export function AccountPreferencesPageRoute() {
  const {
    loading,
    currentUser,
    onboardingVisible,
    completeOnboarding,
    ...pageProps
  } = useAccountPreferencesPageRoute();

  if (loading) {
    return <LoadingPage />;
  }

  if (!currentUser) {
    return <AuthScreen />;
  }

  return (
    <>
      <AccountPreferencesPage
        currentUser={currentUser}
        {...pageProps}
      />
      {onboardingVisible ? <OnboardingModal onComplete={completeOnboarding} /> : null}
    </>
  );
}

