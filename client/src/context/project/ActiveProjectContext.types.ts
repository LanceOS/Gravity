import React from 'react';

export interface ActiveProjectContextState {
  activeProjectId: string;
  setActiveProjectId: (id: string) => void;
  activeProjectIdRef: React.MutableRefObject<string>;
}
