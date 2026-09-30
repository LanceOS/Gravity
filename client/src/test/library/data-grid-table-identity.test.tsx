import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DataGrid, Table } from '@library';

const getRowKey = (row: { code: number }) => row.code;
const rows = [{ code: 0, label: 'Alpha' }, { code: 1, label: 'Beta' }];
const columns = ['name', 'notes'].map(key => ({
  key,
  title: key,
  render: (row: typeof rows[number]) => (
    <input aria-label={`${row.code}-${key}`} defaultValue={`${row.label}-${key}`} />
  ),
}));

describe.each([['DataGrid', DataGrid], ['Table', Table]] as const)('%s stable identity', (_name, Component) => {
  it('preserves row DOM and input state through sorting, insertion, filtering, and immutable updates', () => {
    const { rerender } = render(<Component columns={columns} data={rows} getRowKey={getRowKey} />);
    const alpha = screen.getByRole('textbox', { name: '0-name' });
    const beta = screen.getByRole('textbox', { name: '1-name' });
    fireEvent.change(alpha, { target: { value: 'Unsaved edit' } });
    alpha.focus();

    const updatedAlpha = { code: 0, label: 'Updated Alpha' };
    for (const data of [
      [rows[1], updatedAlpha],
      [{ code: 2, label: 'Inserted' }, rows[1], updatedAlpha],
      [updatedAlpha, rows[1]],
      [updatedAlpha],
    ]) {
      rerender(<Component columns={columns} data={data} getRowKey={getRowKey} />);
      expect(screen.getByRole('textbox', { name: '0-name' })).toBe(alpha);
      expect(alpha).toHaveValue('Unsaved edit');
      expect(alpha).toHaveFocus();
      if (data.some(row => row.code === 1)) {
        expect(screen.getByRole('textbox', { name: '1-name' })).toBe(beta);
        expect(beta).toHaveValue('Beta-name');
      }
      expect(screen.getAllByRole('textbox').map(input => input.getAttribute('aria-label')))
        .toEqual(data.flatMap(row => [`${row.code}-name`, `${row.code}-notes`]));
    }
    expect(beta).not.toBeInTheDocument();
  });

  it('preserves surviving headers and cells when columns reorder, hide, return, or change metadata', () => {
    const { rerender } = render(<Component columns={columns} data={rows} getRowKey={getRowKey} />);
    const nameHeader = screen.getByText('name');
    const notesHeader = screen.getByText('notes');
    const name = screen.getByRole('textbox', { name: '0-name' });
    const notes = screen.getByRole('textbox', { name: '0-notes' });
    fireEvent.change(notes, { target: { value: 'Draft note' } });
    notes.focus();

    rerender(<Component columns={[columns[1], columns[0]]} data={rows} getRowKey={getRowKey} />);
    expect(screen.getByText('name')).toBe(nameHeader);
    expect(screen.getByText('notes')).toBe(notesHeader);
    expect(screen.getByRole('textbox', { name: '0-name' })).toBe(name);
    expect(screen.getByRole('textbox', { name: '0-notes' })).toBe(notes);

    const updatedNotes = { ...columns[1], title: 'Updated notes', width: 200 };
    for (const nextColumns of [[updatedNotes], [columns[0], updatedNotes]]) {
      rerender(<Component columns={nextColumns} data={rows} getRowKey={getRowKey} />);
      expect(screen.getByText('Updated notes')).toBe(notesHeader);
      expect(notesHeader).toHaveStyle({ width: '200px' });
      expect(screen.getByRole('textbox', { name: '0-notes' })).toBe(notes);
      expect(notes).toHaveValue('Draft note');
      expect(notes).toHaveFocus();
    }
    // A hidden column unmounts; showing it again intentionally creates fresh state.
    expect(screen.getByRole('textbox', { name: '0-name' })).not.toBe(name);
  });
});

it('keeps a visible DataGrid row identity when its virtual position changes', () => {
  const data = Array.from({ length: 50 }, (_, code) => ({ code, label: `Row ${code}` }));
  const { container, rerender } = render(
    <DataGrid columns={columns} data={data} getRowKey={getRowKey} height={90} rowHeight={30} />,
  );
  fireEvent.scroll(container.firstElementChild!, { target: { scrollTop: 600 } });
  const input = screen.getByRole('textbox', { name: '20-name' });
  fireEvent.change(input, { target: { value: 'Virtual draft' } });
  rerender(<DataGrid columns={columns} data={[{ code: 50, label: 'Inserted' }, ...data]} getRowKey={getRowKey} height={90} rowHeight={30} />);
  expect(screen.getByRole('textbox', { name: '20-name' })).toBe(input);
  expect(input).toHaveValue('Virtual draft');
  expect(input.parentElement?.parentElement).toHaveStyle({ top: '660px' });
  expect(screen.queryByRole('textbox', { name: '0-name' })).not.toBeInTheDocument();
});

it('resynchronizes the DataGrid window after data shrink clamps the browser scroll offset', () => {
  const data = Array.from({ length: 50 }, (_, code) => ({ code, label: `Row ${code}` }));
  const { container, rerender } = render(
    <DataGrid columns={columns} data={data} getRowKey={getRowKey} height={90} rowHeight={30} />,
  );
  const viewport = container.firstElementChild!;
  fireEvent.scroll(viewport, { target: { scrollTop: 600 } });
  expect(screen.getByRole('textbox', { name: '20-name' })).toBeInTheDocument();

  // Model the browser clamping scrollTop as content shrinks, before delivery
  // of a scroll event. jsdom does not perform this layout adjustment itself.
  viewport.scrollTop = 0;
  rerender(<DataGrid columns={columns} data={data.slice(0, 2)} getRowKey={getRowKey} height={90} rowHeight={30} />);
  expect(screen.getByRole('textbox', { name: '0-name' })).toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: '1-name' })).toBeInTheDocument();
  expect(screen.queryByRole('textbox', { name: '20-name' })).not.toBeInTheDocument();
});
