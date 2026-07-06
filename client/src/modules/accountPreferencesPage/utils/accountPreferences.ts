import { Bot, Settings2, WandSparkles } from 'lucide-react';

import { API_KEY_MASK, AI_PROVIDER_OPTIONS } from '../../../utils/settings';
import type { AccountPreferencesCategoryMeta, SettingsCategoryId } from '../types';

export const SETTINGS_CATEGORIES: AccountPreferencesCategoryMeta[] = [
  {
    id: 'general',
    label: 'General',
    description: 'Theme, default view, and board density for your local account.',
    icon: Settings2,
  },
  {
    id: 'providers',
    label: 'Cloud AI',
    description: 'Provider selection and API credentials for your account.',
    icon: WandSparkles,
  },
  {
    id: 'onboarding',
    label: 'Onboarding',
    description: 'Replay the product tour and guided setup for this account.',
    icon: Bot,
  },
];

export const SETTINGS_CATEGORY_IDS = SETTINGS_CATEGORIES.map((category) => category.id);

export const VIEW_MODE_OPTIONS = [
  { value: 'board', label: 'Kanban Board' },
  { value: 'list', label: 'Issues List' },
] as const;

export const THEME_OPTIONS = [
  { value: 'dark', label: 'Noir' },
  { value: 'coal-black', label: 'Coal Black' },
  { value: 'coffee', label: 'Coffee' },
  { value: 'midnight-azure', label: 'Midnight Azure' },
  { value: 'honey-glow', label: 'Honey Glow' },
  { value: 'marble-blue', label: 'Marble Blue' },
] as const;

export const PROJECT_LAYOUT_OPTIONS = [
  { value: 'standard', label: 'Standard (Relaxed)' },
  { value: 'condensed', label: 'Condensed (High Density)' },
] as const;

export const CLOUD_PROVIDER_OPTIONS = AI_PROVIDER_OPTIONS.map((option) => ({
  value: option.value,
  label: option.label,
}));

export const isStoredApiKey = (apiKey: string): boolean => apiKey === API_KEY_MASK;

export const isOnboardingNeeded = (tutorialCompleted: number | boolean | undefined | null): boolean =>
  tutorialCompleted === 0 || tutorialCompleted === false;
