import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LoadingCreateTicketDialog } from '../../modules/tickets/components/CreateTicketModal/LoadingCreateTicketDialog';

describe('LoadingCreateTicketDialog', () => {
  it('keeps a dismissible dialog open while the ticket form loads', () => {
    const onClose = vi.fn();
    render(<LoadingCreateTicketDialog onClose={onClose} />);

    expect(screen.getByRole('dialog', { name: 'Loading ticket editor' })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
