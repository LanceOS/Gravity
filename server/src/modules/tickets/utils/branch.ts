export function generateBranchName(ticketKey: string, title: string): string {
  const slug = (title || '')
    .toLowerCase()
    .replace(/[#*_`~>[\]{}()]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);

  return `feature/${ticketKey}-${slug || 'update-ticket'}`.toLowerCase();
}

export default generateBranchName;
