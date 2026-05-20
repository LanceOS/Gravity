import type { ReactNode } from 'react';
import { Sidebar, type SidebarProps } from '../../components/Sidebar';
import './WorkspaceLayout.css';

interface WorkspaceLayoutProps {
  sidebarProps: SidebarProps;
  children: ReactNode;
  rightPanels?: ReactNode;
}

export function WorkspaceLayout({ sidebarProps, children, rightPanels }: WorkspaceLayoutProps) {
  return (
    <div className="workspace-layout">
      <Sidebar {...sidebarProps} />
      <main className="workspace-layout__main">{children}</main>
      {rightPanels}
    </div>
  );
}