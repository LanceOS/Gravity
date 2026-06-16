import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WorkspacePageLayout } from '../../layouts/WorkspacePageLayout/WorkspacePageLayout';

describe('WorkspacePageLayout', () => {
  it('renders the workspace header and a scrollable body when requested', () => {
    const { container } = render(
      <WorkspacePageLayout
        title="Workspace Tasks"
        actions={<button type="button">Create</button>}
        bodyScrollable
      >
        <div>Task list</div>
      </WorkspacePageLayout>
    );

    expect(screen.getByText('Workspace Tasks')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create' })).toBeInTheDocument();
    expect(screen.getByText('Task list')).toBeInTheDocument();
    expect(container.querySelector('.workspace-page-layout__content-body')).toHaveClass(
      'workspace-page-layout__content-body--scrollable'
    );
  });

  it('allows stateful children to provide their own content header and body', () => {
    const { container } = render(
      <WorkspacePageLayout title="Manage Projects" wrapBody={false}>
        <WorkspacePageLayout.ContentHeader>
          <div>Project summary</div>
        </WorkspacePageLayout.ContentHeader>
        <WorkspacePageLayout.ContentBody>
          <div>Project editor</div>
        </WorkspacePageLayout.ContentBody>
      </WorkspacePageLayout>
    );

    expect(screen.getByText('Project summary')).toBeInTheDocument();
    expect(screen.getByText('Project editor')).toBeInTheDocument();
    expect(container.querySelectorAll('.workspace-page-layout__content-body')).toHaveLength(1);
  });
});
