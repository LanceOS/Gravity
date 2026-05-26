export const LAST_ONBOARDING_STEP = 4;

export function getNextOnboardingStep(step: number) {
  return Math.min(step + 1, LAST_ONBOARDING_STEP);
}

export function getPreviousOnboardingStep(step: number) {
  return Math.max(step - 1, 0);
}