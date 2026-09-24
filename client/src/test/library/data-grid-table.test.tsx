import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createPortal } from 'react-dom';
import { describe, expect, it, vi } from 'vitest';
import { DataGrid, Table } from '@library';
import { getCellValue } from '@library/components/datagrid/renderCellValue';

class GetterRow {
  private readonly value: string;

  constructor(value: string) {
    this.value = value;
  }

  get label() {
    return this.value;
  }

  format() {
    return this.value.toUpperCase();
  }
}

describe('DataGrid and Table cell rendering', () => {
  it('renders prototype getter values', () => {
    const rows = [new GetterRow('Getter-backed cell')];
    const columns = [{ key: 'label', title: 'Label' }];

    render(
      <>
        <Table columns={columns} data={rows} />
        <DataGrid columns={columns} data={rows} height={60} rowHeight={30} />
      </>,
    );

    expect(screen.getAllByText('Getter-backed cell')).toHaveLength(2);
  });

  it('keeps custom getters but ignores inherited method members', () => {
    const row = new GetterRow('Getter-backed cell');

    expect(getCellValue(row, 'label')).toBe('Getter-backed cell');
    expect(getCellValue(row, 'format')).toBeUndefined();
    expect(getCellValue(row, 'constructor')).toBeUndefined();
    expect(getCellValue({ label: 'Plain row' }, 'toString')).toBeUndefined();
    expect(getCellValue(() => undefined, 'bind')).toBeUndefined();
    expect(getCellValue([], 'map')).toBeUndefined();
    expect(getCellValue(new Date(), 'getTime')).toBeUndefined();
    expect(getCellValue(new Map(), 'size')).toBeUndefined();
  });

  it('does not loop on a cyclic proxy prototype', () => {
    let prototypeReads = 0;
    let row: object = {};

    row = new Proxy({}, {
      has: (_target, key) => key === 'missing',
      getPrototypeOf: () => {
        prototypeReads += 1;

        if (prototypeReads > 1) {
          throw new Error('prototype cycle was traversed more than once');
        }

        return row;
      },
    });

    expect(getCellValue(row, 'missing')).toBeUndefined();
    expect(prototypeReads).toBeLessThanOrEqual(1);
  });

  it('resolves virtual proxy-backed cell keys through has/get traps', () => {
    let hasReads = 0;
    let valueReads = 0;
    let blockedValueReads = 0;
    const row = new Proxy({}, {
      has: (_target, key) => {
        hasReads += 1;
        return key === 'virtual' || key === 'toString';
      },
      get: (_target, key) => {
        valueReads += 1;
        if (key === 'virtual') {
          return 'Proxy-backed cell';
        }

        if (key === 'toString') {
          blockedValueReads += 1;
          return 'Blocked proxy value';
        }

        return undefined;
      },
    });

    expect(getCellValue(row, 'virtual')).toBe('Proxy-backed cell');
    expect(getCellValue(row, 'toString')).toBeUndefined();
    expect(hasReads).toBeGreaterThan(0);
    expect(valueReads).toBe(1);
    expect(blockedValueReads).toBe(0);
  });

  it('renders iterable ReactNode cell values', () => {
    const rows = [{
      value: new Set([
        <span key="iterable-value">Iterable cell</span>,
      ]),
    }];
    const columns = [{ key: 'value', title: 'Value' }];

    render(
      <>
        <Table columns={columns} data={rows} />
        <DataGrid columns={columns} data={rows} height={60} rowHeight={30} />
      </>,
    );

    expect(screen.getAllByText('Iterable cell')).toHaveLength(2);
  });

  it('renders portal cell values', () => {
    const tablePortalHost = document.createElement('div');
    const dataGridPortalHost = document.createElement('div');
    document.body.append(tablePortalHost, dataGridPortalHost);

    const tablePortal = createPortal(<span>Table portal cell</span>, tablePortalHost);
    const dataGridPortal = createPortal(<span>DataGrid portal cell</span>, dataGridPortalHost);
    const columns = [{ key: 'value', title: 'Value' }];
    const view = render(
      <>
        <Table columns={columns} data={[{ value: tablePortal }]} />
        <DataGrid columns={columns} data={[{ value: dataGridPortal }]} height={60} rowHeight={30} />
      </>,
    );

    try {
      expect(within(tablePortalHost).getByText('Table portal cell')).toBeInTheDocument();
      expect(within(dataGridPortalHost).getByText('DataGrid portal cell')).toBeInTheDocument();
    } finally {
      view.unmount();
      tablePortalHost.remove();
      dataGridPortalHost.remove();
    }
  });
});

describe.each([['DataGrid', DataGrid], ['Table', Table]] as const)('%s cell interactions', (_name, Component) => {
  it('activates custom cells with the current row after data is reordered and replaced', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const rows = [{ id: 1, label: 'First' }, { id: 2, label: 'Second' }];
    const columns = [{
      key: 'label', title: 'Action',
      render: (row: typeof rows[number]) => <button onClick={() => onOpen(row)}>Open {row.label}</button>,
    }];
    const { rerender } = render(<Component columns={columns} data={rows} />);

    await user.click(screen.getByRole('button', { name: 'Open First' }));
    expect(onOpen).toHaveBeenLastCalledWith(rows[0]);
    const replacement = { id: 2, label: 'Updated second' };
    rerender(<Component columns={columns} data={[replacement, rows[0]]} />);
    expect(screen.queryByRole('button', { name: 'Open Second' })).not.toBeInTheDocument();
    screen.getByRole('button', { name: 'Open Updated second' }).focus();
    await user.keyboard('{Enter}');
    expect(onOpen).toHaveBeenLastCalledWith(replacement);
    await user.tab();
    await user.keyboard(' ');
    expect(onOpen).toHaveBeenLastCalledWith(rows[0]);
    expect(onOpen).toHaveBeenCalledTimes(3);
  });
});

describe('DataGrid windowing', () => {
  const rows = Array.from({ length: 100 }, (_, id) => ({ id, label: `Row ${id}` }));
  const columns = [{ key: 'label', title: 'Label' }];
  const renderedRows = () => screen.queryAllByText(/^Row \d+$/);

  it('bounds mounted rows while scrolling to the middle, end, and back to the start', () => {
    const { container } = render(<DataGrid columns={columns} data={rows} height={90} rowHeight={30} />);
    // DataGrid exposes a scroll container, not an ARIA grid or row-selection API.
    const viewport = container.firstElementChild!;
    expect(screen.getByText('Row 0')).toBeInTheDocument();
    expect(screen.getByText('Row 2')).toBeInTheDocument();
    expect(screen.queryByText('Row 20')).not.toBeInTheDocument();
    expect(renderedRows().length).toBeLessThan(20);

    fireEvent.scroll(viewport, { target: { scrollTop: 600 } });
    expect(screen.queryByText('Row 0')).not.toBeInTheDocument();
    expect(screen.getByText('Row 20')).toBeInTheDocument();
    expect(screen.getByText('Row 22')).toBeInTheDocument();
    expect(renderedRows().length).toBeLessThan(20);
    expect(screen.getByText('Row 20').parentElement).toHaveStyle({ position: 'absolute', top: '630px', height: '30px' });

    fireEvent.scroll(viewport, { target: { scrollTop: 2910 } });
    expect(screen.getByText('Row 99')).toBeInTheDocument();
    expect(screen.queryByText('Row 20')).not.toBeInTheDocument();
    expect(renderedRows().length).toBeLessThan(20);
    fireEvent.scroll(viewport, { target: { scrollTop: 0 } });
    expect(screen.getByText('Row 0')).toBeInTheDocument();
    expect(screen.queryByText('Row 99')).not.toBeInTheDocument();
    expect(screen.getByText('Label')).toBeInTheDocument();
  });

  it('recalculates the visible window when viewport and row heights change without another scroll', () => {
    const { container, rerender } = render(<DataGrid columns={columns} data={rows} height={90} rowHeight={30} />);
    fireEvent.scroll(container.firstElementChild!, { target: { scrollTop: 600 } });
    expect(screen.queryByText('Row 30')).not.toBeInTheDocument();

    rerender(<DataGrid columns={columns} data={rows} height={300} rowHeight={30} />);
    expect(container.firstElementChild).toHaveStyle({ height: '300px' });
    expect(screen.getByText('Row 30')).toBeInTheDocument();

    rerender(<DataGrid columns={columns} data={rows} height={300} rowHeight={60} />);
    expect(screen.getByText('Row 10')).toBeInTheDocument();
    expect(screen.getByText('Row 14')).toBeInTheDocument();
    expect(screen.queryByText('Row 30')).not.toBeInTheDocument();
    expect(screen.getByText('Row 10').parentElement).toHaveStyle({ top: '660px', height: '60px' });
  });

  it('updates the window as data grows, shrinks, empties, and returns', () => {
    const { rerender } = render(<DataGrid columns={columns} data={[]} height={90} rowHeight={30} />);
    expect(renderedRows()).toHaveLength(0);
    expect(screen.getByText('Label')).toBeInTheDocument();
    rerender(<DataGrid columns={columns} data={rows} height={90} rowHeight={30} />);
    expect(screen.getByText('Row 2')).toBeInTheDocument();
    expect(renderedRows().length).toBeLessThan(20);
    rerender(<DataGrid columns={columns} data={rows.slice(0, 2)} height={90} rowHeight={30} />);
    expect(renderedRows().map(row => row.textContent)).toEqual(['Row 0', 'Row 1']);
    rerender(<DataGrid columns={columns} data={[]} height={90} rowHeight={30} />);
    expect(renderedRows()).toHaveLength(0);
    rerender(<DataGrid columns={columns} data={rows.slice(0, 1)} height={90} rowHeight={30} />);
    expect(renderedRows()).toHaveLength(1);
  });

  it('activates a newly mounted custom cell after scrolling', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const { container } = render(<DataGrid data={rows} height={90} rowHeight={30} columns={[{
      key: 'label', render: row => <button onClick={() => onOpen(row)}>Open {row.label}</button>,
    }]} />);
    expect(screen.queryByRole('button', { name: 'Open Row 50' })).not.toBeInTheDocument();
    fireEvent.scroll(container.firstElementChild!, { target: { scrollTop: 1500 } });
    await user.click(screen.getByRole('button', { name: 'Open Row 50' }));
    expect(onOpen).toHaveBeenCalledExactlyOnceWith(rows[50]);
  });
});
