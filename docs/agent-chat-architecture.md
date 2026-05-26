# Agent Chat Architecture & Safeguards

This document outlines how the Gravity AI Assistant operates within the application, detailing the request flow, integrations with Large Language Models (LLMs), and the stringent security safeguards built into the system to support a multi-tenant SaaS architecture.

## Overview

Gravity provides users with a dedicated AI project management assistant that interacts with their workspace via chat. Rather than giving the AI unrestricted access to the database, the agent interacts with Gravity exclusively through the **Model Context Protocol (MCP)**. This creates a sandboxed environment where the AI can only perform actions explicitly defined by our tool handlers (e.g., `list_tickets`, `create_ticket`).

The system supports multiple providers including OpenAI, Anthropic, Gemini, DeepSeek, and local Ollama models.

## Request Flow

1. **User Input:** The user submits a chat message from the frontend client.
2. **Authentication & Routing:** The request hits the backend `/api/v1/ai/chat` endpoint, where user session and workspace authorization are validated.
3. **Credential Decryption:** The `AiService` uses the `CredentialManager` to securely decrypt the user's configured API keys on the fly.
4. **Prompt Injection:** The backend injects a strict `systemPrompt` containing rules, identity, and forbidden actions before sending the context to the LLM.
5. **Tool Execution Loop:**
   - The LLM decides if it needs to call an MCP tool to fulfill the request.
   - If a tool is called, the request routes through the `McpRequestHandler`.
   - The handler verifies authorization and proxies the request to the specific tool class (e.g., `TicketTools`).
6. **State Sanitization:** Before the tool output is returned to the LLM, it passes through the `StateMap` sanitization layer (see Safeguards below).
7. **Final Response:** The LLM receives the sanitized tool output and synthesizes a final, human-readable response back to the user.

## Limitations & Safeguards

To prevent data leakage, cross-tenant access, and abuse, the agent chat implements multiple layers of defense-in-depth security.

### 1. Zero-Exposure State Map
The AI is completely blinded to actual internal database primary keys and UUIDs.
- **Sanitization:** When MCP tools return data to the LLM, the `StateMap` strips out raw database IDs and replaces them with temporary aliases (e.g., mapping `p-eeebd7ff...` to `Temp-Project-A`).
- **Desanitization:** When the LLM calls a tool using a temporary ID, the `McpRequestHandler` translates it back to the real database UUID before the tool executes.
- **Current scope/retention:** The current implementation stores these mappings in process-wide in-memory maps. They are not scoped to an individual user session and are retained until explicitly overwritten, the process restarts, or the implementation performs cleanup.
- **Why:** This prevents the LLM from seeing raw internal identifiers directly, reducing accidental leakage and making identifier guessing/enumeration harder, but it should not be relied on as a per-session isolation boundary by itself.

### 2. Hard Rate Limiting
Even with strict prompts, LLMs can be jailbroken into attempting bulk operations.
- Tool handlers (like `createTicket` in `TicketTools`) enforce backend rate limits by requiring at least 3000ms between ticket creations per user; requests made sooner are rejected rather than delayed.
- If the AI attempts to rapidly create or delete multiple tickets, the backend will reject subsequent requests with a `Rate limit exceeded` error, protecting database integrity.

### 3. Strict System Prompt Directives
The injected system prompt establishes non-negotiable rules for the AI's behavior:
- **No Chain of Thought:** The AI must execute tools silently and only output the final consolidated answer.
- **Bulk Action Prohibition:** The AI is strictly told it cannot perform bulk creation, deletion, or updates.
- **Error Handling:** If the AI is blocked by a rate limit or capability constraint, it is instructed to respond politely and directly without excessive apologies.

### 4. Cross-Tenant Isolation
The AI only operates within the bounds of the caller's active Workspace ID.
- Every MCP tool call asserts that the requested resource (e.g., a `projectId` or `ticketKey`) belongs to the authenticated user's workspace.
- Even if the AI guesses a valid ID belonging to another tenant, the `assertProjectInWorkspace` (and similar guards) will block the execution with an `Unauthorized` error.
