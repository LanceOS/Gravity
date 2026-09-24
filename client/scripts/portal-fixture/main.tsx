import React from 'react';
import { createRoot } from 'react-dom/client';
import { applyThemePreference } from '../../../library/utilities/themeEngine';
import { Modal } from '../../../library/components/modal/Modal';
import { Drawer } from '../../../library/components/drawer/Drawer';
import { Popover } from '../../../library/components/popover/Popover';
import { Tooltip } from '../../../library/components/tooltip/Tooltip';
import { Toast, toast } from '../../../library/components/notificationcenter/NotificationCenter';
import { Select } from '../../../library/components/select/Select';
import { ContextMenuRoot } from '../../../library/components/contextmenu/ContextMenu';
import '../../../library/styles/library.css';
import '../../src/index.css';
import '../../src/modules/tickets/components/CreateTicketModal/CreateTicketModal.css';
import '../../src/modules/tickets/components/TicketFilterBar/TicketFilterBar.css';

applyThemePreference('dark', { persist: false });

function GrowingContent() {
  const [wide, setWide] = React.useState(false);
  return <div style={{ width: wide ? 360 : 200, height: 80 }}>
    <button onClick={() => setWide(true)}>Grow content</button>
  </div>;
}

export function Fixture() {
  const params = new URLSearchParams(location.search);
  const scenario = params.get('scenario');
  const [open, setOpen] = React.useState(params.has('initial'));
  const close = () => setOpen(false);
  const restart = () => {
    setOpen(false);
    window.setTimeout(() => setOpen(true), 50);
  };
  return <>
    <button onClick={() => scenario === 'toast' ? toast.show('Portal toast', 'info', 0) : setOpen(true)}>Open overlay</button>
    {scenario === 'toast' && <Toast />}
    {scenario === 'modal' && <Modal isOpen={open} onClose={close} title="Portal modal"><button onClick={close}>Close overlay</button><button onClick={restart}>Restart overlay</button></Modal>}
    {scenario === 'drawer' && <Drawer isOpen={open} onClose={close} title="Portal drawer"><button onClick={close}>Close overlay</button><button onClick={restart}>Restart overlay</button></Drawer>}
    <div style={{ position: 'absolute', top: 400, left: params.get('align') === 'mobile' ? 200 : 600 }}>
      {scenario === 'popover' && <Popover isOpen={open} onOpenChange={setOpen} contentClassName={params.get('align') === 'custom' ? 'create-ticket-modal__labels-popover' : params.get('align') === 'mobile' ? 'ticket-filter-popover-content' : ''} align={(['custom', 'mobile'].includes(params.get('align') || '') ? 'right' : params.get('align') || 'right') as 'left' | 'right' | 'center'} trigger={<button>Popover trigger</button>}><GrowingContent /></Popover>}
      {scenario === 'tooltip' && <Tooltip content="Portal tooltip" style={{ position: 'fixed', top: 360, left: params.get('align') === 'mobile' ? 200 : 600 }}><button>Tooltip trigger</button></Tooltip>}
      {scenario === 'select' && <Select aria-label="Portal select" options={[{ value: 'one', label: 'First option' }, { value: 'two', label: 'Second option' }]} />}
      {scenario === 'contextmenu' && <ContextMenuRoot items={[{ label: 'Menu action' }, { label: 'More actions', children: [{ label: 'Nested action' }] }]}><button>Context target</button></ContextMenuRoot>}
    </div>
  </>;
}

// Record every rendering opportunity, including the first frame with an overlay.
const frames: unknown[] = [];
Object.assign(window, { portalFrames: frames });
function sample() {
  const element = document.querySelector<HTMLElement>(new URLSearchParams(location.search).get('scenario') === 'toast'
    ? 'body > div:not(#root) > div'
    : '[role="dialog"], [role="tooltip"], [role="listbox"], [role="menu"]');
  if (element) {
    const rect = element.getBoundingClientRect();
    frames.push({ opacity: Number(getComputedStyle(element).opacity), transform: getComputedStyle(element).transform,
      x: rect.x, y: rect.y, width: rect.width, height: rect.height });
  }
  requestAnimationFrame(sample);
}
requestAnimationFrame(sample);
createRoot(document.getElementById('root')!).render(<React.StrictMode><Fixture /></React.StrictMode>);
