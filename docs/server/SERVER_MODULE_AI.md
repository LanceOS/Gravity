# Server AI Module

## 1. Purpose and Scope
The `ai` module (`server/src/modules/ai/`) handles all integrations with external artificial intelligence providers. It is responsible for formatting system prompts, executing chat completions, interpreting agent responses, and abstracting the provider differences (e.g., OpenAI vs. Anthropic vs. Ollama).

## 2. Non-Goals or Boundary Limits
- Does not store API keys directly; it relies on the `auth` module's KMS features to decrypt API credentials just-in-time.
- Does not expose MCP tools itself. It acts as an internal engine that other features might utilize.

## 3. Entry Points
- **REST Routes**: `src/modules/ai/routes.ts` mounted on `/api/v1/ai`. Allows clients to dispatch direct queries or list available models.
- **Provider Adapters**: `src/modules/ai/providers/` contains adapters for specific AI vendors.

## 4. Flow Steps
1. **Request Reception**: An AI chat completion is requested via REST (`POST /api/v1/ai/chat`).
2. **Credential Retrieval**: The module queries `src/modules/auth/kms/credential-manager.ts` to retrieve the active, decrypted API key for the requested provider (e.g., Anthropic).
3. **Execution**: The provider adapter translates the Gravity internal schema into the vendor's required payload, streaming the response back or returning the final generated text.
4. **Tool Use Translation**: If the model invokes a function, the adapter normalizes it to the system's standard tool-call schema.

## 5. Data Stores and Resources
- Reads provider-related configuration and user/workspace settings as needed to determine which AI provider and credentials should be used.
- Uses encrypted external provider credentials via `src/modules/auth/kms/credential-manager.ts`, which decrypts API keys just-in-time for outbound requests.
- Does not persist AI chat history in `ai_conversations` or `ai_messages`; the current module operates on request-time input and provider responses.

## 6. Interfaces and Contracts
- **`IAiProvider`**: Defined in `src/modules/ai/types.ts`. All new providers (e.g., Gemini, Ollama) must implement this interface to ensure standardized input/output formatting.

## 7. Key Files and Modules
- `routes.ts`: Exposes the AI chatting endpoints.
- `providers/openai.ts`: The OpenAI API adapter.
- `providers/anthropic.ts`: The Anthropic API adapter.
- `prompt-builder.ts`: Utilities for assembling consistent system prompts across different contexts.
- `types.ts`: Defines the generic AI interaction interfaces.

## 8. Permissions, Guards, or Tenant Boundaries
- Validates that the requesting user has the authority to use the configured workspace API keys. Falls back to user-level keys if allowed.

## 9. Failure Modes, Observability, or Operational Notes
- AI models have timeouts and rate limits. The adapters implement unified retry logic and map specific HTTP errors (e.g., 429 Too Many Requests) into standard application errors.

## 10. Change Hazards, Invariants, or Migration Constraints
- When a provider updates its models (e.g., GPT-4 to GPT-4o), the default configurations in the adapters must be updated carefully to prevent degrading performance.
- Changing `IAiProvider` requires updating all existing adapters concurrently.

## 11. Related Docs
- [SERVER_ARCHITECTURE_OVERVIEW.md](SERVER_ARCHITECTURE_OVERVIEW.md)
- [SERVER_MODULE_AUTH.md](SERVER_MODULE_AUTH.md)
