import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
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
  SplitPane,
  Stack,
  VisuallyHidden,
} from '@library';

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

    render(
      <div>
        <button type="button">Outside target</button>
        <ClickAwayListener onClickAway={onClickAway}>
          <div>
            <button type="button">Inside target</button>
          </div>
        </ClickAwayListener>
        <FocusTrapHarness />
      </div>
    );

    await user.click(screen.getByRole('button', { name: 'Inside target' }));
    expect(onClickAway).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Outside target' }));
    expect(onClickAway).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Open trap' }));
    expect(screen.getByRole('button', { name: 'First action' })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole('button', { name: 'Close trap' })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole('button', { name: 'First action' })).toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'Close trap' }));
    expect(screen.getByRole('button', { name: 'Open trap' })).toHaveFocus();
  });
});