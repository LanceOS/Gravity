import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SidebarNavigation } from '../../components/Sidebar';

describe('SidebarNavigation', () => {
  it('renders grouped items with shared labels and dots', () => {
    render(
      <SidebarNavigation>
        <SidebarNavigation.Group label={<SidebarNavigation.Label>Projects</SidebarNavigation.Label>}>
          <SidebarNavigation.Item leftIcon={<SidebarNavigation.Dot color="#3b82f6" />}>
            Gravity
          </SidebarNavigation.Item>
        </SidebarNavigation.Group>
      </SidebarNavigation>
    );

    expect(screen.getByText('Projects')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Gravity/i })).toBeInTheDocument();
  });

  it('collapses nested sidebar content', () => {
    const { container } = render(
      <SidebarNavigation.Collapse collapsed>
        <SidebarNavigation.SubItems>
          <SidebarNavigation.Empty>No projects</SidebarNavigation.Empty>
        </SidebarNavigation.SubItems>
      </SidebarNavigation.Collapse>
    );

    expect(container.firstChild).toHaveClass('sidebar-navigation__collapse--collapsed');
    expect(screen.getByText('No projects')).not.toBeVisible();
  });
});
