import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TicketRelationIndicators } from '../../modules/tickets/components/TicketRelationIndicators';

describe('TicketRelationIndicators', () => {
  it('renders nothing when the ticket has no relation state', () => {
    const { container } = render(<TicketRelationIndicators ticket={{ isBlocked: false, isDependency: false }} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders blocked and dependency indicators with accessible labels', () => {
    render(<TicketRelationIndicators ticket={{ isBlocked: true, isDependency: true }} />);

    expect(screen.getByRole('img', { name: 'Blocked' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Blocking' })).toBeInTheDocument();
  });
});
