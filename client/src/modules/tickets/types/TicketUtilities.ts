export interface TicketUtilitiesProps {
  ticketLink: string;
  onCopyBranchName: () => Promise<void> | void;
  description?: string;
  onCopy: (value: string, successMessage?: string) => Promise<boolean> | void;
}

