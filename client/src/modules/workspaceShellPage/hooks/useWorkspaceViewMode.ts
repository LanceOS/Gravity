import { useEffect } from 'react';

import { useIsMobile } from '../../../hooks/useIsMobile';

export function useWorkspaceViewMode(activeView: 'list' | 'board', setView: (view: 'list' | 'board') => void) {
  const isMobile = useIsMobile();

  useEffect(() => {
    if (!isMobile) {
      return;
    }

    if (activeView !== 'list') {
      setView('list');
    }
  }, [activeView, isMobile, setView]);

  return { isMobile };
}
