import { Link as LinkIcon, GitBranch, FileText } from 'lucide-react';
import { serializeRichTextMarkdown } from '@library';
import type { TicketUtilitiesProps } from '../../types/TicketUtilities';
import './TicketUtilities.css';

export default function TicketUtilities({ ticketLink, onCopyBranchName, description, onCopy }: TicketUtilitiesProps) {
  return (
    <div className="ticket-utilities">
      <span className="ticket-utilities__title">
        Ticket Utilities
      </span>

      <div className="ticket-utilities__actions">
        <button
          type="button"
          aria-label="Copy Ticket Link"
          title="Copy Ticket Link"
          onClick={() => void onCopy(ticketLink, 'Ticket link copied')}
          className="ticket-utilities__action ticket-utilities__copy-button clickable"
        >
          <LinkIcon size={14} />
        </button>

        <button
          type="button"
          aria-label="Copy Branch Name"
          title="Copy branch name and move ticket to In Progress"
          onClick={() => void onCopyBranchName()}
          className="ticket-utilities__action ticket-utilities__copy-button clickable"
        >
          <GitBranch size={14} aria-hidden="true" focusable="false" />
        </button>

        <button
          type="button"
          aria-label="Copy as Markdown"
          title="Copy as Markdown"
          onClick={() => void onCopy(serializeRichTextMarkdown(description || ''), 'Description copied')}
          className="ticket-utilities__action ticket-utilities__copy-button clickable"
        >
          <FileText size={14} aria-hidden="true" focusable="false" />
        </button>
      </div>
    </div>
  );
}
