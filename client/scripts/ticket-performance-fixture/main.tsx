/* eslint-disable react-hooks/purity, react-refresh/only-export-components -- Standalone production profiling fixture intentionally records computation timings. */
import '../../../library/styles/library.css';
import '../../src/index.css';
import React, { Profiler, useCallback, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { TicketBoard } from '../../src/modules/tickets/components/TicketBoard';
import { TicketList } from '../../src/modules/tickets/components/TicketList';
import { filterTickets, groupTicketsByStatus, sortTicketsForList } from '../../src/modules/tickets/utils/ticketView';
import type { Ticket } from '../../src/types/domain';
import { applyResolvedTheme } from '../../../library/utilities/themeEngine';
import { ContextMenu, DenseVirtualList } from '@library';

applyResolvedTheme('coal-black');
const params = new URLSearchParams(location.search);
const count = Number(params.get('count') || 1000);
const board = params.get('view') === 'board';
const statuses: Ticket['status'][] = ['backlog', 'todo', 'in_progress', 'in_review', 'done', 'canceled'];
const priorities: Ticket['priority'][] = ['urgent', 'high', 'medium', 'low', 'no_priority'];
const tickets: Ticket[] = Array.from({ length: count }, (_, i) => ({
  id: `ticket-${i}`, key: `GRAV-${i + 1}`, projectId: 'project',
  title: `${i % 4 === 0 ? 'Search performance' : 'Workspace navigation'}: ${i % 3 ? 'preserve saved filters' : 'Review long project names and labels across responsive layouts '.repeat(4)}`,
  description: 'Project acceptance criteria and implementation notes. '.repeat(8),
  status: params.has('single') ? 'todo' : statuses[params.get('skew') ? (i % 10 < 8 ? 1 : i % 2 ? 0 : 4) : i % 6],
  priority: priorities[i % 5], assigneeId: i % 3 ? `user-${i % 20}` : null,
  labels: Array.from({ length: Number(params.get('labels') || 1) }, (_, j) => ({
    id: `label-${j}`, name: params.has('labels') ? `Platform team ${j}` : 'Platform', color: '#5599ff', projectId: 'project',
  })), labelIds: ['label-0'],
  cycleId: null, parentId: i % 7 === 0 ? 'parent' : null,
  isBlocked: i % 11 === 0, isDependency: i % 13 === 0,
  prStatus: i % 4 === 0 ? 'open' : 'none', prUrl: i % 4 === 0 ? 'https://example.com/pr/1' : null,
  createdAt: new Date(Date.UTC(2026, 0, 1) + i * 60000).toISOString(),
  updatedAt: new Date(Date.UTC(2026, 0, 1) + i * 120000).toISOString(),
}));
const avatars = {};
const noop = () => {};
const metrics = { renders: [] as number[], derivations: [] as number[] };
Object.assign(window, { ticketMetrics: metrics });

function Fixture() {
  const [data, setData] = useState(tickets);
  const [search, setSearch] = useState('');
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState('');
  const grouped = useMemo(() => {
    const start = performance.now();
    const filtered = filterTickets(data, { search, status: '', priority: '', projectId: '', cycleId: '', assigneeId: '' });
    const result = groupTicketsByStatus(board ? filtered : sortTicketsForList(filtered, {}, 'newest'));
    metrics.derivations.push(performance.now() - start);
    return result;
  }, [data, search]);
  const select = useCallback((ticket: Ticket) => setSelected(ticket.id), []);
  const move = useCallback(async (id: string, updates: Partial<Ticket>) => {
    setData(previous => previous.map(ticket => ticket.id === id ? { ...ticket, ...updates } : ticket));
    setSelected(`${id}:${updates.status}`);
  }, []);
  return <main style={{ height: '100vh', display: 'flex', flexDirection: 'column', padding: 12, boxSizing: 'border-box' }}>
    <div style={{ display: 'flex', gap: 12, padding: 8 }}>
      <input aria-label="Search tickets" value={search} onChange={event => setSearch(event.target.value)} />
      <button id="rerender" onClick={() => setRevision(value => value + 1)}>Unrelated update</button>
      <output id="revision">{revision}</output><output id="selected">{selected}</output>
      {params.get('review') === 'threshold' && <>
        <button id="remove-ticket" onClick={() => setData(previous => previous.slice(0, -1))}>Remove last</button>
        <button id="restore-tickets" onClick={() => setData(tickets)}>Restore tickets</button>
      </>}
    </div>
    <div id="view" style={{ flex: 1, minHeight: 0, display: 'flex' }}>
      <Profiler id="tickets" onRender={(_id, _phase, duration) => metrics.renders.push(duration)}>
        {board ? <TicketBoard ticketsByColumn={grouped} availableTickets={data} userAvatarById={avatars}
          onMoveTicket={move} onSelectTicket={select} onOpenCreateTicket={noop} />
          : <TicketList filteredCount={Object.values(grouped).flat().length} groupedTickets={grouped}
            availableTickets={data} userAvatarById={avatars} onSelectTicket={select} />}
      </Profiler>
    </div>
    <button id="after">After tickets</button>
  </main>;
}

function MenuFixture() {
  const [selected, setSelected] = useState('');
  return <>
    <DenseVirtualList items={tickets} height={400} rowHeight={50} buffer={0} getItemKey={ticket => ticket.id}
      itemFocusSelector="button" renderRow={(ticket, _index, style) => <div style={style}>
        <ContextMenu.Root items={[{ label: 'Change status', onClick: () => setSelected(ticket.id) }]}>
          <button>{ticket.key}</button>
        </ContextMenu.Root>
      </div>} />
    <output id="selected">{selected}</output><button id="after">Outside tickets</button>
  </>;
}
createRoot(document.getElementById('root')!).render(params.get('review') === 'menu' ? <MenuFixture /> : <Fixture />);
