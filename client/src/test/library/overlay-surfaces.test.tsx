import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AIChatWindow, Drawer, Modal } from '@library';

describe.each([['Modal', Modal], ['Drawer', Drawer]] as const)('%s focus lifecycle', (_name, Overlay) => {
  it('wraps focus in both directions and restores the opener after the close action', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    function Harness() {
      const [open, setOpen] = useState(false);
      return <>
        <button onClick={() => setOpen(true)}>Open overlay</button>
        <Overlay isOpen={open} onClose={() => { onClose(); setOpen(false); }}>
          <button>Last action</button>
        </Overlay>
      </>;
    }
    render(<Harness />, { wrapper: StrictMode });
    const opener = screen.getByRole('button', { name: 'Open overlay' });
    await user.click(opener);
    const close = within(screen.getByRole('dialog')).getByRole('button', { name: /^Close / });
    expect(close).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Last action' })).toHaveFocus();
    await user.tab();
    expect(close).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
    expect(document.body.style.overflow).toBe('');
  });

  it('restores focus when an open overlay is removed by its parent', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const view = (mounted: boolean) => <StrictMode>
      <button>Opener</button>
      {mounted && <Overlay isOpen onClose={onClose}><button>Action</button></Overlay>}
      <button>Next action</button>
    </StrictMode>;
    const { rerender } = render(view(false));
    const opener = screen.getByRole('button', { name: 'Opener' });
    await user.click(opener);
    rerender(view(true));
    expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement);
    rerender(view(false));
    expect(opener).toHaveFocus();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(document.body.style.overflow).toBe('');
    await user.tab();
    expect(screen.getByRole('button', { name: 'Next action' })).toHaveFocus();
  });
});

describe('library overlay surfaces', () => {
  it('names each drawer from its own visible title', () => {
    render(<>
      <Drawer isOpen onClose={() => {}} title="Activity log">First drawer</Drawer>
      <Drawer isOpen onClose={() => {}} title="Details">Second drawer</Drawer>
    </>);

    const activity = screen.getByRole('dialog', { name: 'Activity log' });
    const details = screen.getByRole('dialog', { name: 'Details' });
    expect(activity.getAttribute('aria-labelledby')).not.toBe(details.getAttribute('aria-labelledby'));
  });

  it('uses overlay theme tokens for modal, drawer, and AI chat surfaces', () => {
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    });

    render(
      <div>
        <Modal isOpen onClose={() => {}} title="Release notes">
          Modal body
        </Modal>
        <Drawer isOpen onClose={() => {}} title="Activity log">
          Drawer body
        </Drawer>
        <AIChatWindow title="AI Surface" messages={[]} onSendMessage={() => {}} />
      </div>,
    );

    const modalSurface = screen.getByText('Modal body').closest('[role="dialog"]');
    const drawerSurface = screen.getByText('Drawer body').closest('[role="dialog"]');
    const chatInput = screen.getByPlaceholderText('Ask AI a question...');
    const chatSurface = chatInput.closest('form')?.parentElement?.parentElement;

    expect(modalSurface?.parentElement?.getAttribute('style')).toContain('background-color: var(--color-overlay-scrim)');
    expect(modalSurface?.getAttribute('style')).toContain('background-color: var(--surface-glass-strong)');

    expect(drawerSurface?.parentElement?.getAttribute('style')).toContain('background-color: var(--color-overlay-scrim)');
    expect(drawerSurface?.getAttribute('style')).toContain('background-color: var(--surface-glass-strong)');

    expect(chatSurface?.getAttribute('style')).toContain('background: var(--surface-glass-strong)');
  });
});
