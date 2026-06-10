import { Link as LinkIcon, GitBranch, FileText } from 'lucide-react';
import { serializeRichTextMarkdown } from '@library';
import type { TicketUtilitiesProps } from '../types/TicketUtilities';
import './TicketUtilities.css';

export default function TicketUtilities({ ticketLink, generatedBranchName, description, onCopy }: TicketUtilitiesProps) {
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
          title="Generated Branch Name"
          onClick={() => void onCopy(generatedBranchName, 'Branch name copied')}
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
