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
    expect(screen.getByRole('button', { name: /Gravity/i })).toHaveAttribute('title', 'Gravity');
  });

  it('does not infer page semantics from visual active state', () => {
    const { rerender } = render(
      <SidebarNavigation.Item active>Gravity</SidebarNavigation.Item>
    );

    expect(screen.getByRole('button', { name: 'Gravity' })).not.toHaveAttribute('aria-current');

    rerender(
      <SidebarNavigation.Item active aria-current="page">Gravity</SidebarNavigation.Item>
    );

    expect(screen.getByRole('button', { name: 'Gravity' })).toHaveAttribute('aria-current', 'page');
  });

  it('collapses nested sidebar content', () => {
    const { container, rerender } = render(
      <SidebarNavigation.Collapse collapsed>
        <SidebarNavigation.SubItems>
          <SidebarNavigation.Empty>No projects</SidebarNavigation.Empty>
        </SidebarNavigation.SubItems>
      </SidebarNavigation.Collapse>
    );

    expect(container.firstChild).toHaveClass('sidebar-navigation__collapse--collapsed');
    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText('No projects')).not.toBeVisible();

    rerender(
      <SidebarNavigation.Collapse collapsed={false}>
        <SidebarNavigation.SubItems>
          <SidebarNavigation.Empty>No projects</SidebarNavigation.Empty>
        </SidebarNavigation.SubItems>
      </SidebarNavigation.Collapse>
    );

    expect(container.firstChild).not.toHaveClass('sidebar-navigation__collapse--collapsed');
    expect(container.firstChild).toHaveAttribute('aria-hidden', 'false');
    expect(screen.getByText('No projects')).toBeVisible();

    rerender(
      <SidebarNavigation.Collapse collapsed>
        <SidebarNavigation.SubItems>
          <SidebarNavigation.Empty>No projects</SidebarNavigation.Empty>
        </SidebarNavigation.SubItems>
      </SidebarNavigation.Collapse>
    );

    expect(container.firstChild).toHaveClass('sidebar-navigation__collapse--collapsed');
    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true');
  });
});
