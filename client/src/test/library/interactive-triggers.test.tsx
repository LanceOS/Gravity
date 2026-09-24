import React, { createRef, useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button, ContextMenu, DropdownMenu, MegaMenu, Popconfirm, Popover } from '@library';

const disclosures = [
  ['DropdownMenu', (trigger: React.ReactElement, triggerAsChild = false) => <DropdownMenu triggerAsChild={triggerAsChild} trigger={trigger}><button>Action</button></DropdownMenu>],
  ['MegaMenu', (trigger: React.ReactElement, triggerAsChild = false) => <MegaMenu triggerAsChild={triggerAsChild} trigger={trigger} columns={[{ title: 'Links', links: [{ label: 'Action', href: '#action' }] }]} />],
  ['Popover', (trigger: React.ReactElement, triggerAsChild = false) => <Popover triggerAsChild={triggerAsChild} trigger={trigger}><button>Action</button></Popover>],
  ['Popconfirm', (trigger: React.ReactElement, triggerAsChild = false) => <Popconfirm triggerAsChild={triggerAsChild} title="Action" onConfirm={() => {}}>{trigger}</Popconfirm>],
] as const;

describe.each(disclosures)('%s trigger accessibility', (_name, disclosure) => {
  it('gives non-interactive content native keyboard activation and exposes expanded state', async () => {
    const user = userEvent.setup();
    render(disclosure(<span>Open</span>));
    const trigger = screen.getByRole('button', { name: 'Open' });
    expect(trigger.tagName).toBe('BUTTON');
    expect(trigger).toHaveAttribute('type', 'button');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await user.tab();
    expect(trigger).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(document.getElementById(trigger.getAttribute('aria-controls')!)).toContainElement(screen.getByText('Action'));
    trigger.focus();
    await user.keyboard(' ');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await waitFor(() => expect(screen.queryByText('Action')).not.toBeInTheDocument());
    await user.keyboard(' ');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await user.tab();
    expect(trigger).not.toHaveFocus();
    await user.keyboard('{Escape}');
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('composes button handlers, refs and styles without nesting buttons or submitting a form', async () => {
    const user = userEvent.setup();
    const ref = createRef<HTMLButtonElement>();
    const onClick = vi.fn((event: React.MouseEvent) => event.stopPropagation());
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());
    const { container } = render(<form onSubmit={onSubmit}>{disclosure(
      <button ref={ref} className="custom-trigger" style={{ color: 'red' }} onClick={onClick}>Open</button>,
    )}</form>);
    const trigger = screen.getByRole('button', { name: 'Open' });
    expect(ref.current).toBe(trigger);
    expect(trigger).toHaveClass('custom-trigger', 'lib-focus-ring');
    expect(trigger).toHaveStyle({ color: 'rgb(255, 0, 0)' });
    expect(container.querySelector('button button')).toBeNull();
    await user.click(trigger);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('supports library buttons and honors disabled, loading and cancelled activation', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn((event: React.MouseEvent) => event.preventDefault());
    const { rerender } = render(disclosure(<Button onClick={onClick}>Open</Button>));
    await user.click(screen.getByRole('button', { name: 'Open' }));
    expect(onClick).toHaveBeenCalledOnce();
    expect(screen.queryByText('Action')).not.toBeInTheDocument();
    for (const props of [{ disabled: true }, { loading: true }, { 'aria-disabled': true }]) {
      rerender(disclosure(<Button {...props}>Open</Button>));
      await user.click(screen.getByRole('button', { name: 'Open' }));
      expect(screen.queryByText('Action')).not.toBeInTheDocument();
    }
    rerender(disclosure(<Button>Open</Button>));
    await user.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByText('Action')).toBeInTheDocument();
  });

  it('wraps custom visual content and explicitly composes custom buttons', async () => {
    const user = userEvent.setup();
    const Label = () => <span>Open</span>;
    const { rerender } = render(disclosure(<Label />));
    await user.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByText('Action')).toBeInTheDocument();
    const CustomButton = (props: React.ComponentProps<'button'>) => <button {...props} />;
    rerender(disclosure(<CustomButton>Open</CustomButton>, true));
    const trigger = screen.getByRole('button', { name: 'Open' });
    expect(trigger.querySelector('button')).toBeNull();
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('dismisses on outside interaction', async () => {
    const user = userEvent.setup();
    render(<>{disclosure(<button>Open</button>)}<button>Outside</button></>);
    await user.click(screen.getByRole('button', { name: 'Open' }));
    await user.click(screen.getByRole('button', { name: 'Outside' }));
    expect(screen.getByRole('button', { name: 'Open' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: 'Outside' })).toHaveFocus();
  });
});

it('keeps controlled popovers open during content interaction and returns focus on Escape', async () => {
  const user = userEvent.setup();
  function Harness() {
    const [open, setOpen] = useState(false);
    return <Popover trigger={<Button>Open</Button>} isOpen={open} onOpenChange={setOpen}><button>Action</button></Popover>;
  }
  render(<Harness />);
  await user.click(screen.getByRole('button', { name: 'Open' }));
  expect(screen.getByRole('button', { name: 'Open' })).toHaveAttribute('aria-haspopup', 'dialog');
  expect(screen.getByRole('dialog')).toHaveFocus();
  await user.click(screen.getByRole('button', { name: 'Action' }));
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Open' })).toHaveFocus();
});

it('lets popover content consume Escape before dismissing and stops a handled Escape at the disclosure', async () => {
  const user = userEvent.setup();
  const parentEscape = vi.fn();
  const onOpenChange = vi.fn();
  function Harness() {
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState(true);
    return <div onKeyDown={event => { if (event.key === 'Escape') parentEscape(); }}>
      <Popover trigger={<button>Open editor</button>} isOpen={open}
        onOpenChange={next => { onOpenChange(next); setOpen(next); }}>
        <input aria-label="Draft" onKeyDown={event => {
          if (event.key === 'Escape' && editing) {
            event.preventDefault();
            setEditing(false);
          }
        }} />
      </Popover>
    </div>;
  }
  render(<Harness />);
  const trigger = screen.getByRole('button', { name: 'Open editor' });
  await user.click(trigger);
  await user.click(screen.getByRole('textbox', { name: 'Draft' }));
  onOpenChange.mockClear();
  await user.keyboard('{Escape}');
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: 'Draft' })).toHaveFocus();
  expect(onOpenChange).not.toHaveBeenCalled();
  // A child may prevent dismissal without stopping the event from bubbling.
  expect(parentEscape).toHaveBeenCalledOnce();
  parentEscape.mockClear();
  await user.keyboard('{Escape}');
  expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
  expect(parentEscape).not.toHaveBeenCalled();
  await user.keyboard('{Escape}');
  expect(parentEscape).toHaveBeenCalledOnce();
  expect(onOpenChange).toHaveBeenCalledOnce();
});

describe('ContextMenu keyboard triggers', () => {
  it.each(['{Shift>}{F10}{/Shift}', '{ContextMenu}'])('opens with %s at the target and returns focus on Escape', async (key) => {
    const user = userEvent.setup();
    render(<ContextMenu items={[{ label: 'Action' }]}><div>Target</div></ContextMenu>);
    const target = screen.getByText('Target');
    vi.spyOn(target, 'getBoundingClientRect').mockReturnValue({ left: 70, bottom: 90, width: 80, height: 30 } as DOMRect);
    await user.tab();
    expect(target).toHaveFocus();
    await user.keyboard(key);
    const menu = screen.getByRole('menu');
    expect(menu).toHaveStyle({ left: '70px', top: '90px' });
    expect(target).toHaveAttribute('aria-controls', menu.id);
    expect(screen.getByRole('menuitem', { name: 'Action' })).toHaveFocus();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    expect(target).toHaveFocus();
  });

  it('preserves target refs, click behavior and keyboard cancellation', async () => {
    const user = userEvent.setup();
    const ref = createRef<HTMLButtonElement>();
    const onClick = vi.fn();
    render(<ContextMenu items={[{ label: 'Action' }]}>
      <button ref={ref} onClick={onClick} onKeyDown={(event) => event.preventDefault()}>Target</button>
    </ContextMenu>);
    const target = screen.getByRole('button', { name: 'Target' });
    expect(ref.current).toBe(target);
    await user.click(target);
    expect(onClick).toHaveBeenCalledOnce();
    fireEvent.keyDown(target, { key: 'F10', shiftKey: true });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});

it('preserves autofocus in popover search fields', async () => {
  const user = userEvent.setup();
  render(<Popover trigger={<button>Search labels</button>}><input autoFocus aria-label="Search" /></Popover>);
  await user.click(screen.getByRole('button', { name: 'Search labels' }));
  expect(screen.getByRole('textbox', { name: 'Search' })).toHaveFocus();
  await user.keyboard('bug');
  expect(screen.getByRole('textbox')).toHaveValue('bug');
});

it('keeps button popup metadata when composing a dropdown trigger', () => {
  render(<DropdownMenu trigger={<button aria-haspopup="menu">Actions</button>}><div role="menu" /></DropdownMenu>);
  expect(screen.getByRole('button', { name: 'Actions' })).toHaveAttribute('aria-haspopup', 'menu');
});

it('names a focused popover from its trigger without replacing an existing button id', async () => {
  const user = userEvent.setup();
  render(<Popover trigger={<button id="existing-trigger" aria-label="Open filters"><span aria-hidden="true">+</span></button>}><button>Apply</button></Popover>);
  await user.click(screen.getByRole('button', { name: 'Open filters' }));
  expect(screen.getByRole('dialog', { name: 'Open filters' })).toHaveFocus();
  expect(screen.getByRole('button', { name: 'Open filters' })).toHaveAttribute('id', 'existing-trigger');
});

it('gives each popover its own label reference without duplicating visual content ids', async () => {
  const user = userEvent.setup();
  render(<>
    <Popover trigger={<span id="visual-label">First filters</span>}>First content</Popover>
    <Popover trigger={<Button>Second filters</Button>}>Second content</Popover>
  </>);
  const first = screen.getByRole('button', { name: 'First filters' });
  const second = screen.getByRole('button', { name: 'Second filters' });
  expect(first.id).not.toBe(second.id);
  expect(document.querySelectorAll('#visual-label')).toHaveLength(1);
  await user.click(first);
  expect(screen.getByRole('dialog', { name: 'First filters' })).toHaveAttribute('aria-labelledby', first.id);
  await user.click(second);
  expect(screen.getByRole('dialog', { name: 'Second filters' })).toHaveAttribute('aria-labelledby', second.id);
});
