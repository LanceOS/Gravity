import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MarkdownContent } from '../../modules/tickets/components/MarkdownContent';
import { TicketCommentsThread } from '../../modules/tickets/components/TicketDetail/components/TicketCommentsThread';
import { FormattedMarkdown } from '../../../../library/components/aichat/FormattedMarkdown';
import type { Comment, Ticket } from '../../types/domain';

vi.mock('../../context/ticket/TicketListContext', () => ({
  useTicketListContext: () => ({
    tickets: [],
    activeTicket: null,
    setActiveTicket: vi.fn(),
    ticketMap: new Map(),
    ticketById: new Map(),
    ticketsByProject: new Map(),
  }),
}));

vi.mock('../../context/project/ActiveProjectContext', () => ({
  useActiveProject: () => ({
    activeProjectId: '',
    activeProjectIdRef: { current: '' },
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

  function maliciousRichTextBody(): string {
    return JSON.stringify({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'Click me',
              marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)', title: null } }],
            },
            { type: 'image', attrs: { src: 'javascript:alert(2)', alt: 'evil', title: null } },
          ],
        },
      ],
    });
  }

  it('neutralizes a malicious link/image stored directly in a rich-text JSON doc', () => {
    render(<MarkdownContent text={maliciousRichTextBody()} />);

    const maybeLink = screen.queryByRole('link', { name: 'Click me' });
    if (maybeLink) {
      expect(maybeLink).toHaveAttribute('href', 'about:blank');
    }

    const maybeImg = screen.queryByAltText('evil') as HTMLImageElement | null;
    if (maybeImg) {
      expect(maybeImg.getAttribute('src') || '').not.toContain('javascript:');
    }
  });

  it('neutralizes a malicious link in a rendered ticket comment body', () => {
    const activeTicket = { id: 'ticket-1', key: 'GRA-1' } as unknown as Ticket;
    const comments = [
      {
        id: 'comment-1',
        ticketId: 'ticket-1',
        userId: 'user-1',
        body: maliciousRichTextBody(),
        createdAt: '2026-05-03T15:00:00.000Z',
        userName: 'Casey Carter',
      } as unknown as Comment,
    ];

    render(
      <TicketCommentsThread
        activeTicket={activeTicket}
        comments={comments}
        onAddComment={vi.fn()}
        onUpdateComment={vi.fn()}
        onDeleteComment={vi.fn()}
        copyToClipboard={vi.fn().mockResolvedValue(undefined)}
      />
    );

    const maybeLink = screen.queryByRole('link', { name: 'Click me' });
    if (maybeLink) {
      expect(maybeLink).toHaveAttribute('href', 'about:blank');
    }

    expect(document.querySelector('script')).not.toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain('javascript:');
  });
});
