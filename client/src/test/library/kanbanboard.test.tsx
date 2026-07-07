import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { KanbanBoard } from '@library';

function createDataTransfer() {
  const data = new Map<string, string>();

  return {
    data,
    dropEffect: 'none',
    effectAllowed: 'all',
    setData(type: string, value: string) {
      data.set(type, value);
    },
    getData(type: string) {
      return data.get(type) ?? '';
    },
  };
}

describe('KanbanBoard', () => {
  it('moves a dropped card into the destination column', () => {
    const onCardMove = vi.fn();

    render(
      <KanbanBoard
        columns={[
          { id: 'todo', title: 'Todo' },
          { id: 'done', title: 'Done' },
        ]}
        cards={[
          { id: 'c-1', title: 'Write tests', status: 'todo', content: 'Display suite' },
          { id: 'c-2', title: 'Ship phase', status: 'done', content: 'Push branch' },
        ]}
        onCardMove={onCardMove}
      />
    );

    const dataTransfer = createDataTransfer();
    const draggedCard = screen.getByText('Display suite').closest('[draggable="true"]');
    const doneColumn = screen.getByText('Done').closest('.kanban-board__column');

    expect(draggedCard).not.toBeNull();
    expect(doneColumn).not.toBeNull();

    fireEvent.dragStart(draggedCard as Element, { dataTransfer });
    fireEvent.dragOver(doneColumn as Element, { dataTransfer });
    fireEvent.drop(doneColumn as Element, { dataTransfer });

    expect(onCardMove).toHaveBeenCalledWith('c-1', 'done');
  });

  it('uses the active drag card when nested content does not provide drop data', () => {
    const onCardMove = vi.fn();

    render(
      <KanbanBoard
        columns={[
          { id: 'todo', title: 'Todo' },
          { id: 'done', title: 'Done' },
        ]}
        cards={[
          {
            id: 'c-1',
            title: 'Write tests',
            status: 'todo',
            content: (
              <button type="button" draggable onDragStart={() => undefined}>
                Drag nested card
              </button>
            ),
          },
          { id: 'c-2', title: 'Ship phase', status: 'done', content: 'Push branch' },
        ]}
        onCardMove={onCardMove}
      />
    );

    const dragDataTransfer = createDataTransfer();
    const dropDataTransfer = createDataTransfer();
    const draggedCard = screen.getByRole('button', { name: 'Drag nested card' });
    const doneColumn = screen.getByText('Done').closest('.kanban-board__column');

    expect(doneColumn).not.toBeNull();

    fireEvent.dragStart(draggedCard, { dataTransfer: dragDataTransfer });
    fireEvent.dragOver(doneColumn as Element, { dataTransfer: dropDataTransfer });
    fireEvent.drop(doneColumn as Element, { dataTransfer: dropDataTransfer });

    expect(onCardMove).toHaveBeenCalledWith('c-1', 'done');
  });

  it('clears the active drag card after drag end', () => {
    const onCardMove = vi.fn();

    render(
      <KanbanBoard
        columns={[
          { id: 'todo', title: 'Todo' },
          { id: 'done', title: 'Done' },
        ]}
        cards={[
          {
            id: 'c-1',
            title: 'Write tests',
            status: 'todo',
            content: (
              <button type="button" draggable onDragStart={() => undefined}>
                Drag nested card
              </button>
            ),
          },
          { id: 'c-2', title: 'Ship phase', status: 'done', content: 'Push branch' },
        ]}
        onCardMove={onCardMove}
      />
    );

    const dragDataTransfer = createDataTransfer();
    const dropDataTransfer = createDataTransfer();
    const draggedCard = screen.getByRole('button', { name: 'Drag nested card' });
    const doneColumn = screen.getByText('Done').closest('.kanban-board__column');

    expect(doneColumn).not.toBeNull();

    fireEvent.dragStart(draggedCard, { dataTransfer: dragDataTransfer });
    fireEvent.dragEnd(draggedCard, { dataTransfer: dragDataTransfer });
    fireEvent.dragOver(doneColumn as Element, { dataTransfer: dropDataTransfer });
    fireEvent.drop(doneColumn as Element, { dataTransfer: dropDataTransfer });

    expect(onCardMove).not.toHaveBeenCalled();
  });
});
