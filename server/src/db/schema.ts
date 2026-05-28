import { customType } from 'drizzle-orm/pg-core';
import * as authSchema from '../modules/auth/schema.js';
import * as usersSchema from '../modules/users/schema.js';
import * as workspacesSchema from '../modules/workspaces/schema.js';
import * as ticketsSchema from '../modules/tickets/schema.js';
import * as mcpSchema from '../modules/mcp/schema.js';

export * from '../modules/auth/schema.js';
export * from '../modules/users/schema.js';
export * from '../modules/workspaces/schema.js';
export * from '../modules/tickets/schema.js';
export * from '../modules/mcp/schema.js';

export * from './types.js';

export const schema = {
  ...authSchema,
  ...usersSchema,
  ...workspacesSchema,
  ...ticketsSchema,
  ...mcpSchema,
};