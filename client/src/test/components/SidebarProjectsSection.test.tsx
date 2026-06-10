import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SidebarProjectsSection } from '../../components/Sidebar/components/SidebarProjectsSection.tsx';

function makeProps(overrides = {}) {
  const props = {
    section: {
      projects: [
        { id: 'project-1', name: 'Proj 1', description: '', key: 'P1', status: 'active', workspaceId: 'w1' },
      ],
      labels: [
        { id: 'd-1', name: 'Label One', color: '#ff0000' },
        { id: 'd-2', name: 'Label Two', color: '#00ff00' },
      ],
      cycles: [],
      currentUser: { id: 'user-1', name: 'A', email: 'a@b', avatar: '', role: 'owner' },
      activeProjectId: 'project-1',
      filters: { status: '', priority: '', projectId: '', labels: [] as string[], cycleId: '', assigneeId: '', search: '' },
      counts: { myIssues: 0, activeProjectIssues: 0, labels: { 'd-1': 1, 'd-2': 2 }, cycles: {} },
      onSelectProject: vi.fn(),
      onShowProjectIssues: vi.fn(),
      onShowMyIssues: vi.fn(),
      onSelectCycle: vi.fn(),
      onSelectLabel: vi.fn(),
    },
    projectsCollapsed: false,
    collapsedProjects: {},
    onToggleProjectsCollapsed: vi.fn(),
    onToggleProject: vi.fn(),
    ...overrides,
  };

  return props;
}

describe('SidebarProjectsSection', () => {
  it('calls onSelectLabel when a label is clicked', async () => {
    const user = userEvent.setup();
    const props = makeProps();

    render(
      // @ts-expect-error narrow props for test
      <SidebarProjectsSection {...props} />
    );

    await user.click(screen.getByRole('button', { name: /Label One/i }));

    expect(props.section.onSelectLabel).toHaveBeenCalledWith('d-1');
  });
});
