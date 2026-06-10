import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { Breadcrumbs } from '../../components/Breadcrumbs/Breadcrumbs';

const project = {
  id: 'project-1',
  name: 'Gravity Core',
  key: 'GRA',
  description: 'Primary project',
  status: 'active' as const,
  workspaceId: 'workspace-1',
};

const ticket = {
  id: 'ticket-1',
  key: 'GRA-101',
  title: 'Fix sync retries',
  description: '',
  status: 'todo' as const,
  priority: 'medium' as const,
  assigneeId: null,
  projectId: 'project-1',
  domainId: null,
  cycleId: null,
  parentId: null,
  prStatus: 'none' as const,
  prUrl: null,
  createdAt: '2026-05-01T00:00:00.000Z',
  updatedAt: '2026-05-01T00:00:00.000Z',
};

describe('Breadcrumbs', () => {
  it('derives ticket breadcrumbs from the current URL and links to ancestor routes', () => {
    render(
      <MemoryRouter>
        <Breadcrumbs
          pathname="/workspaces/workspace-1/projects/project-1/tickets/GRA-101"
          workspaceId="workspace-1"
          workspaceName="Gravity"
          projects={[project]}
          activeTicket={ticket}
        />
      </MemoryRouter>
    );

    expect(screen.getByRole('link', { name: 'Gravity' })).toHaveAttribute('href', '/workspaces/workspace-1');
    expect(screen.getByRole('link', { name: 'Gravity Core' })).toHaveAttribute(
      'href',
      '/workspaces/workspace-1/projects/project-1'
    );
    expect(screen.getByRole('link', { name: 'Tickets' })).toHaveAttribute(
      'href',
      '/workspaces/workspace-1/projects/project-1/tickets'
    );
    expect(screen.getByText('GRA-101')).toHaveAttribute('aria-current', 'page');
  });

  it('derives note breadcrumbs from the current URL', () => {
    render(
      <MemoryRouter>
        <Breadcrumbs
          pathname="/workspaces/workspace-1/projects/project-1/notes/note-abc"
          workspaceId="workspace-1"
          workspaceName="Gravity"
          projects={[project]}
          activeNoteId="note-abc"
        />
      </MemoryRouter>
    );

    expect(screen.getByRole('link', { name: 'Gravity Core' })).toHaveAttribute(
      'href',
      '/workspaces/workspace-1/projects/project-1'
    );
    expect(screen.getByRole('link', { name: 'Notes' })).toHaveAttribute(
      'href',
      '/workspaces/workspace-1/projects/project-1/notes'
    );
    expect(screen.getByText('note-abc')).toHaveAttribute('aria-current', 'page');
  });
});
