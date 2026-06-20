import { useEffect, useRef } from 'react';

import { useIsMobile } from '../../../hooks/useIsMobile';

export function useWorkspaceViewMode(activeView: 'list' | 'board', setView: (view: 'list' | 'board') => void) {
  const isMobile = useIsMobile();
  const activeViewRef = useRef(activeView);

  useEffect(() => {
    activeViewRef.current = activeView;
  }, [activeView]);

  useEffect(() => {
    if (!isMobile) {
      return;
    }

    if (activeViewRef.current !== 'list') {
      setView('list');
    }
  }, [isMobile, setView]);

  return { isMobile };
}
