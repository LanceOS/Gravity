import { type JSX, type ReactNode } from 'react';
import { WorkspaceHeader } from '../../modules/workspaces/components/WorkspaceHeader';
import './WorkspacePageLayout.css';

type WorkspacePageBodyOverflow = 'hidden' | 'auto' | 'visible';

interface WorkspacePageLayoutProps {
  title?: ReactNode;
  pageClassName?: string;
  contentClassName?: string;
  contentShellClassName?: string;
  contentHeaderClassName?: string;
  contentBodyClassName?: string;
  actions?: ReactNode;
  header?: ReactNode;
  headerBottom?: ReactNode;
  contentHeader?: ReactNode;
  hero?: ReactNode;
  feedback?: ReactNode;
  loading?: boolean;
  loadingNode?: ReactNode;
  bodyScrollable?: boolean;
  bodyOverflow?: WorkspacePageBodyOverflow;
  flushContent?: boolean;
  wrapBody?: boolean;
  children: ReactNode;
}

interface WorkspacePageShellProps {
  className?: string;
  children: ReactNode;
}

interface WorkspacePageContentProps {
  className?: string;
  shellClassName?: string;
  flush?: boolean;
  children: ReactNode;
}

interface WorkspacePageContentAreaProps {
  className?: string;
  children: ReactNode;
}

interface WorkspacePageContentBodyProps extends WorkspacePageContentAreaProps {
  scrollable?: boolean;
  overflow?: WorkspacePageBodyOverflow;
}

type WorkspacePageLayoutComponent = ((props: WorkspacePageLayoutProps) => JSX.Element) & {
  Shell: (props: WorkspacePageShellProps) => JSX.Element;
  Header: (props: WorkspacePageContentAreaProps) => JSX.Element;
  Body: (props: WorkspacePageContentBodyProps) => JSX.Element;
  Content: (props: WorkspacePageContentProps) => JSX.Element;
  ContentHeader: (props: WorkspacePageContentAreaProps) => JSX.Element;
  ContentBody: (props: WorkspacePageContentBodyProps) => JSX.Element;
};

function joinClassNames(...classNames: Array<string | false | null | undefined>): string {
  return Array.from(new Set(classNames.filter(Boolean) as string[])).join(' ');
}

function WorkspacePageShell({ className, children }: WorkspacePageShellProps): JSX.Element {
  return <div className={joinClassNames('workspace-page-layout', 'workspace-page', className)}>{children}</div>;
}

function WorkspacePageHeader({ className, children }: WorkspacePageContentAreaProps): JSX.Element {
  return <div className={joinClassNames('workspace-page-layout__header', className)}>{children}</div>;
}

function WorkspacePageContent({
  className,
  shellClassName,
  flush = false,
  children,
}: WorkspacePageContentProps): JSX.Element {
  return (
    <main className={joinClassNames('workspace-page-layout__content', className)}>
      <div
        className={joinClassNames(
          'workspace-page-layout__content-shell',
          flush && 'workspace-page-layout__content-shell--flush',
          shellClassName
        )}
      >
        {children}
      </div>
    </main>
  );
}

function WorkspacePageContentHeader({ className, children }: WorkspacePageContentAreaProps): JSX.Element {
  return <div className={joinClassNames('workspace-page-layout__content-header', className)}>{children}</div>;
}

function WorkspacePageContentBody({
  className,
  children,
  scrollable = false,
  overflow = scrollable ? 'auto' : 'hidden',
}: WorkspacePageContentBodyProps): JSX.Element {
  return (
    <div
      className={joinClassNames(
        'workspace-page-layout__content-body',
        overflow === 'auto' && 'workspace-page-layout__content-body--scrollable',
        overflow === 'visible' && 'workspace-page-layout__content-body--visible',
        className
      )}
    >
      {children}
    </div>
  );
}

export const WorkspacePageLayout: WorkspacePageLayoutComponent = Object.assign(function WorkspacePageLayout({
  title,
  pageClassName,
  contentClassName,
  contentShellClassName,
  contentHeaderClassName,
  contentBodyClassName,
  actions,
  header,
  headerBottom,
  contentHeader,
  hero,
  feedback,
  loading = false,
  loadingNode,
  bodyScrollable = false,
  bodyOverflow,
  flushContent = false,
  wrapBody = true,
  children,
}: WorkspacePageLayoutProps): JSX.Element {
  const bodyContent = loading ? (loadingNode ?? children) : children;
  const resolvedContentHeader = contentHeader ?? (
    hero || feedback ? (
      <>
        {hero}
        {feedback}
      </>
    ) : null
  );
  const resolvedHeader = header ?? (
    title || actions || headerBottom ? (
      <WorkspaceHeader>
        {title || actions ? (
          <WorkspaceHeader.Top>
            {title ? <WorkspaceHeader.Title>{title}</WorkspaceHeader.Title> : null}
            {actions}
          </WorkspaceHeader.Top>
        ) : null}
        {headerBottom ? <WorkspaceHeader.Bottom>{headerBottom}</WorkspaceHeader.Bottom> : null}
      </WorkspaceHeader>
    ) : null
  );

  return (
    <WorkspacePageShell className={pageClassName}>
      {resolvedHeader}

      <WorkspacePageContent className={contentClassName} shellClassName={contentShellClassName} flush={flushContent}>
        {resolvedContentHeader ? (
          <WorkspacePageContentHeader className={contentHeaderClassName}>
            {resolvedContentHeader}
          </WorkspacePageContentHeader>
        ) : null}

        {wrapBody ? (
          <WorkspacePageContentBody
            className={contentBodyClassName}
            scrollable={bodyScrollable}
            overflow={bodyOverflow}
          >
            {bodyContent}
          </WorkspacePageContentBody>
        ) : (
          bodyContent
        )}
      </WorkspacePageContent>
    </WorkspacePageShell>
  );
}, {
  Shell: WorkspacePageShell,
  Header: WorkspacePageHeader,
  Body: WorkspacePageContentBody,
  Content: WorkspacePageContent,
  ContentHeader: WorkspacePageContentHeader,
  ContentBody: WorkspacePageContentBody,
});
