import { useEffect, useState } from 'react';

import type { SettingsCategoryId } from '../types';

export interface AccountPreferencesPageState {
  activeCategory: SettingsCategoryId;
  setActiveCategory: (categoryId: SettingsCategoryId) => void;
}

export function useAccountPreferencesPageState(onResetProviderDraft: () => void, initialCategory: SettingsCategoryId = 'general'): AccountPreferencesPageState {
  const [activeCategory, setActiveCategory] = useState<SettingsCategoryId>(initialCategory);

  useEffect(() => {
    setActiveCategory(initialCategory);
  }, [initialCategory]);

  useEffect(() => {
    if (activeCategory !== 'providers') {
      return;
    }

    onResetProviderDraft();
  }, [activeCategory, onResetProviderDraft]);

  return {
    activeCategory,
    setActiveCategory,
  };
}
