import { Link as LinkIcon, GitBranch, FileText } from 'lucide-react';
import type { TicketUtilitiesProps } from '../types/TicketUtilities';
import './TicketUtilities.css';

export default function TicketUtilities({ ticketLink, generatedBranchName, description, onCopy }: TicketUtilitiesProps) {
  return (
    <div className="ticket-utilities">
      <span className="ticket-utilities__title">
        Ticket Utilities
      </span>

      <div className="ticket-utilities__actions">
        <a
          href={ticketLink}
          target="_blank"
          rel="noreferrer"
          aria-label="Ticket link"
          title="Ticket Link"
          className="ticket-utilities__action ticket-utilities__link clickable"
        >
          <LinkIcon size={14} />
        </a>

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
          onClick={() => void onCopy(description || '', 'Description copied')}
          className="ticket-utilities__action ticket-utilities__copy-button clickable"
        >
          <FileText size={14} aria-hidden="true" focusable="false" />
        </button>
      </div>
    </div>
  );
}
