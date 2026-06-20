import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MarkdownContent } from '../../modules/tickets/components/MarkdownContent';
import { FormattedMarkdown } from '../../../../library/components/aichat/FormattedMarkdown';

vi.mock('../../context/TicketContextContext', () => ({
  useTickets: () => ({
    projects: [],
    ticketMap: new Map(),
    setActiveTicket: vi.fn(),
    setActiveProjectId: vi.fn(),
  }),
}));

vi.mock('../../context/project/ProjectContext', () => ({
  useProjectContext: () => ({
    projects: [],
    projectsLoading: false,
    projectLookup: new Map(),
    projectById: new Map(),
    projectsByWorkspaceId: new Map(),
  }),
}));

vi.mock('../../context/label/LabelContext', () => ({
  useLabels: () => ({ labels: [], globalLabels: [], labelsByProject: new Map(), assignLabelToTicket: vi.fn(), unassignLabelFromTicket: vi.fn(), createLabel: vi.fn(), updateLabel: vi.fn(), deleteLabel: vi.fn() }),
}));
vi.mock('../../context/cycle/CycleContext', () => ({
  useCycles: () => ({ cycles: [] }),
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

  it('blocks javascript links with tabs in AI markdown', () => {
    render(<FormattedMarkdown text={"[Click Me](java\tscript:alert(1))"} />);

    expect(screen.getByRole('link', { name: 'Click Me' })).toHaveAttribute('href', 'about:blank');
  });
});
