import { DashboardLayout } from '../../components/DashboardLayout/DashboardLayout';
import { type JSX, type ReactNode } from 'react';

interface SettingsPageLayoutProps {
  headerLeftContent: ReactNode;
  headerRightContent: ReactNode;
  sidebar: ReactNode;
  children: ReactNode;
}

export function SettingsPageLayout({
  headerLeftContent,
  headerRightContent,
  sidebar,
  children,
}: SettingsPageLayoutProps): JSX.Element {
  return (
    <DashboardLayout>
      <DashboardLayout.Header leftContent={headerLeftContent} rightContent={headerRightContent} />
      <DashboardLayout.Sidebar>{sidebar}</DashboardLayout.Sidebar>
      <DashboardLayout.Main>
        <DashboardLayout.Content>{children}</DashboardLayout.Content>
      </DashboardLayout.Main>
    </DashboardLayout>
  );
}
