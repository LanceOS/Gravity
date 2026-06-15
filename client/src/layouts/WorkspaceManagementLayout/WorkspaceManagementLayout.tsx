import { type JSX, type ReactNode } from 'react';
import { WorkspaceHeader } from '../../modules/workspaces/components/WorkspaceHeader';

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

export function WorkspaceManagementLayout({
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
  return (
    <div className={`workspace-page ${pageClassName}`}>
      <WorkspaceHeader>
        <WorkspaceHeader.Top>
          <WorkspaceHeader.Title>{title}</WorkspaceHeader.Title>
          {actions}
        </WorkspaceHeader.Top>
      </WorkspaceHeader>

      <div className={contentClassName}>
        {hero}
        {feedback}

        {loading ? (loadingNode ?? children) : children}
      </div>
    </div>
  );
}
