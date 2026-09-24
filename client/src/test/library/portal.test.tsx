import React, { StrictMode, useEffect } from 'react';
import { act, render, screen, within } from '@testing-library/react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { Portal } from '@library/utilities/portal/Portal';
import { Modal } from '@library/components/modal/Modal';
import { Drawer } from '@library/components/drawer/Drawer';
import { Popover } from '@library/components/popover/Popover';

describe('Portal lifecycle', () => {
  it('moves between custom containers and body, cleans children on unmount, and preserves host content', () => {
    const first = document.createElement('section');
    const second = document.createElement('section');
    first.innerHTML = '<span>Host content</span>';
    document.body.append(first, second);
    const cleanup = vi.fn();
    function Content() {
      useEffect(() => cleanup, []);
      return <button>Portal action</button>;
    }
    const view = (container?: HTMLElement) => <StrictMode><Portal container={container}><Content /></Portal></StrictMode>;
    try {
      const { rerender, unmount, container: root } = render(view(first));
      expect(within(first).getByRole('button')).toBeInTheDocument();
      expect(root).toBeEmptyDOMElement();
      cleanup.mockClear();
      rerender(view(second));
      expect(within(first).queryByRole('button')).toBeNull();
      expect(within(second).getByRole('button')).toBeInTheDocument();
      expect(cleanup).toHaveBeenCalled();
      rerender(view());
      expect(second).toBeEmptyDOMElement();
      expect(screen.getByRole('button').parentElement).toBe(document.body);
      rerender(view(first));
      expect(screen.getAllByRole('button')).toHaveLength(1);
      cleanup.mockClear();
      unmount();
      expect(cleanup).toHaveBeenCalledTimes(1);
      expect(first.innerHTML).toBe('<span>Host content</span>');
      expect(second).toBeEmptyDOMElement();
      expect(screen.queryByRole('button')).toBeNull();
    } finally {
      first.remove();
      second.remove();
    }
  });

  it('does not create children when unmounted before passive effects select the host', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const { createRoot } = await import('react-dom/client');
    const root = createRoot(host);
    await act(async () => {
      root.render(<Portal><button>Never mounted</button></Portal>);
      root.unmount();
    });
    expect(screen.queryByRole('button')).toBeNull();
    host.remove();
  });

  it('renders portals and open overlay consumers on the server without reading document', () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'document')!;
    const custom = document.createElement('div');
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      get() { throw new Error('document accessed during server render'); },
    });
    try {
      expect(renderToString(<Portal><span>Body portal</span></Portal>)).toBe('');
      expect(renderToString(<Portal container={custom}><span>Custom portal</span></Portal>)).toBe('');
      expect(renderToString(<Modal isOpen onClose={() => {}}>Modal body</Modal>)).toBe('');
      expect(renderToString(<Drawer isOpen onClose={() => {}}>Drawer body</Drawer>)).toBe('');
      const markup = renderToString(<Popover isOpen trigger={<button>Trigger</button>}>Popover body</Popover>);
      expect(markup).toContain('Trigger');
      expect(markup).not.toContain('Popover body');
    } finally {
      Object.defineProperty(globalThis, 'document', descriptor);
    }
  });

  it.each(['modal', 'drawer', 'popover'])('hydrates an initially open %s consumer', async (name) => {
    const host = document.createElement('main');
    document.body.append(host);
    const onClose = () => {};
    const content = name === 'modal' ? <Modal isOpen onClose={onClose}>Hydrated overlay</Modal>
      : name === 'drawer' ? <Drawer isOpen onClose={onClose}>Hydrated overlay</Drawer>
      : <Popover isOpen trigger={<button>Trigger</button>}>Hydrated overlay</Popover>;
    const view = <StrictMode>{content}</StrictMode>;
    const recoverable = vi.fn();
    const consoleError = vi.spyOn(console, 'error');
    let root: ReturnType<typeof hydrateRoot> | undefined;
    try {
      host.innerHTML = renderToString(view);
      expect(host.textContent).not.toContain('Hydrated overlay');
      await act(async () => { root = hydrateRoot(host, view, { onRecoverableError: recoverable }); });
      expect(screen.getByRole('dialog')).toHaveTextContent('Hydrated overlay');
      expect(host.querySelector('[role="dialog"]')).toBeNull();
      await act(async () => root!.unmount());
      root = undefined;
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(document.body.style.overflow).toBe('');
      expect(recoverable).not.toHaveBeenCalled();
      expect(consoleError).not.toHaveBeenCalled();
    } finally {
      if (root) await act(async () => root!.unmount());
      consoleError.mockRestore();
      host.remove();
    }
  });

  it.each([false, true])('hydrates without a mismatch (custom container: %s), then moves and unmounts', async (custom) => {
    const host = document.createElement('main');
    const target = document.createElement('aside');
    document.body.append(host, target);
    const recoverable = vi.fn();
    const consoleError = vi.spyOn(console, 'error');
    const view = (container?: HTMLElement) => <StrictMode><div>Server shell</div><Portal container={container}><button>Hydrated action</button></Portal></StrictMode>;
    const container = custom ? target : undefined;
    host.innerHTML = renderToString(view(container));
    expect(host.textContent).toBe('Server shell');
    let root: ReturnType<typeof hydrateRoot> | undefined;
    try {
      await act(async () => { root = hydrateRoot(host, view(container), { onRecoverableError: recoverable }); });
      expect(screen.getByRole('button').parentElement).toBe(custom ? target : document.body);
      await act(async () => { root!.render(view(custom ? undefined : target)); });
      expect(screen.getAllByRole('button')).toHaveLength(1);
      expect(screen.getByRole('button').parentElement).toBe(custom ? document.body : target);
      await act(async () => root!.unmount());
      root = undefined;
      expect(screen.queryByRole('button')).toBeNull();
      expect(recoverable).not.toHaveBeenCalled();
      expect(consoleError).not.toHaveBeenCalled();
    } finally {
      if (root) await act(async () => root!.unmount());
      consoleError.mockRestore();
      host.remove();
      target.remove();
    }
  });
});
