import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React, { useState } from 'react';
import { ContextMenu } from '@library';
import { describe, expect, it } from 'vitest';

function DeclarativeContextMenuHarness() {
  const [status, setStatus] = useState('none');
  const [priority, setPriority] = useState('none');

  return (
    <div>
      <ContextMenu.Root
        content={
          <>
            <ContextMenu.Item onClick={() => setStatus('todo')}>Todo</ContextMenu.Item>
            <ContextMenu.Item onClick={() => setStatus('in-progress')}>In Progress</ContextMenu.Item>
            <ContextMenu.Item>
              Priority
              <ContextMenu.SubMenu>
                <ContextMenu.Item onClick={() => setPriority('high')}>High</ContextMenu.Item>
                <ContextMenu.Item onClick={() => setPriority('low')}>Low</ContextMenu.Item>
              </ContextMenu.SubMenu>
            </ContextMenu.Item>
          </>
        }
      >
        <button type="button">Right Click Target</button>
      </ContextMenu.Root>
      <div data-testid="status-val">{status}</div>
      <div data-testid="priority-val">{priority}</div>
    </div>
  );
}

describe('Declarative ContextMenu library component', () => {
  it('opens on right click and triggers item clicks', async () => {
    const user = userEvent.setup();
    render(<DeclarativeContextMenuHarness />);

    const target = screen.getByRole('button', { name: 'Right Click Target' });
    fireEvent.contextMenu(target, { clientX: 100, clientY: 100 });

    expect(screen.getByRole('menu', { name: 'Context Menu' })).toBeInTheDocument();
    expect(screen.getByText('Todo')).toBeInTheDocument();
    expect(screen.getByText('Priority')).toBeInTheDocument();

    await user.click(screen.getByText('Todo'));
    expect(screen.getByTestId('status-val')).toHaveTextContent('todo');
    await waitFor(() => {
      expect(screen.queryByRole('menu', { name: 'Context Menu' })).not.toBeInTheDocument();
    });
  });

  it('handles nested submenus on hover/focus', async () => {
    const user = userEvent.setup();
    render(<DeclarativeContextMenuHarness />);

    const target = screen.getByRole('button', { name: 'Right Click Target' });
    fireEvent.contextMenu(target, { clientX: 100, clientY: 100 });

    const priorityItem = screen.getByText('Priority');
    
    // Simulate hover (mouseenter) to open submenu
    fireEvent.mouseEnter(priorityItem.parentElement!);
    
    // Wait for the hover timer to open submenu (100ms)
    await waitFor(() => {
      expect(screen.getByRole('menu', { name: 'Submenu' })).toBeInTheDocument();
    });

    expect(screen.getByText('High')).toBeInTheDocument();
    
    await user.click(screen.getByText('High'));
    expect(screen.getByTestId('priority-val')).toHaveTextContent('high');
    await waitFor(() => {
      expect(screen.queryByRole('menu', { name: 'Context Menu' })).not.toBeInTheDocument();
    });
  });
});
