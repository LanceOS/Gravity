import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MarkdownContent } from '../../modules/tickets/components/MarkdownContent';
import { FormattedMarkdown } from '../../../../library/components/aichat/FormattedMarkdown';

vi.mock('../../context/TicketContext', () => ({
  useTickets: () => ({
    projects: [],
    ticketMap: new Map(),
    setActiveTicket: vi.fn(),
    setActiveProjectId: vi.fn(),
  }),
}));

vi.mock('../../hooks/useTicketByKey', () => ({
  useTicketByKey: () => ({
    ticketInfo: null,
    loading: false,
    error: null,
  }),
}));

describe('markdown link sanitization', () => {
  it('blocks leading-space javascript links in ticket markdown', () => {
    render(<MarkdownContent text="[Click Me]( javascript:alert(1))" />);

    const maybeLink = screen.queryByRole('link', { name: 'Click Me' });
    if (maybeLink) {
      expect(maybeLink).toHaveAttribute('href', 'about:blank');
      return;
    }

    expect(screen.getByText('[Click Me](javascript:alert(1))')).toBeInTheDocument();
  });

  it('blocks leading-space javascript links in AI markdown', () => {
    render(<FormattedMarkdown text="[Click Me]( javascript:alert(1))" />);

    expect(screen.getByRole('link', { name: 'Click Me' })).toHaveAttribute('href', 'about:blank');
  });
});
