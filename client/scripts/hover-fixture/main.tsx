import '../../../library/styles/library.css';
import '../../src/index.css';
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Plus } from 'lucide-react';
import { Button } from '../../../library/components/button/Button';
import { Select } from '../../../library/components/select/Select';
import { applyResolvedTheme } from '../../../library/utilities/themeEngine';
import { TicketCard } from '../../src/modules/tickets/components/TicketCard';
import { TicketRow } from '../../src/modules/tickets/components/TicketRow';
import type { Ticket } from '../../src/types/domain';

applyResolvedTheme(new URLSearchParams(location.search).get('theme') === 'coal-black' ? 'coal-black' : 'marble-blue');
const ticket: Ticket = {
  id: 'ticket', key: 'GRA-1', title: 'Review the workspace', description: '', status: 'todo', priority: 'medium',
  assigneeId: null, projectId: 'project', cycleId: null, parentId: null, prStatus: 'none', prUrl: null, labels: [],
  createdAt: '2026-09-24T12:00:00Z', updatedAt: '2026-09-24T12:00:00Z',
};

function Fixture() {
  const [revision, setRevision] = useState(0);
  const [enters, setEnters] = useState(0);
  return <main style={{ padding: 40, display: 'grid', gap: 28, maxWidth: 1000 }}>
    <div style={{ display: 'flex', gap: 16 }}>
      {(['default', 'primary', 'ghost'] as const).map(variant =>
        <Button key={variant} id={variant} variant={variant} leftIcon={<Plus size={16} />}><span>{variant}</span></Button>)}
      <Button id="custom" leftIcon={<Plus size={16} />} onMouseEnter={() => setEnters(value => value + 1)}>
        <span>Custom handler</span>
      </Button>
      <Button id="disabled" disabled>Disabled</Button>
      <Button id="loading" loading>Loading</Button>
    </div>
    <div style={{ width: 300 }}>
      <Select aria-label="Choose project" value="first" options={[
        { value: 'first', label: 'First project' }, { value: 'second', label: 'Second project', color: '#548bd8' },
      ]} />
    </div>
    <div style={{ width: 300 }}><TicketCard ticket={ticket} onClick={() => {}} onDragStart={() => {}}
      priority="medium" priorityColor="var(--color-text-secondary)" assigneeAvatar={null} /></div>
    <TicketRow ticket={ticket} onClick={() => {}} priority="medium" assigneeAvatar={null} />
    <div><button id="rerender" onClick={() => setRevision(value => value + 1)}>Rerender fixture</button>
      <output id="revision">{revision}</output><output id="enters">{enters}</output></div>
  </main>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
