import type { ReactNode } from 'react';
import { Sidebar, type SidebarProps } from '../../components/Sidebar';
import { DashboardLayout } from '../../components/DashboardLayout/DashboardLayout';
import './WorkspaceLayout.css';

interface WorkspaceLayoutProps {
  sidebarProps: SidebarProps;
  children: ReactNode;
  rightPanels?: ReactNode;
}

export function WorkspaceLayout({ sidebarProps, children, rightPanels }: WorkspaceLayoutProps) {
  return (
    <DashboardLayout>
      <Sidebar {...sidebarProps} />
      <DashboardLayout.Main>{children}</DashboardLayout.Main>
      {rightPanels}
    </DashboardLayout>
  );
}