import React from 'react';
import { Button } from '@library';

type Props = {
  ticketLink: string;
  generatedBranchName: string;
  description?: string;
  ticketKey?: string;
  onCopy: (value: string, successMessage?: string) => Promise<void> | void;
};

export default function TicketUtilities({ ticketLink, generatedBranchName, description, onCopy }: Props) {
  return (
    <div style={{ borderBottom: '1px solid var(--color-border-default)', paddingBottom: '12px', marginBottom: '4px' }}>
      <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-disabled)', textTransform: 'uppercase', display: 'block', marginBottom: '10px' }}>
        Ticket Utilities
      </span>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '10px' }}>
        <span className="label" style={{ marginBottom: 0 }}>Ticket Link</span>
        <a
          href={ticketLink}
          target="_blank"
          rel="noreferrer"
          aria-label="Ticket link"
          style={{
            fontSize: '11px',
            color: 'var(--color-primary)',
            textDecoration: 'none',
            wordBreak: 'break-all',
            lineHeight: '1.35'
          }}
          className="clickable"
        >
          {ticketLink}
        </a>
        <Button
          onClick={() => void onCopy(ticketLink, 'Ticket link copied')}
          variant="ghost"
          size="sm"
          style={{ alignSelf: 'flex-start', padding: '3px 8px', fontSize: '11px' }}
        >
          Copy Link
        </Button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '10px' }}>
        <span className="label" style={{ marginBottom: 0 }}>Generated Branch Name</span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--color-text-primary)', wordBreak: 'break-all', lineHeight: '1.35' }}>
          {generatedBranchName}
        </span>
        <Button
          onClick={() => void onCopy(generatedBranchName, 'Branch name copied')}
          variant="ghost"
          size="sm"
          style={{ alignSelf: 'flex-start', padding: '3px 8px', fontSize: '11px' }}
        >
          Copy Branch Name
        </Button>
      </div>

      <Button
        onClick={() => void onCopy(description || '', 'Description copied')}
        variant="ghost"
        size="sm"
        style={{ alignSelf: 'flex-start', padding: '3px 8px', fontSize: '11px' }}
      >
        Copy as Markdown
      </Button>
    </div>
  );
}
