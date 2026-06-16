import { type JSX, type ReactNode } from 'react';
import { WorkspaceHeader } from '../../modules/workspaces/components/WorkspaceHeader';
import './WorkspaceManagementLayout.css';

interface WorkspaceManagementLayoutProps {
  title: string;
  pageClassName: string;
  contentClassName: string;
  actions?: ReactNode;
  hero?: ReactNode;
  feedback?: ReactNode;
  loading?: boolean;
  loadingNode?: ReactNode;
  children: ReactNode;
}

interface WorkspaceManagementContentProps {
  className?: string;
  children: ReactNode;
}

interface WorkspaceManagementContentAreaProps {
  children: ReactNode;
}

type WorkspaceManagementLayoutComponent = ((props: WorkspaceManagementLayoutProps) => JSX.Element) & {
  Content: (props: WorkspaceManagementContentProps) => JSX.Element;
  ContentHeader: (props: WorkspaceManagementContentAreaProps) => JSX.Element;
  ContentBody: (props: WorkspaceManagementContentAreaProps) => JSX.Element;
};

function WorkspaceManagementContent({ className, children }: WorkspaceManagementContentProps): JSX.Element {
  return (
    <main className={['workspace-management-layout__content', className].filter(Boolean).join(' ')}>
      <div className="workspace-management-layout__content-shell">
        {children}
      </div>
    </main>
  );
}

function WorkspaceManagementContentHeader({ children }: WorkspaceManagementContentAreaProps): JSX.Element {
  return <div className="workspace-management-layout__content-header">{children}</div>;
}

function WorkspaceManagementContentBody({ children }: WorkspaceManagementContentAreaProps): JSX.Element {
  return <div className="workspace-management-layout__content-body">{children}</div>;
}

export const WorkspaceManagementLayout: WorkspaceManagementLayoutComponent = Object.assign(function WorkspaceManagementLayout({
  title,
  pageClassName,
  contentClassName,
  actions,
  hero,
  feedback,
  loading = false,
  loadingNode,
  children,
}: WorkspaceManagementLayoutProps): JSX.Element {
  const hasContentHeader = Boolean(hero || feedback);
  const bodyContent = loading ? (loadingNode ?? children) : children;

  return (
    <div className={`workspace-page ${pageClassName}`}>
      <WorkspaceHeader>
        <WorkspaceHeader.Top>
          <WorkspaceHeader.Title>{title}</WorkspaceHeader.Title>
          {actions}
        </WorkspaceHeader.Top>
      </WorkspaceHeader>

      <WorkspaceManagementContent className={contentClassName}>
        {hasContentHeader ? (
          <WorkspaceManagementContentHeader>
            {hero}
            {feedback}
          </WorkspaceManagementContentHeader>
        ) : null}

        {hasContentHeader ? (
          <WorkspaceManagementContentBody>
            {bodyContent}
          </WorkspaceManagementContentBody>
        ) : (
          bodyContent
        )}
      </WorkspaceManagementContent>
    </div>
  );
}, {
  Content: WorkspaceManagementContent,
  ContentHeader: WorkspaceManagementContentHeader,
  ContentBody: WorkspaceManagementContentBody,
});
