import React from 'react';
import { Kanban, List } from 'lucide-react';
import './WorkspaceHeader.css';

interface WorkspaceHeaderProps {
  children: React.ReactNode;
}

interface WorkspaceHeaderTopProps {
  children: React.ReactNode;
}

interface WorkspaceHeaderTitleProps {
  children: React.ReactNode;
}

interface WorkspaceHeaderViewToggleProps {
  activeView: 'board' | 'list' | 'timeline';
  onSetView: (view: 'board' | 'list') => void;
}

interface WorkspaceHeaderBottomProps {
  children: React.ReactNode;
}

type WorkspaceHeaderComponent = (({
  children,
}: WorkspaceHeaderProps) => React.JSX.Element) & {
  Top: ({ children }: WorkspaceHeaderTopProps) => React.JSX.Element;
  Title: ({ children }: WorkspaceHeaderTitleProps) => React.JSX.Element;
  ViewToggle: ({
    activeView,
    onSetView,
  }: WorkspaceHeaderViewToggleProps) => React.JSX.Element;
  Bottom: ({ children }: WorkspaceHeaderBottomProps) => React.JSX.Element;
};

function WorkspaceHeaderBottom({ children }: WorkspaceHeaderBottomProps) {
  return <div className="workspace-header__bottom">{children}</div>;
}

export const WorkspaceHeader: WorkspaceHeaderComponent = Object.assign(
  function WorkspaceHeader({ children }: WorkspaceHeaderProps) {
    const hasBottom = React.Children.toArray(children).some(
      (child) => React.isValidElement(child) && child.type === WorkspaceHeaderBottom
    );
    return (
      <header className={`workspace-header ${hasBottom ? 'workspace-header--with-bottom' : ''}`}>
        {children}
      </header>
    );
  },
  {
    Top: function WorkspaceHeaderTop({ children }: WorkspaceHeaderTopProps) {
      return <div className="workspace-header__top">{children}</div>;
    },

    Title: function WorkspaceHeaderTitle({ children }: WorkspaceHeaderTitleProps) {
      return (
        <div className="workspace-header__title-group">
          <span className="workspace-header__title">{children}</span>
        </div>
      );
    },

    ViewToggle: function WorkspaceHeaderViewToggle({
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
    },

    Bottom: WorkspaceHeaderBottom,
  }
);
