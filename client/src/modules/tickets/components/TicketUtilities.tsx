import React from 'react';
import { Button } from '@library';
import { Link as LinkIcon, GitBranch, FileText } from 'lucide-react';
import type { TicketUtilitiesProps } from '../types/TicketUtilities';

export default function TicketUtilities({ ticketLink, generatedBranchName, description, onCopy }: TicketUtilitiesProps) {
  return (
    <div style={{ borderBottom: '1px solid var(--color-border-default)', paddingBottom: '12px', marginBottom: '4px' }}>
      <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-disabled)', textTransform: 'uppercase', display: 'block', marginBottom: '10px' }}>
        Ticket Utilities
      </span>

      <div style={{ display: 'flex', flexDirection: 'row', gap: '10px', alignItems: 'center', marginBottom: '8px' }}>
        <a
          href={ticketLink}
          target="_blank"
          rel="noreferrer"
          aria-label="Ticket link"
          title="Ticket Link"
          className="clickable"
          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '6px', borderRadius: '6px', color: 'var(--color-primary)' }}
        >
          <LinkIcon size={14} />
        </a>

        <Button
          aria-label="Copy Branch Name"
          title="Generated Branch Name"
          onClick={() => void onCopy(generatedBranchName, 'Branch name copied')}
          variant="ghost"
          size="sm"
          leftIcon={<GitBranch size={14} />}
          style={{ padding: '6px' }}
        />

        <Button
          aria-label="Copy as Markdown"
          title="Copy as Markdown"
          onClick={() => void onCopy(description || '', 'Description copied')}
          variant="ghost"
          size="sm"
          leftIcon={<FileText size={14} />}
          style={{ padding: '6px' }}
        />
      </div>
    </div>
  );
}
