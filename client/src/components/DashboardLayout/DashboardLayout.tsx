import type { ReactNode } from 'react';
import './DashboardLayout.css';

interface DashboardLayoutProps {
  children: ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  return <div className="dashboard-layout">{children}</div>;
}

interface SidebarProps {
  children: ReactNode;
}

function Sidebar({ children }: SidebarProps) {
  return <aside className="dashboard-layout__sidebar">{children}</aside>;
}

interface MainProps {
  children: ReactNode;
}

function Main({ children }: MainProps) {
  return <main className="dashboard-layout__main">{children}</main>;
}

interface HeaderProps {
  children?: ReactNode;
  leftContent?: ReactNode;
  rightContent?: ReactNode;
}

function Header({ children, leftContent, rightContent }: HeaderProps) {
  return (
    <header className="dashboard-layout__header">
      {children ? children : (
        <>
          <div className="dashboard-layout__header-left">{leftContent}</div>
          <div className="dashboard-layout__header-right">{rightContent}</div>
        </>
      )}
    </header>
  );
}

interface ContentProps {
  children: ReactNode;
}

function Content({ children }: ContentProps) {
  return <section className="dashboard-layout__content">{children}</section>;
}

// Assign compound components
DashboardLayout.Sidebar = Sidebar;
DashboardLayout.Main = Main;
DashboardLayout.Header = Header;
DashboardLayout.Content = Content;
