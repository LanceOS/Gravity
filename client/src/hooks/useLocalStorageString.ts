import { useCallback } from 'react';

interface UseLocalStorageStringArgs {
  key: string | null;
}

export interface UseLocalStorageStringResult {
  readValue: () => string | null;
  writeValue: (value: string | null) => void;
}

export function useLocalStorageString({ key }: UseLocalStorageStringArgs): UseLocalStorageStringResult {
  const readValue = useCallback(() => {
    if (typeof window === 'undefined' || !key) {
      return null;
    }

    return window.localStorage.getItem(key);
  }, [key]);

  const writeValue = useCallback((value: string | null) => {
    if (typeof window === 'undefined' || !key) {
      return;
    }

    if (value == null) {
      window.localStorage.removeItem(key);
      return;
    }

    window.localStorage.setItem(key, value);
  }, [key]);

  return {
    readValue,
    writeValue,
  };
}

