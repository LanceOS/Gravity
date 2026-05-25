import { ticketTools } from './ticket-tools.js';
import { ToolHandler } from './types.js';
import { workspaceMemberTools } from './workspace-member-tools.js';

/**
 * @description Central registry used by the executor. Legacy aliases stay here
 * so the MCP schema and runtime behavior remain backward compatible.
 */
export const toolHandlers: Record<string, ToolHandler> = {
  list_tickets: (args, context) => ticketTools.listTickets(args, context),
  list_workspace_members: (args, context) => workspaceMemberTools.listWorkspaceMembers(args, context),
  get_ticket_details: (args, context) => ticketTools.getTicketDetails(args, context),
  create_ticket: (args, context) => ticketTools.createTicket(args, context),
  update_ticket: (args, context) => ticketTools.updateTicket(args, context),
  add_comment: (args, context) => ticketTools.createComment(args, context),
  create_comment: (args, context) => ticketTools.createComment(args, context),
  read_comments: (args, context) => ticketTools.readComments(args, context),
  delete_comment: (args, context) => ticketTools.deleteComment(args, context),
  update_comment: (args, context) => ticketTools.updateComment(args, context),
};
