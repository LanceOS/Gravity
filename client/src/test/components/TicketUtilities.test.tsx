import userEvent from '@testing-library/user-event';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import TicketUtilities from '../../modules/tickets/components/TicketUtilities';

describe('TicketUtilities', () => {
  it('renders the utility actions and forwards copy requests', async () => {
    const user = userEvent.setup();
    const onCopy = vi.fn();

    render(
      <TicketUtilities
        ticketLink="https://tickets.placeholder.local/GRA-101"
        generatedBranchName="feature/gra-101-fix-sync-retries"
        description="Retry the event stream after disconnects."
        onCopy={onCopy}
      />
    );

    expect(screen.getByText('Ticket Utilities')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ticket link' })).toHaveAttribute(
      'href',
      'https://tickets.placeholder.local/GRA-101'
    );

    await user.click(screen.getByRole('button', { name: 'Copy Branch Name' }));
    expect(onCopy).toHaveBeenCalledWith('feature/gra-101-fix-sync-retries', 'Branch name copied');

    await user.click(screen.getByRole('button', { name: 'Copy as Markdown' }));
    expect(onCopy).toHaveBeenCalledWith('Retry the event stream after disconnects.', 'Description copied');
  });
});