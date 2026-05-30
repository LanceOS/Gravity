export interface TicketUtilitiesProps {
  ticketLink: string;
  generatedBranchName: string;
  description?: string;
  ticketKey?: string;
  onCopy: (value: string, successMessage?: string) => Promise<void> | void;
}

