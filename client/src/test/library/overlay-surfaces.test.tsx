import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AIChatWindow, Drawer, Modal } from '@library';

describe('library overlay surfaces', () => {
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
    expect(modalSurface?.getAttribute('style')).toContain('background-color: var(--color-surface-overlay)');

    expect(drawerSurface?.parentElement?.getAttribute('style')).toContain('background-color: var(--color-overlay-scrim)');
    expect(drawerSurface?.getAttribute('style')).toContain('background-color: var(--color-surface-overlay)');

    expect(chatSurface?.getAttribute('style')).toContain('background: var(--color-surface-elevated)');
  });
});