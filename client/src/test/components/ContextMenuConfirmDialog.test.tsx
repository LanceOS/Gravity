import { useState } from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { ContextMenu } from '@library';
import { ConfirmDialog } from '../../components/ConfirmDialog';

const { animationCompletions } = vi.hoisted(() => ({ animationCompletions: [] as Array<() => void> }));
vi.mock('../../../../library/utilities', async importOriginal => ({
  ...await importOriginal<typeof import('../../../../library/utilities')>(),
  runAnime: ({ complete }: { complete?: () => void }) => {
    if (complete) animationCompletions.push(complete);
  },
}));

afterEach(() => {
  vi.unstubAllEnvs();
  animationCompletions.length = 0;
});

function Harness() {
  const [confirmOpen, setConfirmOpen] = useState(false);
  return (
    <>
      <ContextMenu.Root content={<ContextMenu.Item onClick={() => setConfirmOpen(true)}>Delete ticket</ContextMenu.Item>}>
        <button type="button">Ticket</button>
      </ContextMenu.Root>
      {confirmOpen && <ConfirmDialog.Root isOpen onClose={() => setConfirmOpen(false)}>
        <ConfirmDialog.Header title="Delete ticket?" />
        <ConfirmDialog.Actions confirmLabel="Delete" onCancel={() => setConfirmOpen(false)} onConfirm={() => setConfirmOpen(false)} />
      </ConfirmDialog.Root>}
    </>
  );
}

it('keeps focus in the confirmation when the context menu exit animation finishes', async () => {
  // Exercise the delayed production close; the usual test mode skips animation.
  vi.stubEnv('NODE_ENV', 'production');
  const user = userEvent.setup();
  render(<Harness />);
  const trigger = screen.getByRole('button', { name: 'Ticket' });
  await user.click(trigger);
  fireEvent.contextMenu(trigger);
  await user.click(screen.getByRole('menuitem', { name: 'Delete ticket' }));
  const cancel = within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancel' });
  expect(cancel).toHaveFocus();
  act(() => { animationCompletions.splice(0).forEach(complete => complete()); });
  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  expect(cancel).toHaveFocus();
  await user.click(cancel);
  expect(trigger).toHaveFocus();
});
