import * as React from 'react';

declare const TicketUtilities: React.FC<{
  ticketLink: string;
  generatedBranchName: string;
  description?: string;
  ticketKey?: string;
  onCopy: (value: string, successMessage?: string) => Promise<void> | void;
}>;

export default TicketUtilities;
