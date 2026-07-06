# Client User Interactions & Tools

## 1. Purpose and Scope
This document covers the primary user workflows and integrated tools provided by the React client. It specifically details the project management features (ticketing), global shortcuts, and AI tool integrations.

## 2. Non-Goals or Boundary Limits
- Server-side tool execution logic (e.g., how the MCP handles agent tools internally) is excluded.
- Auth screens and onboarding modals are excluded.

## 3. Entry Points
- **Ticketing Workflows**: `client/src/modules/tickets/components/` contains the core UI for creating, viewing, and modifying tickets.
- **AI Tools**: `client/src/modules/ai/components/AgentChat.tsx` provides the conversational interface to configured AI providers and project-aware agent tools.
- **Global Shortcuts**: Handled globally in `AppShellPage.tsx` `useEffect` listeners.

## 4. Flow Steps

### 4.1 Ticketing Workflow
1. **Creation**: Users press `N` on the keyboard or click "New Ticket" to open `CreateTicketModal`.
2. **Organization**: Users navigate to the active project in the Workspace layout. The active project's tickets are displayed in `TicketBoard` (Kanban layout) or `DenseGridController` (List layout).
3. **Detail View**: Clicking a ticket opens the `TicketDetail` sliding right panel. Here users can edit markdown descriptions (`MarkdownContent`), update status, or add comments.

### 4.2 AI Chat
1. **Invocation**: Users click the AI chat button in the sidebar or tools menu, which toggles the agent panel in `WorkspaceShellPage`.
2. **Conversation**: `AgentChat` renders in a slide-out panel and uses the provider configured via `AccountPreferencesPage`.
3. **MCP Integration**: Project chat requests are routed through the server chat API, which can invoke MCP tools on behalf of the assistant. Separately, `registerWebMCPTools` is called on app load from `AppShellPage` to expose browser-side tools (such as `list-tickets`, `create-ticket`, `update-ticket`, and `add-comment`) through WebMCP-capable APIs.

## 5. Data Stores and Resources
- **WebMCP**: Integrates local browser context (e.g., currently loaded tickets) into the AI chat interface seamlessly.

## 6. Interfaces and Contracts
- `AgentChat.tsx` acts as the primary boundary between human users and the AI assistant. It receives the active `workspaceId` and `projectId` as props, and the selected `aiProvider` is supplied via the `settings` prop.
- Global Keydown listener:
  ```typescript
  const target = event.target as HTMLElement;
  if (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    target.isContentEditable
  ) {
    return;
  }

  if (event.key === 'n' || event.key === 'N') {
    event.preventDefault();
    handleOpenCreateTicket();
  }
  ```

## 7. Key Files and Modules
- `client/src/modules/tickets/components/CreateTicketModal.tsx`
- `client/src/modules/tickets/components/TicketDetail.tsx`
- `client/src/modules/ai/components/AgentChat.tsx`
- `client/src/utils/webmcp.ts`

## 8. Permissions, Guards, or Tenant Boundaries
- AI Tools and WebMCP functions expose the client-side data currently supplied to `registerWebMCPTools`. In the current implementation, `getTickets()` returns the ticket set loaded for the active project context, while `getProjects()` can include all projects available to the signed-in user rather than being limited to the active workspace.

## 9. Failure Modes, Observability, or Operational Notes
- If the configured AI provider cannot be reached or the saved credential is invalid, the chat interface displays a connection error block prompting the user to check Account Preferences.
- Tool execution failures are displayed in the chat interface as error message blocks.

## 10. Change Hazards, Invariants, or Migration Constraints
- **Global Shortcuts**: When adding new keyboard shortcuts in `AppShellPage.tsx`, ensure that `event.target` is checked to prevent firing shortcuts while the user is typing or interacting in `INPUT`, `TEXTAREA`, `SELECT`, or `contenteditable` elements.

## 11. Related Docs
- [Client Routing & Flow](CLIENT_ROUTING_FLOW.md)
- [Client State Management](CLIENT_STATE_MANAGEMENT.md)
