import userEvent from '@testing-library/user-event';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import TicketUtilities from '../../modules/tickets/components/TicketUtilities/TicketUtilities';

describe('TicketUtilities', () => {
  it('renders the utility actions and forwards copy requests', async () => {
    const user = userEvent.setup();
    const onCopy = vi.fn();
    const onCopyBranchName = vi.fn();

    render(
      <TicketUtilities
        ticketLink="https://tickets.placeholder.local/GRA-101"
        onCopyBranchName={onCopyBranchName}
        description="Retry the event stream after disconnects."
        onCopy={onCopy}
      />
    );

    expect(screen.getByText('Ticket Utilities')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Copy Ticket Link' }));
    expect(onCopy).toHaveBeenCalledWith('https://tickets.placeholder.local/GRA-101', 'Ticket link copied');

    await user.click(screen.getByRole('button', { name: 'Copy Branch Name' }));
    expect(onCopyBranchName).toHaveBeenCalledTimes(1);
    expect(onCopy).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Copy as Markdown' }));
    expect(onCopy).toHaveBeenCalledWith('Retry the event stream after disconnects.', 'Description copied');
  });
});