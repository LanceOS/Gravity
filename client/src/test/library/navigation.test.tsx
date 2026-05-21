import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import {
  Affix,
  Breadcrumbs,
  ContextMenu,
  DropdownMenu,
  Link,
  MegaMenu,
  Navbar,
  Pagination,
  Scrollspy,
  Sidebar,
  Stepper,
  Tabs,
} from '@library';
import { describe, expect, it } from 'vitest';

function NavigationHarness() {
  const [page, setPage] = useState(1);
  const [contextAction, setContextAction] = useState('none');

  return (
    <div>
      <Link href="/docs">Docs</Link>
      <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Workspace', href: '/workspace' }, { label: 'Settings' }]} />

      <Pagination current={page} total={3} onChange={setPage} />
      <div>Page value: {page}</div>

      <Navbar brand="Gravity" actions={<button type="button">Invite</button>}>
        <Link href="/projects">Projects</Link>
      </Navbar>

      <Sidebar>
        <span>Inbox</span>
      </Sidebar>

      <MegaMenu
        trigger={<button type="button">Open mega menu</button>}
        columns={[
          {
            title: 'Product',
            links: [
              { label: 'Roadmap', href: '/roadmap' },
              { label: 'Releases', href: '/releases' },
            ],
          },
        ]}
      />

      <ContextMenu items={[{ label: 'Rename', onClick: () => setContextAction('rename') }]}> 
        <div>Context target</div>
      </ContextMenu>
      <div>Context value: {contextAction}</div>

      <DropdownMenu trigger={<button type="button">Open dropdown</button>}>
        <button type="button">Archive</button>
      </DropdownMenu>

      <Tabs
        items={[
          { id: 'overview', label: 'Overview', content: <div>Overview panel</div> },
          { id: 'members', label: 'Members', content: <div>Members panel</div> },
        ]}
      />

      <Stepper steps={['Draft', 'Review', 'Done']} activeStep={1} />

      <div data-testid="scrollspy-host">
        <Scrollspy targets={['section-a', 'section-b']}>
          <section id="section-a">Alpha section</section>
          <section id="section-b">Beta section</section>
        </Scrollspy>
      </div>

      <Affix offsetTop={12}>
        <div>Sticky content</div>
      </Affix>
    </div>
  );
}

describe('library navigation components', () => {
  it('renders the structural navigation primitives', () => {
    render(<NavigationHarness />);

    expect(screen.getByRole('link', { name: 'Docs' })).toHaveAttribute('href', '/docs');
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument();
    expect(screen.getByText('Gravity')).toBeInTheDocument();
    expect(screen.getByText('Inbox')).toBeInTheDocument();
    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.getByText('Review')).toBeInTheDocument();
    expect(screen.getByText('Sticky content').parentElement).toHaveStyle({ position: 'sticky', top: '12px' });
  });

  it('handles pagination, menus, tabs, context menus, and scrollspy updates', async () => {
    const user = userEvent.setup();

    render(<NavigationHarness />);

    await user.click(screen.getByRole('button', { name: '2' }));
    expect(screen.getByText('Page value: 2')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Page value: 3')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Open mega menu' }));
    expect(screen.getByRole('link', { name: 'Roadmap' })).toHaveAttribute('href', '/roadmap');

    fireEvent.contextMenu(screen.getByText('Context target'), { clientX: 80, clientY: 120 });
    expect(screen.getByText('Rename')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Rename'));
    expect(screen.getByText('Context value: rename')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Open dropdown' }));
    expect(screen.getByRole('button', { name: 'Archive' })).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Members' }));
    expect(screen.getByText('Members panel')).toBeInTheDocument();
    expect(screen.queryByText('Overview panel')).not.toBeInTheDocument();

    const sectionA = document.getElementById('section-a');
    const sectionB = document.getElementById('section-b');

    Object.defineProperty(sectionA!, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ x: 0, y: 0, width: 100, height: 40, top: 200, left: 0, right: 100, bottom: 240, toJSON: () => ({}) }),
    });
    Object.defineProperty(sectionB!, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ x: 0, y: 0, width: 100, height: 40, top: 80, left: 0, right: 100, bottom: 120, toJSON: () => ({}) }),
    });

    fireEvent.scroll(window);

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'section-b' })).toHaveStyle({ fontWeight: '500' });
    });

    const scrollspyHost = screen.getByTestId('scrollspy-host');
    expect(within(scrollspyHost).getByText('Alpha section')).toBeInTheDocument();
    expect(within(scrollspyHost).getByText('Beta section')).toBeInTheDocument();
  });
});