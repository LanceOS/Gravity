import React, { createContext, useContext, useState, ReactNode } from 'react';
import type { ActiveView, ActiveViewContextType } from './ActiveViewContext.types';

const ActiveViewContext = createContext<ActiveViewContextType | undefined>(undefined);

export const ActiveViewProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [activeView, setView] = useState<ActiveView>('board');

  return (
    <ActiveViewContext.Provider value={{ activeView, setView }}>
      {children}
    </ActiveViewContext.Provider>
  );
};

export const useActiveView = (): ActiveViewContextType => {
  const context = useContext(ActiveViewContext);
  if (!context) {
    throw new Error('useActiveView must be used within an ActiveViewProvider');
  }
  return context;
};
