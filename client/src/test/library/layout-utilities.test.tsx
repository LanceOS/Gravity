import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef, type ReactElement, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  AspectRatio,
  ClickAwayListener,
  Container,
  Divider,
  Flex,
  FocusTrap,
  Grid,
  Masonry,
  Portal,
  Select,
  SplitPane,
  Stack,
  VisuallyHidden,
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

function FocusTrapHarness() {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button type="button">Previous focus</button>
      <button type="button" onClick={() => setOpen(true)}>
        Open trap
      </button>
      {open && (
        <FocusTrap>
          <div>
            <button type="button">First action</button>
            <button type="button" onClick={() => setOpen(false)}>
              Close trap
            </button>
          </div>
        </FocusTrap>
      )}
    </div>
  );
}

function SelectHarness() {
  const [value, setValue] = useState('todo');

  return (
    <div>
      <div role="dialog" aria-label="Other dialog">
        <button type="button">Inside other dialog</button>
      </div>
      <Select
        label="Status"
        value={value}
        onValueChange={setValue}
        options={[
          { value: 'todo', label: 'Todo' },
          { value: 'done', label: 'Done' },
        ]}
      />
    </div>
  );
}

describe('library layout and utilities', () => {
  it('renders layout primitives and a portal target', () => {
    const { container } = render(
      <div>
        <Container>
          <Stack gap="12px">
            <span>Stack item</span>
            <Flex direction="column">
              <span>Flex item</span>
            </Flex>
          </Stack>
        </Container>
        <Grid columns={2}>
          <span>Grid A</span>
          <span>Grid B</span>
        </Grid>
        <Divider data-testid="divider" />
        <AspectRatio ratio={16 / 9}>
          <div>Aspect content</div>
        </AspectRatio>
        <Masonry columns={2}>
          {[<div key="one">Card one</div>, <div key="two">Card two</div>, <div key="three">Card three</div>]}
        </Masonry>
        <Portal>
          <div>Portal content</div>
        </Portal>
        <VisuallyHidden>Hidden label</VisuallyHidden>
      </div>
    );

    expect(screen.getByText('Stack item')).toBeInTheDocument();
    expect(screen.getByText('Flex item')).toBeInTheDocument();
    expect(screen.getByText('Grid A')).toBeInTheDocument();
    expect(screen.getByTestId('divider')).toBeInTheDocument();
    expect(screen.getByText('Aspect content')).toBeInTheDocument();
    expect(screen.getByText('Card three')).toBeInTheDocument();
    expect(screen.getByText('Portal content')).toBeInTheDocument();
    expect(screen.getByText('Hidden label')).toBeInTheDocument();
    expect(container.querySelector('.lib-container')).toBeTruthy();
  });

  it('resizes split panes when the resizer is dragged', () => {
    const { container } = render(<SplitPane left={<div>Left pane</div>} right={<div>Right pane</div>} initialWidth={240} />);

    const leftPane = screen.getByText('Left pane').parentElement;
    const resizer = container.querySelector('.lib-split-pane-resizer');

    expect(leftPane).not.toBeNull();
    expect(resizer).not.toBeNull();

    fireEvent.mouseDown(resizer!, { clientX: 240 });
    fireEvent.mouseMove(document, { clientX: 320 });
    fireEvent.mouseUp(document);

    expect(leftPane).toHaveStyle({ width: '320px' });
  });

  it('fires click-away callbacks and traps focus while active', async () => {
    const user = userEvent.setup();
    const onClickAway = vi.fn();
    const listenerRef = createRef<HTMLDivElement>();
    const clickAwayChild: ReactElement = (
      <div data-testid="click-away-root">
        <button type="button">Inside target</button>
      </div>
    );

    render(
      <div>
        <button type="button">Outside target</button>
        <div role="dialog" aria-label="Other dialog">
          <button type="button">Inside other dialog</button>
        </div>
        <ClickAwayListener ref={listenerRef} onClickAway={onClickAway}>
          {clickAwayChild}
        </ClickAwayListener>
        <FocusTrapHarness />
      </div>
    );

    expect(listenerRef.current).toBe(screen.getByTestId('click-away-root'));

    await user.click(screen.getByRole('button', { name: 'Inside target' }));
    expect(onClickAway).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Inside other dialog' }));
    expect(onClickAway).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Outside target' }));
    expect(onClickAway).toHaveBeenCalledTimes(2);

    await user.click(screen.getByRole('button', { name: 'Open trap' }));
    expect(screen.getByRole('button', { name: 'First action' })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole('button', { name: 'Close trap' })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole('button', { name: 'First action' })).toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'Close trap' }));
    expect(screen.getByRole('button', { name: 'Open trap' })).toHaveFocus();
  });

  it('closes a select dropdown when clicking elsewhere in the page, even inside another dialog', async () => {
    const user = userEvent.setup();

    render(<SelectHarness />);

    await user.click(screen.getByRole('button', { name: 'Status' }));
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Inside other dialog' }));
    await waitFor(() => {
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });
  });

  it('keeps the select menu 4px from the trigger when it opens above', async () => {
    const user = userEvent.setup();
    const originalInnerWidth = window.innerWidth;
    const originalInnerHeight = window.innerHeight;
    const triggerRect = createRect(120, 20, 200, 40);
    const menuRect = createRect(0, 0, 180, 200);
    let triggerElement: HTMLButtonElement | null = null;

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

      if (this.getAttribute('role') === 'listbox') {
        return menuRect;
      }

      return createRect(0, 0, 0, 0);
    });

    try {
      render(<SelectHarness />);

      triggerElement = screen.getByRole('button', { name: 'Status' }) as HTMLButtonElement;
      await user.click(triggerElement);

      const listbox = screen.getByRole('listbox');
      await waitFor(() => {
        expect(listbox).toHaveStyle({ top: '8px', maxHeight: '108px' });
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
