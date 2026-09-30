# Agent Chat Architecture & Safeguards

This document outlines how the Gravity AI Assistant operates within the application, detailing the request flow, integrations with Large Language Models (LLMs), and the stringent security safeguards built into the system to support a multi-tenant SaaS architecture.

## Overview

Gravity provides users with a dedicated AI project management assistant that interacts with their workspace via chat. For workspace reads and mutations, the agent interacts with Gravity through the **Model Context Protocol (MCP)** rather than receiving unrestricted database access. This creates a sandboxed environment where the AI can only perform actions explicitly defined by our tool handlers (e.g., `list_tickets`, `create_ticket`).

The chat UI lives behind the workspace header "Ask Agent" control. Recent chat sessions appear as a compact header row, and the adjacent history menu opens the full previous-chat list for the active project. Users can also attach one or more tickets below the chat input; those ticket summaries are sent as read-only, model-only context for the next message and are not inserted into the visible transcript.

The system supports multiple providers including OpenAI, Anthropic, Gemini, and DeepSeek.

## Request Flow

1. **User Input:** The user submits a chat message from the frontend client. The client sends the current workspace ID and route’s project/team IDs as `navigationScope` with each turn (including retries and regeneration). Workspace-wide routes send empty lists rather than treating the fallback chat storage project as the selected project. Optional ticket attachments are serialized as supplemental context for that model turn.
2. **Session Selection:** Provider-backed project chats use a project-scoped chat session from `/api/v1/projects/:projectId/chats`. The frontend lazily creates a session when needed, or seeds `AgentChat` from a selected history item.
3. **Authentication & Routing:** Provider-backed project messages stream through `/api/v1/projects/:projectId/chats/:chatId/stream`, where project membership is validated. Direct one-off provider requests use `/api/v1/ai/chat` when callers need non-persisted completions.
4. **Credential Decryption:** The AI services use the configured credential path to securely decrypt provider API keys on the fly.
5. **Prompt Injection:** The backend injects a strict `systemPrompt` containing rules, identity, and forbidden actions before sending the context to the LLM. The prompt includes the workspace name/ID and current project names/IDs/keys and team names/IDs. The server resolves these from database records on every turn, verifies that the supplied workspace matches the chat workspace, checks selected project membership and team workspace membership, and rejects scopes outside the chat workspace. Project selections also include their owning teams. Clients without `navigationScope` default to the chat project and its team. Explicit empty lists indicate workspace-wide navigation; ambiguous operations require clarification. This navigation scope is model-only and distinct from the project that stores the chat session. Supplemental ticket context is appended to the current user message for the model request only.
6. **Tool Execution Loop:**
   - The LLM decides if it needs to call an MCP tool to fulfill the request.
   - If a tool is called, project chat calls the shared `executeTool` dispatcher.
   - The dispatcher validates tool arguments and authorization before invoking the registered handler.
7. **Tool Results:** Project chat returns authorized tool results as tool messages. Scope IDs are available for tool arguments but must not appear in user-facing responses.
8. **Persistence & Final Response:** Project chat sessions persist the visible user and assistant messages in `chat_sessions` and `chat_messages`. Model-only ticket context is not persisted in the visible message body. The LLM response is streamed back to the user and stored with the session.

## Limitations & Safeguards

To prevent data leakage, cross-tenant access, and abuse, the agent chat implements multiple layers of defense-in-depth security.

### 1. Internal identifiers
A legacy state-map utility supports temporary internal identifiers. Provider-backed project chat supplies resolved scope IDs to the model for tool arguments; the system prompt prohibits exposing those IDs in user-facing responses.
- **Legacy aliases:** `McpStateMap` can replace IDs with temporary aliases within an explicitly established workspace/actor scope. Outside such a scope, authorized IDs remain unchanged.
- **Retention:** Legacy maps are bounded to 1,000 scopes and 5,000 references per scope, with a one-hour inactivity expiry checked during access. They are not an authorization boundary.
- **Project chat:** The model receives canonical authorized IDs. Backend tool authorization, rather than ID hiding or prompt instructions, enforces access control.

### 2. Bounded generation
Prompt rules are backed by server-owned generation limits.
- The stream route limits requests per user/project. `GenerationBudget` bounds provider calls, tool calls, input bytes, output tokens, and elapsed time.
- Admission control limits concurrent generations per user and server process and prevents simultaneous generations for the same chat. These limits are separate from tool authorization.

### 3. Strict System Prompt Directives
The injected system prompt establishes non-negotiable rules for the AI's behavior:
- **No Chain of Thought:** The AI must execute tools silently and only output the final consolidated answer.
- **Bulk Action Prohibition:** The AI is strictly told it cannot perform bulk creation, deletion, or updates.
- **Error Handling:** If the AI is blocked by a rate limit or capability constraint, it is instructed to respond politely and directly without excessive apologies.

### 4. Cross-Tenant Isolation
The AI only operates within the bounds of the caller's active Workspace ID.
- Every project-chat tool call goes through `assertToolExecutionAllowed` with the server-resolved workspace and authenticated actor.
- Resource authorization rejects IDs or ticket keys outside that scope. Navigation context supplies defaults for the model; it cannot expand backend permissions.

## Navigation context regression checks

Run the focused chat service/API suites with Vitest (the server test setup forces `pgmem://gravity` and disables Redis), and the client `ChatContext` and `AppShellPage` suites. On Node 26, use `NODE_OPTIONS=--no-experimental-webstorage` for the client tests (runtime compatibility is tracked in GRAV-246). They cover current scope serialization, renamed scopes across turns, invalid/inaccessible selections, and keeping injected context out of stored and visible user messages. Chat remains project-backed: a project is required to store the session, even on a team/workspace view. The stateless `/ai/chat` endpoint has no navigation/session binding and is not used by the assistant UI.
