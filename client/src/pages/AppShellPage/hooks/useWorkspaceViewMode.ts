import { useEffect, useState } from 'react';

export function useWorkspaceViewMode(activeView: 'list' | 'board', setView: (view: 'list' | 'board') => void) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth <= 768;
      setIsMobile(mobile);
      if (mobile && activeView !== 'list') {
        setView('list');
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [activeView, setView]);

  return { isMobile };
}
