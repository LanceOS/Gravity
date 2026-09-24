import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { FocusTrap } from '../../../library/utilities/focustrap/FocusTrap';
import { Modal } from '../../../library/components/modal/Modal';
import { Drawer } from '../../../library/components/drawer/Drawer';
import { DropdownMenu } from '../../../library/components/dropdownmenu/DropdownMenu';
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
      <DropdownMenu trigger={<button>Dropdown trigger</button>}>
        <button>Dropdown action</button>
      </DropdownMenu>
      <ContextMenuRoot items={[{ label: 'First menu action' }, { label: 'Last menu action' }]}>
        <button>Context target</button>
      </ContextMenuRoot>
    </> : scenario === 'modal' ? <Modal isOpen={open} onClose={() => setOpen(false)} title="Test modal">
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
