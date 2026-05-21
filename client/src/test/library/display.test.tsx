import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import {
  Accordion,
  Avatar,
  AvatarGroup,
  Badge,
  CalendarView,
  Card,
  Carousel,
  DataGrid,
  DenseTable,
  DenseVirtualList,
  DescriptionList,
  Image,
  KanbanBoard,
  List,
  ListItem,
  Statistic,
  Table,
  Tag,
  Timeline,
  TreeView,
} from '@library';

type DisplayRow = {
  id: string;
  name: string;
  status: string;
  score: number;
};

const rows: DisplayRow[] = [
  { id: '1', name: 'Alpha', status: 'Todo', score: 10 },
  { id: '2', name: 'Beta', status: 'Doing', score: 20 },
  { id: '3', name: 'Gamma', status: 'Done', score: 30 },
];

const columns = [
  { key: 'name', title: 'Name' },
  { key: 'status', title: 'Status' },
  { key: 'score', title: 'Score', render: (row: DisplayRow) => `${row.score}%` },
];

const denseColumns = [
  { key: 'name', header: 'Name', width: '40%', render: (row: DisplayRow) => row.name },
  { key: 'status', header: 'Status', width: '30%', render: (row: DisplayRow) => row.status },
  { key: 'score', header: 'Score', width: '30%', align: 'right' as const, render: (row: DisplayRow) => `${row.score}%` },
];

function DisplayHarness() {
  const [tagClosed, setTagClosed] = useState(false);
  const [selectedNode, setSelectedNode] = useState('none');
  const [selectedRowId, setSelectedRowId] = useState('');
  const [listClicks, setListClicks] = useState(0);

  return (
    <div>
      <Avatar name="Jane Doe" size="lg" />
      <AvatarGroup max={2}>
        <Avatar name="Jane Doe" />
        <Avatar name="Alex Roe" />
        <Avatar name="Taylor Poe" />
      </AvatarGroup>
      <Badge variant="success">Ready</Badge>

      {!tagClosed ? <Tag label="Closable tag" onClose={() => setTagClosed(true)} /> : <span>Tag closed</span>}

      <div data-testid="image-host">
        <Image src="broken.png" fallback="fallback.png" alt="Preview" />
      </div>

      <div data-testid="carousel-host">
        <Carousel images={["first.png", "second.png", "third.png"]} />
      </div>

      <Card title="Team summary" extra={<span>3 items</span>}>
        Card body
      </Card>

      <Accordion
        items={[
          { id: 'details', title: 'Details', content: 'Accordion details' },
          { id: 'history', title: 'History', content: 'Accordion history' },
        ]}
      />

      <DescriptionList items={[{ key: 'Owner', value: 'Jane Doe' }, { key: 'Status', value: 'Active' }]} />
      <Statistic title="Velocity" value={42} suffix="pts" />
      <Table columns={columns} data={rows} />
      <DataGrid columns={columns} data={rows} height={120} rowHeight={30} />

      <KanbanBoard
        columns={[
          { id: 'todo', title: 'Todo' },
          { id: 'done', title: 'Done' },
        ]}
        cards={[
          { id: 'c-1', title: 'Write tests', status: 'todo', content: 'Display suite' },
          { id: 'c-2', title: 'Ship phase', status: 'done', content: 'Push branch' },
        ]}
      />

      <Timeline
        events={[
          { time: '09:00', title: 'Kickoff', description: 'Review coverage' },
          { time: '10:30', title: 'Validation', description: 'Run Vitest' },
        ]}
      />

      <CalendarView
        currentDate={new Date(2024, 0, 1)}
        events={[{ date: new Date(2024, 0, 3), label: 'Launch', color: '#3b82f6' }]}
      />

      <div data-testid="tree-view-host">
        <TreeView
          nodes={[
            {
              id: 'workspace',
              label: 'Workspace',
              isFolder: true,
              children: [{ id: 'notes', label: 'Notes.md' }],
            },
          ]}
          onNodeClick={(node) => setSelectedNode(node.label)}
        />
      </div>
      <div>Selected node: {selectedNode}</div>

      <div data-testid="dense-table-host">
        <DenseTable
          columns={denseColumns}
          data={rows}
          selectedRowId={selectedRowId}
          getRowId={(row) => row.id}
          onRowClick={(row) => setSelectedRowId(row.id)}
        />
      </div>
      <div>Selected row: {selectedRowId || 'none'}</div>

      <DenseVirtualList
        items={rows}
        height={90}
        rowHeight={30}
        renderRow={(item, index, style) => (
          <div key={item.id} style={style}>
            Virtual row {index + 1}: {item.name}
          </div>
        )}
      />

      <List>
        <ListItem icon={<span>#</span>} onClick={() => setListClicks((count) => count + 1)}>
          Roadmap item
        </ListItem>
      </List>
      <div>List clicks: {listClicks}</div>
    </div>
  );
}

describe('library display components', () => {
  it('renders the shared display showcase', () => {
    render(<DisplayHarness />);

    expect(screen.getAllByText('JD')).toHaveLength(2);
    expect(screen.getByText('+1')).toBeInTheDocument();
    expect(screen.getByText('Ready')).toBeInTheDocument();
    expect(screen.getByText('Team summary')).toBeInTheDocument();
    expect(screen.getByText('Card body')).toBeInTheDocument();
    expect(screen.getByText('Owner')).toBeInTheDocument();
    expect(screen.getByText('Velocity')).toBeInTheDocument();
    expect(screen.getAllByText('Alpha')).toHaveLength(3);
    expect(screen.getByText('Write tests')).toBeInTheDocument();
    expect(screen.getByText('Kickoff')).toBeInTheDocument();
    expect(screen.getByText('Launch')).toBeInTheDocument();
    expect(screen.getByText('Workspace')).toBeInTheDocument();
    expect(screen.getByText('Virtual row 1: Alpha')).toBeInTheDocument();
    expect(screen.getByText('Roadmap item')).toBeInTheDocument();
  });

  it('supports the core interactive display widgets', async () => {
    const user = userEvent.setup();

    render(<DisplayHarness />);

    await user.click(screen.getByRole('button', { name: '×' }));
    expect(screen.getByText('Tag closed')).toBeInTheDocument();

    const preview = screen.getByAltText('Preview');
    fireEvent.error(preview);
    expect(preview).toHaveAttribute('src', 'fallback.png');

    const carouselHost = screen.getByTestId('carousel-host');
    const carouselButtons = within(carouselHost).getAllByRole('button');
    const carouselImage = within(carouselHost).getByAltText('Carousel slide');

    expect(carouselImage).toHaveAttribute('src', 'first.png');
    await user.click(carouselButtons[1]);
    expect(carouselImage).toHaveAttribute('src', 'second.png');
    await user.click(carouselButtons[0]);
    expect(carouselImage).toHaveAttribute('src', 'first.png');

    await user.click(screen.getByRole('button', { name: /Details/ }));
    expect(screen.getByText('Accordion details')).toBeInTheDocument();

    const treeViewHost = screen.getByTestId('tree-view-host');
    await user.click(within(treeViewHost).getByRole('button'));
    await user.click(screen.getByText('Notes.md'));
    expect(screen.getByText('Selected node: Notes.md')).toBeInTheDocument();

    const denseTableHost = screen.getByTestId('dense-table-host');
    await user.click(within(denseTableHost).getByRole('row', { name: /Beta Doing 20%/ }));
    expect(screen.getByText('Selected row: 2')).toBeInTheDocument();

    await user.click(screen.getByText('Roadmap item'));
    expect(screen.getByText('List clicks: 1')).toBeInTheDocument();
  });
});