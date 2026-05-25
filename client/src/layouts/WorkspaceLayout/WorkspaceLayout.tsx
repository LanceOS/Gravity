import type { ReactNode } from 'react';
import { Sidebar, type SidebarProps } from '../../components/Sidebar';
import { DashboardLayout } from '../../components/DashboardLayout/DashboardLayout';
import { ThemeToggle, Select } from '@library';
import './WorkspaceLayout.css';

interface WorkspaceLayoutProps {
  sidebarProps: SidebarProps;
  children: ReactNode;
  rightPanels?: ReactNode;
}

export function WorkspaceLayout({ sidebarProps, children, rightPanels }: WorkspaceLayoutProps) {
  return (
    <DashboardLayout>
      <DashboardLayout.Header>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="10" stroke="var(--color-text-primary)" strokeWidth="2" />
            <circle cx="12" cy="12" r="6" stroke="var(--color-primary)" strokeWidth="2" strokeDasharray="4 2" />
            <circle cx="12" cy="12" r="2" fill="var(--color-text-primary)" />
          </svg>
          <span style={{ fontWeight: 600, fontSize: '15px', color: 'var(--color-text-primary)', letterSpacing: '-0.3px' }}>Gravity</span>
        </div>
        
        <div style={{ width: '240px', marginLeft: '16px' }}>
          <Select
            value={sidebarProps.workspace.activeWorkspaceId}
            onValueChange={(val: string) => sidebarProps.workspace.onSelectWorkspace(val)}
            options={sidebarProps.workspace.workspaces.map((item) => ({ value: item.id, label: item.name }))}
            aria-label="Select workspace"
            className="input"
            style={{ width: '100%', minHeight: '34px', padding: '0 10px', fontSize: '13px' }}
          />
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
          <ThemeToggle />
        </div>
      </DashboardLayout.Header>
      <Sidebar {...sidebarProps} />
      <DashboardLayout.Main>{children}</DashboardLayout.Main>
      {rightPanels}
    </DashboardLayout>
  );
}