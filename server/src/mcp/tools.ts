import { McpToolDefinition } from './types.js';

/**
 * Canonical tool metadata returned by MCP tools/list. Keep this aligned with
 * the executable registry so clients never see tools that cannot be dispatched.
 */
export const mcpToolsList: McpToolDefinition[] = [
  {
    name: 'list_tickets',
    description: 'Retrieve a list of tickets from the workspace with optional filters.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string' },
        priority: { type: 'string' },
        projectId: { type: 'string' },
        domainId: { type: 'string' },
        assigneeId: { type: 'string' },
        cycleId: { type: 'string' },
      },
    },
  },
  {
    name: 'list_workspace_members',
    description: 'Retrieve a list of members in a workspace, including their roles and last active times.',
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string' },
      },
      required: ['workspaceId'],
    },
  },
  {
    name: 'get_ticket_details',
    description: 'Retrieve detailed information for a specific ticket by its unique ticket key.',
    inputSchema: {
      type: 'object',
      properties: { ticketKey: { type: 'string' } },
      required: ['ticketKey'],
    },
  },
  {
    name: 'create_ticket',
    description: 'Create a new ticket or sub-ticket in the workspace.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        description: { type: 'string' },
        status: { type: 'string' },
        priority: { type: 'string' },
        projectId: { type: 'string' },
        domainId: { type: 'string' },
        cycleId: { type: 'string' },
        assigneeId: { type: 'string' },
        parentId: { type: 'string' },
      },
      required: ['title', 'projectId'],
    },
  },
  {
    name: 'update_ticket',
    description: 'Modify properties of an existing ticket by its unique ticket key.',
    inputSchema: {
      type: 'object',
      properties: {
        ticketKey: { type: 'string' },
        title: { type: 'string' },
        description: { type: 'string' },
        status: { type: 'string' },
        priority: { type: 'string' },
        assigneeId: { type: 'string' },
        domainId: { type: 'string' },
        cycleId: { type: 'string' },
        parentId: { type: 'string' },
        prStatus: { type: 'string' },
        prUrl: { type: 'string' },
      },
      required: ['ticketKey'],
    },
  },
  {
    name: 'add_comment',
    description: 'Create a new comment on an existing ticket.',
    inputSchema: {
      type: 'object',
      properties: {
        ticketKey: { type: 'string' },
        body: { type: 'string' },
      },
      required: ['ticketKey', 'body'],
    },
  },
  {
    name: 'create_comment',
    description: 'Create a new comment on an existing ticket.',
    inputSchema: {
      type: 'object',
      properties: {
        ticketKey: { type: 'string' },
        body: { type: 'string' },
      },
      required: ['ticketKey', 'body'],
    },
  },
  {
    name: 'read_comments',
    description: 'Read all comment threads on a specific ticket.',
    inputSchema: {
      type: 'object',
      properties: {
        ticketKey: { type: 'string' },
      },
      required: ['ticketKey'],
    },
  },
  {
    name: 'delete_comment',
    description: 'Delete a specific comment on a ticket.',
    inputSchema: {
      type: 'object',
      properties: {
        ticketKey: { type: 'string' },
        commentId: { type: 'string' },
      },
      required: ['ticketKey', 'commentId'],
    },
  },
  {
    name: 'update_comment',
    description: 'Update the text body of a specific comment on a ticket.',
    inputSchema: {
      type: 'object',
      properties: {
        ticketKey: { type: 'string' },
        commentId: { type: 'string' },
        body: { type: 'string' },
      },
      required: ['ticketKey', 'commentId', 'body'],
    },
  },
];
