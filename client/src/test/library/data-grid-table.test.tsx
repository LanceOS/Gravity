import { render, screen, within } from '@testing-library/react';
import { createPortal } from 'react-dom';
import { describe, expect, it } from 'vitest';
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
