import { useCallback } from 'react';

interface UseOpenDialogArgs {
  setIsOpen: (open: boolean) => void;
}

export interface UseOpenDialogResult {
  open: () => void;
}

export function useOpenDialog({ setIsOpen }: UseOpenDialogArgs): UseOpenDialogResult {
  const open = useCallback(() => {
    setIsOpen(true);
  }, [setIsOpen]);

  return { open };
}
