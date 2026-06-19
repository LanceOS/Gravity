import React, { createContext, useContext, useState, useRef, useEffect, useCallback, ReactNode } from 'react';
import { ActiveProjectContextState } from './ActiveProjectContext.types';

const ActiveProjectContext = createContext<ActiveProjectContextState | undefined>(undefined);

export const ActiveProjectProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [activeProjectId, setActiveProjectIdState] = useState<string>('');
  const activeProjectIdRef = useRef(activeProjectId);

  useEffect(() => {
    activeProjectIdRef.current = activeProjectId;
  }, [activeProjectId]);

  const setActiveProjectId = useCallback((id: string) => {
    if (activeProjectIdRef.current === id) {
      return;
    }
    activeProjectIdRef.current = id;
    setActiveProjectIdState(id);
  }, []);

  return (
    <ActiveProjectContext.Provider
      value={{
        activeProjectId,
        setActiveProjectId,
        activeProjectIdRef,
      }}
    >
      {children}
    </ActiveProjectContext.Provider>
  );
};

export const useActiveProject = (): ActiveProjectContextState => {
  const context = useContext(ActiveProjectContext);
  if (!context) {
    throw new Error('useActiveProject must be used within an ActiveProjectProvider');
  }
  return context;
};
