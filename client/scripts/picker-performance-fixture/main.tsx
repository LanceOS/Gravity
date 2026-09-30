import React, { useLayoutEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ContextMenu } from '@library';
import { SearchableOptionPickerPopoverContent } from '../../src/modules/tickets/components/SearchableOptionPickerPopoverContent';
import { TicketAssignmentSubMenu } from '../../src/modules/tickets/components/TicketAssignmentSubMenu';
import { sortTicketsForList } from '../../src/modules/tickets/utils/ticketView';
import type { Ticket } from '../../src/context/TicketContextContext';

declare global {
  interface Window {
    pickerConfig: { count: number; kind: string };
    churnDates: () => void;
    ready: boolean;
  }
}
const config = window.pickerConfig;
const options = Array.from({ length: config.count }, (_, i) => ({ id: `${i}`, label: `Option ${i}` }));
const tickets = options.map(o => ({ id: o.id, key: `GRA-${o.id}`, title: o.label })) as Ticket[];
let update = 0;
window.churnDates = () => {
  for (let i = 0; i < 100000; i++) {
    const date = new Date(1700000000000 + update++).toISOString();
    sortTicketsForList([{ createdAt: date, updatedAt: date } as Ticket], {}, 'newest');
  }
};
function Fixture() {
  const [selected, setSelected] = useState(new Set<string>());
  useLayoutEffect(() => { window.ready = true; }, []);
  return <>
    <div id="view">
      {config.kind === 'assignment' ? <ContextMenu.Root trigger={<button>Open assignment</button>}>
        <ContextMenu.Item>Assign<ContextMenu.SubMenu>
          <TicketAssignmentSubMenu title="Assign ticket" description="Choose a ticket" searchPlaceholder="Search tickets"
            tickets={tickets} emptyStateLabel="No tickets" onSelectTicket={t => setSelected(new Set([t.id]))} />
        </ContextMenu.SubMenu></ContextMenu.Item>
      </ContextMenu.Root> : <SearchableOptionPickerPopoverContent title="Options" searchPlaceholder="Search options"
        options={options} selectedIds={selected} onToggle={(id, value) => setSelected(previous => {
          const next = new Set(previous); if (value) next.delete(id); else next.add(id); return next;
        })} />}
    </div>
    <output id="selected">{[...selected].join(',')}</output><button id="after">After picker</button>
  </>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
