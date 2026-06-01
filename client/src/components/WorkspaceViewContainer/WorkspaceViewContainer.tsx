import React from 'react';
import './WorkspaceViewContainer.css';

interface WorkspaceViewContainerProps {
  children: React.ReactNode;
}

export function WorkspaceViewContainer({ children }: WorkspaceViewContainerProps) {
  return (
    <div className="workspace-view-container">
      {children}
    </div>
  );
}
