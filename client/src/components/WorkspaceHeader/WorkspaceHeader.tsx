import React from 'react';
import { Kanban, List } from 'lucide-react';
import './WorkspaceHeader.css';

interface WorkspaceHeaderProps {
  children: React.ReactNode;
}

export function WorkspaceHeader({ children }: WorkspaceHeaderProps) {
  return <header className="workspace-header">{children}</header>;
}

interface WorkspaceHeaderTopProps {
  children: React.ReactNode;
}

WorkspaceHeader.Top = function WorkspaceHeaderTop({ children }: WorkspaceHeaderTopProps) {
  return <div className="workspace-header__top">{children}</div>;
};

interface WorkspaceHeaderTitleProps {
  children: React.ReactNode;
}

WorkspaceHeader.Title = function WorkspaceHeaderTitle({ children }: WorkspaceHeaderTitleProps) {
  return (
    <div className="workspace-header__title-group">
      <span className="workspace-header__title">{children}</span>
    </div>
  );
};

interface WorkspaceHeaderViewToggleProps {
  activeView: 'board' | 'list';
  onSetView: (view: 'board' | 'list') => void;
}

WorkspaceHeader.ViewToggle = function WorkspaceHeaderViewToggle({
  activeView,
  onSetView,
}: WorkspaceHeaderViewToggleProps) {
  return (
    <div className="workspace-header__view-toggle" role="tablist" aria-label="View mode">
      <button
        type="button"
        onClick={() => onSetView('board')}
        className={`workspace-header__view-button ${
          activeView === 'board' ? 'workspace-header__view-button--active' : ''
        }`}
      >
        <Kanban size={12} />
        <span>Board</span>
      </button>
      <button
        type="button"
        onClick={() => onSetView('list')}
        className={`workspace-header__view-button ${
          activeView === 'list' ? 'workspace-header__view-button--active' : ''
        }`}
      >
        <List size={12} />
        <span>List</span>
      </button>
    </div>
  );
};

interface WorkspaceHeaderBottomProps {
  children: React.ReactNode;
}

WorkspaceHeader.Bottom = function WorkspaceHeaderBottom({ children }: WorkspaceHeaderBottomProps) {
  return <div className="workspace-header__bottom">{children}</div>;
};
