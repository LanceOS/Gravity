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

  it('ignores built-in prototype members for dynamic keys', () => {
    expect(getCellValue({ label: 'Plain row' }, 'toString')).toBeUndefined();
    expect(getCellValue(() => undefined, 'bind')).toBeUndefined();
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
