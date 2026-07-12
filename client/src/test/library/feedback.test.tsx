import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef, type ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  Alert,
  CircularSpinner,
  Drawer,
  EmptyState,
  Modal,
  NotificationCenter,
  Popconfirm,
  Popover,
  ProgressBar,
  Result,
  Skeleton,
  Tooltip,
  toast,
} from '@library';

function createRect(top: number, left: number, width: number, height: number): DOMRect {
  return {
    top,
    left,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

describe('library feedback components', () => {
  it('renders modal, drawer, and static feedback surfaces', () => {
    const onModalClose = vi.fn();
    const onDrawerClose = vi.fn();

    const { rerender } = render(
      <div>
        <Modal isOpen onClose={onModalClose} title="Release notes" footer={<button type="button">Acknowledge</button>}>
          Modal body
        </Modal>
        <Drawer isOpen onClose={onDrawerClose} title="Activity log">
          Drawer body
        </Drawer>
        <Alert type="warning" title="Heads up">
          Something needs review.
        </Alert>
        <EmptyState title="Nothing here" description="Create a record to begin." action={<button type="button">Create</button>} />
        <Result status="success" title="Completed" subTitle="Phase 3 is green." extra={<button type="button">Continue</button>} />
        <ProgressBar value={32} max={40} label="Coverage" />
        <CircularSpinner size={24} />
        <Skeleton variant="text" width={120} />
      </div>
    );

    expect(screen.getAllByRole('dialog')).toHaveLength(2);
    expect(screen.getByText('Modal body')).toBeInTheDocument();
    expect(screen.getByText('Drawer body')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Something needs review.');
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByText('80%')).toBeInTheDocument();
    expect(document.body.style.overflow).toBe('hidden');
    expect(document.querySelector('svg')).toBeTruthy();
    expect(screen.getByRole('progressbar')).toHaveAttribute('value', '32');
    expect(screen.getByLabelText('Close dialog')).toBeInTheDocument();
    expect(screen.getByLabelText('Close sidebar')).toBeInTheDocument();

    rerender(
      <div>
        <Modal isOpen={false} onClose={onModalClose} title="Release notes">
          Modal body
        </Modal>
        <Drawer isOpen={false} onClose={onDrawerClose} title="Activity log">
          Drawer body
        </Drawer>
      </div>
    );

    expect(document.body.style.overflow).toBe('');
  });

  it('invokes modal and drawer close handlers', async () => {
    const user = userEvent.setup();
    const onModalClose = vi.fn();
    const onDrawerClose = vi.fn();

    const { rerender } = render(
      <Modal isOpen onClose={onModalClose} title="Release notes">
        Modal body
      </Modal>
    );

    await user.click(screen.getByLabelText('Close dialog'));
    expect(onModalClose).toHaveBeenCalledTimes(1);

    fireEvent.mouseDown(document.body);
    expect(onModalClose).toHaveBeenCalledTimes(2);

    rerender(
      <Drawer isOpen onClose={onDrawerClose} title="Activity log">
        Drawer body
      </Drawer>
    );

    await user.click(screen.getByLabelText('Close sidebar'));
    expect(onDrawerClose).toHaveBeenCalledTimes(1);

    fireEvent.mouseDown(document.body);
    expect(onDrawerClose).toHaveBeenCalledTimes(2);
  });

  it('renders toast notifications and dismisses them after the timeout', async () => {
    vi.useFakeTimers();

    try {
      render(<NotificationCenter />);

      act(() => {
        toast.show('Saved successfully', 'success');
      });

      expect(screen.getByText('Saved successfully')).toBeInTheDocument();

      await act(async () => {
        vi.advanceTimersByTime(4000);
        await Promise.resolve();
      });

      expect(screen.queryByText('Saved successfully')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('handles confirm, tooltip, and popover interactions', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const popconfirmRef = createRef<HTMLDivElement>();
    const popconfirmChild: ReactElement = <button type="button">Delete</button>;

    render(
      <div>
        <Popconfirm ref={popconfirmRef} title="Delete item?" onConfirm={onConfirm}>
          {popconfirmChild}
        </Popconfirm>
        <Tooltip content="Helpful tip">
          <button type="button">Help</button>
        </Tooltip>
        <Popover trigger={<button type="button">Open popover</button>}>
          <span>Popover body</span>
        </Popover>
      </div>
    );

    expect(popconfirmRef.current).toBeInstanceOf(HTMLDivElement);

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getByText('Delete item?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Yes' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);

    await user.hover(screen.getByRole('button', { name: 'Help' }));
    expect(screen.getByRole('tooltip')).toHaveTextContent('Helpful tip');
    await user.unhover(screen.getByRole('button', { name: 'Help' }));
    await waitFor(() => {
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Open popover' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Popover body');

    fireEvent.mouseDown(document.body);
    const dialog = screen.queryByRole('dialog');
    if (dialog) {
      fireEvent.animationEnd(dialog);
    }
    await waitFor(() => {
      expect(screen.queryByText('Popover body')).not.toBeInTheDocument();
    });
  });

  it('keeps the popover at least 4px from the trigger when it opens above', async () => {
    const user = userEvent.setup();
    const originalInnerWidth = window.innerWidth;
    const originalInnerHeight = window.innerHeight;
    const triggerRect = createRect(120, 40, 200, 40);
    const popoverRect = createRect(0, 0, 220, 200);
    let triggerElement: HTMLDivElement | null = null;

    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 500,
    });

    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 260,
    });

    const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this === triggerElement) {
        return triggerRect;
      }

      if (this.getAttribute('role') === 'dialog') {
        return popoverRect;
      }

      return createRect(0, 0, 0, 0);
    });

    try {
      render(
        <Popover trigger={<button type="button">Open popover</button>}>
          <span>Popover body</span>
        </Popover>
      );

      triggerElement = screen.getByRole('button', { name: 'Open popover' }).parentElement as HTMLDivElement;
      await user.click(screen.getByRole('button', { name: 'Open popover' }));

      const dialog = screen.getByRole('dialog');
      await waitFor(() => {
        expect(dialog).toHaveStyle({ top: '16px', maxHeight: '100px' });
      });
    } finally {
      rectSpy.mockRestore();
      Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        value: originalInnerWidth,
      });
      Object.defineProperty(window, 'innerHeight', {
        configurable: true,
        value: originalInnerHeight,
      });
    }
  });
});
