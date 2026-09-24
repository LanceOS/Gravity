import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { FocusTrap } from '../../../library/utilities/focustrap/FocusTrap';
import { Modal } from '../../../library/components/modal/Modal';
import { Drawer } from '../../../library/components/drawer/Drawer';
import { DropdownMenu } from '../../../library/components/dropdownmenu/DropdownMenu';
import { Button } from '../../../library/components/button/Button';
import { Popover } from '../../../library/components/popover/Popover';
import { MegaMenu } from '../../../library/components/megamenu/MegaMenu';
import { Popconfirm } from '../../../library/components/popconfirm/Popconfirm';
import { ContextMenuRoot } from '../../../library/components/contextmenu/ContextMenu';

function Fixture() {
  const [open, setOpen] = useState(false);
  const scenario = new URLSearchParams(location.search).get('scenario') || 'basic';
  const close = <button onClick={() => setOpen(false)}>Close trap</button>;
  const excludedControls: Record<string, React.ReactNode> = {
    hidden: <div hidden><button>Hidden ancestor</button></div>,
    display: <div style={{ display: 'none' }}><button>CSS hidden ancestor</button></div>,
    inert: <div inert><button>Inert ancestor</button></div>,
    fieldset: <fieldset disabled><button>Disabled fieldset</button></fieldset>,
    negative: <button tabIndex={-1}>Programmatic only</button>,
    negativeOther: <button tabIndex={-2}>Negative tabindex</button>,
    input: <input type="hidden" aria-label="Hidden input" />,
    invisible: <button style={{ visibility: 'hidden' }}>Invisible button</button>,
  };
  const excluded = excludedControls[scenario.replace('excluded-', '')];
  return <>
    <button onClick={() => setOpen(true)}>Open trap</button>
    <button>Outside action</button>
    {scenario === 'menus' ? <>
      <DropdownMenu trigger={<span>Dropdown trigger</span>}>
        <button>Dropdown action</button>
      </DropdownMenu>
      <ContextMenuRoot items={[{ label: 'First menu action' }, { label: 'Last menu action' }]}>
        <button>Context target</button>
      </ContextMenuRoot>
      <ContextMenuRoot items={[{ label: 'Non-button menu action' }]}>
        <div>Non-button context target</div>
      </ContextMenuRoot>
    </> : scenario === 'triggers' ? <>
      <DropdownMenu trigger={<button>Native dropdown trigger</button>}><button>Native dropdown action</button></DropdownMenu>
      <Popover trigger={<Button>Popover trigger</Button>}><button>Popover action</button></Popover>
      <MegaMenu trigger={<span>Mega menu trigger</span>} columns={[{ title: 'Links', links: [{ label: 'Mega menu action', href: '#action' }] }]} />
      <Popconfirm title="Confirm action" onConfirm={() => {}}><span>Confirm trigger</span></Popconfirm>
    </> : scenario === 'popover-autofocus' ? <Popover trigger={<button id="search-trigger" aria-label="Search labels"><span aria-hidden="true">+</span></button>}>
      <input autoFocus aria-label="Search" />
      <button>Apply</button>
    </Popover> : scenario === 'modal' ? <Modal isOpen={open} onClose={() => setOpen(false)} title="Test modal">
      <label>Modal field<input /></label>{close}
    </Modal> : scenario === 'drawer' ? <Drawer isOpen={open} onClose={() => setOpen(false)} title="Test drawer">
      <label>Drawer field<input /></label>{close}
    </Drawer> : open && <FocusTrap>
      <section role="dialog" aria-label="Trap dialog" tabIndex={-1}>
        <h2>Trap heading</h2>
        {scenario.startsWith('excluded-') && excluded}
        <div style={{ display: 'contents' }}>
          {scenario === 'legend' ? <fieldset disabled>
            <legend><button>First action</button></legend>
            <button>Disabled outside legend</button>
          </fieldset> : scenario === 'visible-override' ? <div style={{ visibility: 'hidden' }}>
            <button style={{ visibility: 'visible' }}>First action</button>
          </div> : <button>First action</button>}
          <label>Account name<input /></label>
        </div>
        {close}
        {scenario.startsWith('excluded-') && excluded}
      </section>
    </FocusTrap>}
  </>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
