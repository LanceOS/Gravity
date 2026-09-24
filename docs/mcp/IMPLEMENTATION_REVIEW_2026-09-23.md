**Gravity MCP implementation review — September 23, 2026**

Original review: commit `fd036597`. Scope: server HTTP and stdio transports, connection credentials, authorization, tool schemas and handlers, internal AI tool execution, browser WebMCP, settings, realtime updates, and tests. The original review did not change application code. Its findings and validation below describe that snapshot; the implementation status immediately below records the subsequent repair work.

The original implementation had several independent connection blockers and unsafe mutation paths. The review recommended a functioning connection lifecycle and a shared, validated execution boundary before adding discovery and focused mutation tools.

**Implementation status — September 23, 2026**

The repair branch `codex/mcp-reliability-and-granularity` now implements the core reliability and granularity changes. The server advertises **38 canonical tools**, retaining legacy aliases for invocation. The historical inventory and numbered findings below should not be read as the current implementation. Current connection instructions are in [Transports](TRANSPORTS.md); the execution architecture is documented in [MCP Flow](MCP_FLOW.md).

| Original findings | Implemented behavior |
| --- | --- |
| 1: relationship isolation | Shared ticket creation/update validates cycle ownership by the project's team and parent ownership by project; self/ancestor cycles are rejected. Project locks serialize hierarchy writes. Expanded ticket reads constrain related resources. Moving a ticket detaches its parent and direct children and clears incompatible cycle/label references. |
| 2, 12–14: safe arguments and mutations | Strict runtime JSON Schema validation runs before execution. Explicit null clears nullable relationships. Label discovery returns stable IDs in the correct project/team scope; typed arrays are supported with legacy strings retained. Missing or wrongly typed label replacements fail without writes, duplicate labels are deduplicated, and additive/removal operations target exact IDs. Explicit dependency removal and preview never substitute the reverse edge. |
| 3, 15: permissions and catalog | Execution rechecks workspace settings, canonical aliases, connection scopes, and current database membership. Broad legacy update calls respect disabled focused field operations. Settings, connection scope selection, browser tools, and provider discovery use the registered catalog. Members can issue exact read scopes; connection-token writes require current owner/admin permission. |
| 4, 9: chat/provider integration | Saved tool exchanges replay as assistant calls and tool results, with names and call IDs, rather than as system instructions. Gemini receives function response names, groups parallel responses in one user turn, preserves original call IDs/parts/signatures, and uses `parametersJsonSchema` for the expanded schemas. |
| 5–7: working transports | Reusable credentials, explicit tool grants, opt-in IP binding, connection inventory/revocation, and complete configuration export support ordinary clients. Stateless Streamable HTTP implements lifecycle notifications, ping, version negotiation, and JSON responses. Standalone stdio initializes the registry, uses the corrected launch path and newline-delimited messages, and keeps logs off stdout. |
| 8, 10–11: browser and realtime | Same-user realtime events trigger refreshes. Browser WebMCP discovers canonical server tools through `document.modelContext` and awaits their server-confirmed results. Registration cleanup uses AbortSignal; the older optional explicit cleanup method is only a compatibility fallback. |
| 16: result contracts | Successful tool responses include text plus a structured `{data: ...}` envelope and an output schema. Domain failures use `result.isError` with structured error information; malformed calls and authorization failures remain JSON-RPC errors. |
| Additional operational gaps | Stable authorized IDs are the default. Optional temporary references are scoped by workspace/actor, bounded, and expire. HMAC rotation covers API-issued credentials, and token verification compares the observed token hash atomically so a concurrent refresh cannot authenticate a stale token. An optional Redis pubsub bridge relays MCP mutation events between stdio and HTTP processes without echo loops; local delivery still works when Redis is unavailable. |

New discovery tools cover workspace, projects, teams, cycles, canonical ticket options, and eligible assignees. Focused actions cover status, priority, assignment/unassignment, cycle and parent setting/clearing, content, PR fields, and project movement. `search_tickets` returns bounded pages with a continuation cursor and explicit workspace/project/team scope. `list_tickets` keeps its array result for compatibility, with a default of 50 and a maximum of 100 tickets per call.

The final cross-review also closed stale-membership and token-refresh races, ensured explicit bearer credentials constrain requests even with an authenticated cookie, and prevented prototype-shaped sanitized arguments from bypassing field policy. Concurrent ticket moves validate the current locked record; stale move/delete attempts fail without success events. Hierarchy changes publish fresh snapshots for detached children and affected parents. Settings show inherited disablement while preserving each tool's independent setting.

The subsequent [PR-style review](PR_REVIEW_2026-09-23.md) fixed parent-cache propagation, label-move conflict reporting, project-cycle consistency, asynchronous browser registration, legacy HMAC secret parsing, standalone container dependencies, stdio cleanup, and Redis channel isolation. It also corrected the existing branch-name separator failure and a legacy cycle schema constraint discovered in the restored test deployment.

**Latest validation of the repair work:**

- `npm run -w server test`: **364 tests passed across 54 suites**. This includes official MCP SDK initialize → discovery → read → create → read flows over HTTP and a separate stdio process, plus authorization, mutation, concurrency, provider, schema, migration, shutdown, and rate-limit regressions.
- `npm run -w server build`: passed. Client `tsc -b` and the final client application typecheck passed. `git diff --check` passed.
- `NODE_OPTIONS=--no-experimental-webstorage npm run -w client test`: **667 passed across 107 suites** before the later modal improvements. The latest modal changes pass **9 focused tests** and client TypeScript compilation. The existing underscore separator failure is fixed in both client and server branch utilities.
- MCP realtime end-to-end tests: **5/5 passed**, including same-user external mutations.
- Production frontend and backend images build successfully in Docker, including real Vite bundles and server compilation. The earlier host-native Vite/Rolldown illegal-instruction crash does not affect the container build; fallback assets were not used.
- Live PostgreSQL/Redis checks on `gravity-test-prod` verify MCP lifecycle, 38-tool discovery, reads/writes, parent clearing, project team movement, schema/policy rejection, credential revocation, and separate-process event delivery. Independent Redis checks verify database/namespace isolation; EOF/SIGTERM/SIGINT close the compiled stdio server cleanly. Final deployment details are recorded in the follow-up review.

**Remaining limits and deferred work**

- Connection grants are workspace-wide. Project-specific grants and richer per-resource restrictions are not implemented. `create_ticket` and legacy `update_ticket` remain broad operations, including timestamp overrides; users needing narrow authority should grant only the focused tools.
- The registry provides a common structured result envelope, but nested per-tool output schemas remain broad. Full project/team/cycle/label administration and notes CRUD/search are separate future product work.
- Search uses deterministic ordering and an offset-based continuation token, not a snapshot. Concurrent insertions, deletions, moves, or timestamp edits can shift page boundaries. Expanded detail/comment/label/member discovery is not fully paginated.
- Existing invalid database relationships are not migrated automatically. New writes reject incompatible references and the repaired ticket-detail reads constrain related data; historical data repair needs a separate audit.
- Redis pubsub is best-effort and requires Redis to be enabled and shared by the processes, with matching database and deployment namespace. It has no durable outbox or replay; disconnected consumers must reload current state. Live PostgreSQL concurrency and a full multiple-HTTP-replica deployment remain untested; concurrency regressions use the test database adapter.
- Browser registration is tested with mocks against the current draft API. A live supported WebMCP browser and live external model round trips remain unverified.
- Legacy temporary references remain process-local and cannot survive restart or requests routed to a different replica. Stable IDs avoid that limitation.

**WebMCP correction:** the September 17, 2026 draft supports `document.modelContext.registerTool(tool, { signal })`; aborting the signal removes the registration. `unregisterTool` is not required by that API. The original finding about `navigator.modelContext` was valid; any implication that the second registration argument was itself obsolete was incorrect. [WebMCP registration options](https://webmachinelearning.github.io/webmcp/#dictdef-modelcontextregistertooloptions).

**Original architecture and inventory**

| Entry point | Actual execution path | Significant difference |
| --- | --- | --- |
| External HTTP MCP | `/api/v1/mcp/sse` → session/token authentication → request handler → executor → domain handler | Handwritten JSON-RPC over POST; no complete standard transport lifecycle |
| Standalone stdio | stdio session → request handler → executor | No tool registry bootstrap; framing and logging are incompatible with standard MCP stdio |
| Built-in AI chat | chat service → provider → executor → domain handler | Skips the MCP request handler and its call-time policy enforcement |
| Browser WebMCP | browser registration → React actions → REST mutations | Separate names, schemas, availability checks, and completion semantics |

The server advertises **25 names representing 19 distinct operations**. The six redundant names come from duplicate ticket-detail, comment-create, and dependency-add/remove entry points. Browser WebMCP exposes six separate hyphenated names. Workspace settings contain nine hardcoded toggles.

| Capability | Advertised names | Distinct operations |
| --- | --- | ---: |
| Tickets | `list_tickets`, `get_ticket_details`, `read_ticket_details`, `create_ticket`, `update_ticket`, `delete_ticket` | 5 |
| Dependencies | `mark_ticket_blocked`, `add_ticket_dependency`, `add_dependency`, `unmark_ticket_blocked`, `remove_ticket_dependency`, `remove_dependency`, `preview_ticket_dependency`, `list_ticket_dependencies` | 4 |
| Comments | `add_comment`, `create_comment`, `read_comments`, `update_comment`, `delete_comment` | 4 |
| Ticket labels | `get_ticket_labels`, `add_ticket_labels`, `remove_ticket_labels`, `set_ticket_labels` | 4 |
| Label discovery | `list_workspace_labels` | 1 |
| Members | `list_workspace_members` | 1 |

Catalog sources: [ticket definitions](/home/lance/Documents/Code/Gravity/server/src/modules/tickets/mcp.ts:1485), [workspace definitions](/home/lance/Documents/Code/Gravity/server/src/modules/workspaces/mcp.ts:141), [browser registrations](/home/lance/Documents/Code/Gravity/client/src/utils/webmcp.ts:19), [settings catalog](/home/lance/Documents/Code/Gravity/client/src/modules/settings/components/McpToolsSection.tsx:11).

**Original prioritized findings**

P1 means a connection blocker, access-control failure, or unsafe mutation that should be fixed before expanding access. P2 means a material correctness or capability defect. “Reproduced” means a local probe exercised the implementation; “traced” means verified in the code path, without a production-client experiment.

1. **P1 — Ticket relationships can cross workspace boundaries. Reproduced.**

   `update_ticket` checks the ticket's project, then forwards `cycleId` and `parentId` without checking the referenced resources. The shared ticket service writes these IDs and later fetches cycles/children without an independent tenant constraint. A ticket in workspace A was assigned a cycle from workspace B, and its details exposed that cycle's name and dates. A cross-workspace parent was accepted, and reading that parent exposed the foreign child. A self-parent was also accepted. Exploitation requires a referenced ID; those IDs are not authorization controls. This is a shared domain-service defect exposed through MCP.

   References: [MCP update](/home/lance/Documents/Code/Gravity/server/src/modules/tickets/mcp.ts:314), [relationship writes](/home/lance/Documents/Code/Gravity/server/src/modules/tickets/services/tickets.ts:1038), [related-resource reads](/home/lance/Documents/Code/Gravity/server/src/modules/tickets/services/tickets.ts:718). Validate cycle/team/workspace compatibility and parent scope and acyclicity in the shared service, for both create and update.

2. **P1 — Invalid tool arguments can silently remove data. Reproduced.**

   The executor does not validate arguments against the advertised schema. `set_ticket_labels({ticketKey: "A-1"})`, with the required `labels` missing, reaches a fallback empty array and clears existing labels successfully. Wrongly typed values take the same fallback. Schema declarations currently guide the model but do not protect writes.

   References: [executor](/home/lance/Documents/Code/Gravity/server/src/modules/mcp/tool-executor.ts:20), [fallback and write](/home/lance/Documents/Code/Gravity/server/src/modules/tickets/mcp.ts:1270). Use shared runtime schemas and reject malformed calls before mutation. Distinguish omitted arguments from an explicit empty set.

3. **P1 — Workspace tool disablement is not consistently enforced. Reproduced for chat; traced for aliases/browser.**

   Chat filters the advertised tools once, but dispatches every model-returned name directly to `executeTool`. A temporary probe disabled a registered tool, confirmed that the model received an empty tool list, then returned that tool name from the mock model: its real registered handler still executed. Normal MCP also omits the `get_ticket_details` / `read_ticket_details` alias pair from disablement groups, so disabling the UI's detail reader leaves its equivalent callable. Browser WebMCP does not consult these settings.

   References: [chat discovery filter](/home/lance/Documents/Code/Gravity/server/src/modules/chats/services/chat-service.ts:474), [chat dispatch](/home/lance/Documents/Code/Gravity/server/src/modules/chats/services/chat-service.ts:660), [alias policy](/home/lance/Documents/Code/Gravity/server/src/modules/mcp/request-handler.ts:16), [WebMCP registration](/home/lance/Documents/Code/Gravity/client/src/utils/webmcp.ts:19). Enforce canonical capability authorization at execution, across all entry points; do not depend on which tools were shown to the model.

4. **P1 — Tool-returned content becomes system instructions on subsequent chat turns. Reproduced.**

   The chat loop persists tool output as a `system` message. The next turn replays the stored role unchanged. Ticket descriptions, comments, and other user-authored content are consequently promoted into the instruction channel. Anthropic and Gemini adapters concatenate these messages into their system prompt. A two-turn probe confirmed a marker from tool data appeared as `role: "system"` in the next provider request. The probe verifies the trust-boundary error, not a particular model's response to an injection.

   References: [persistence](/home/lance/Documents/Code/Gravity/server/src/modules/chats/services/chat-service.ts:582), [history replay](/home/lance/Documents/Code/Gravity/server/src/modules/chats/services/chat-service.ts:337), [Anthropic system construction](/home/lance/Documents/Code/Gravity/server/src/modules/ai/providers/anthropic-provider.ts:11). Persist and reconstruct tool calls/results as tool data, with IDs and names, separately from application instructions.

5. **P1 — The UI-generated external connection cannot support a normal MCP workflow. Traced, with token behavior covered by existing tests.**

   The modal submits only `{ttlSeconds: 300}`. That gives it discovery-only `tools/list` scope, a single-use credential, and the issuing browser's IP restriction. There are three separate blockers: no tool invocation is authorized, even for read tools; the first authenticated request consumes the credential, including `initialize`; and an external client on a different observed IP is rejected before use. There is no exchange that replaces the one-use credential with a session credential. Changing only one default leaves the other blockers intact. The UI also copies only the raw token rather than a complete client configuration.

   References: [modal request](/home/lance/Documents/Code/Gravity/client/src/modules/workspaces/components/WorkspaceMcpModal.tsx:27), [default scopes](/home/lance/Documents/Code/Gravity/server/src/modules/workspaces/routes.ts:72), [issuance defaults](/home/lance/Documents/Code/Gravity/server/src/modules/workspaces/routes.ts:1512), [IP check and consumption](/home/lance/Documents/Code/Gravity/server/src/modules/mcp/connection.ts:273), [per-request verification](/home/lance/Documents/Code/Gravity/server/src/modules/mcp/router.ts:111). Define a real multi-request credential/session lifecycle, choose explicit callable capabilities in the UI, and make IP restrictions an intentional deployment option. Export endpoint, workspace, headers, and credentials together.

6. **P1 — Standalone stdio is broken at startup, discovery, and wire format. Reproduced/traced.**

   The npm command points to nonexistent `src/mcp/stdio.ts`; the file lives under `src/modules/mcp`. The actual entry point never bootstraps the registries, which are initialized only by `createApp`: a fresh import left both definitions and handlers empty. Responses default to `Content-Length` framing. Every executed tool also writes an audit record through `console.info` to protocol stdout. These are independent defects: correcting the package script alone does not yield a usable server.

   References: [npm command](/home/lance/Documents/Code/Gravity/server/package.json:18), [stdio startup](/home/lance/Documents/Code/Gravity/server/src/modules/mcp/stdio.ts:24), [registry initialization](/home/lance/Documents/Code/Gravity/server/src/app.ts:41), [framing](/home/lance/Documents/Code/Gravity/server/src/modules/mcp/stdio-session.ts:399), [audit dispatch](/home/lance/Documents/Code/Gravity/server/src/modules/mcp/tool-executor.ts:26), [logging sink](/home/lance/Documents/Code/Gravity/server/src/lib/logger.ts:95). Standard stdio requires newline-delimited MCP messages and reserves stdout for protocol traffic. [MCP transport specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports).

7. **P2 — The HTTP endpoint implements only part of an MCP transport/lifecycle. Handler responses reproduced.**

   The endpoint is POST-only; it neither implements legacy HTTP+SSE establishment nor a complete Streamable HTTP boundary. `notifications/initialized` receives a JSON-RPC error with `id: null`, rather than being accepted without a response; `ping` receives `-32601`. Initialization always advertises `2024-11-05`, while protocol-version headers are ignored. Returning an older supported version is not inherently invalid, and JSON POST responses are permitted; the missing lifecycle and transport behavior are the defects.

   References: [router](/home/lance/Documents/Code/Gravity/server/src/modules/mcp/router.ts:53), [initialize and method handling](/home/lance/Documents/Code/Gravity/server/src/modules/mcp/request-handler.ts:73). Select an explicitly supported standard transport, implement its notification/version/GET behavior, and test with a standard client. [MCP transports](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports), [MCP lifecycle](https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle).

8. **P1 — External MCP changes made on a user's behalf are discarded by that user's browser. Traced.**

   External tokens execute as their issuer. The realtime client drops every event whose `actorUserId` matches the current user, assuming the current tab already applied the change. External tools and other sessions do not update that tab's cache. A successful write can therefore look like a failed tool until a refresh. Existing tests deliberately assert this same-user filtering, while the MCP SSE fixture uses different agent and viewer identities.

   References: [issuer identity](/home/lance/Documents/Code/Gravity/server/src/modules/mcp/router.ts:129), [event suppression](/home/lance/Documents/Code/Gravity/client/src/context/realtime/RealtimeContext.tsx:251). Suppress only writes confirmed as originating from this client/request, or allow safe invalidation for same-user external events.

9. **P1 — Gemini tool results omit the required function name. Reproduced payload defect.**

   Chat constructs tool messages with `tool_call_id` but no `name`. The Gemini adapter reads `m.name`, so JSON serialization drops `functionResponse.name`. A probe through the real chat loop and Gemini adapter captured this malformed second request. The existing provider test manually supplies `name`, masking the integration defect. No live provider call was needed or made.

   References: [tool message construction](/home/lance/Documents/Code/Gravity/server/src/modules/chats/services/chat-service.ts:575), [Gemini response mapping](/home/lance/Documents/Code/Gravity/server/src/modules/ai/providers/gemini-provider.ts:124), [test fixture](/home/lance/Documents/Code/Gravity/server/tests/ai-providers.test.ts:449). Preserve names and call IDs through the shared message model. The API requires a function-response name. [Gemini API reference](https://ai.google.dev/api/generate-content#FunctionResponse).

10. **P1 — Browser WebMCP registration targets an obsolete interface. Traced against current documentation.**

    Detection and registration use `navigator.modelContext`. Current WebMCP documentation defines `document.modelContext`; a browser exposing only that interface is treated as unsupported and receives no tools. Update both feature detection and registration, then verify registration, unregistration, and navigation in a supported browser. Correction after implementation: the September 17, 2026 draft supports the second `{ signal }` registration argument and unregisters tools when its signal is aborted; an explicit `unregisterTool` method is not required. See the implementation-status correction above.

    References: [feature detection](/home/lance/Documents/Code/Gravity/client/src/modules/workspaceShellPage/hooks/useWebMcpRegistration.ts:22), [registration](/home/lance/Documents/Code/Gravity/client/src/utils/webmcp.ts:21). [Chrome registration documentation](https://developer.chrome.com/docs/lighthouse/agentic-browsing/registered-webmcp-tools), [WebMCP specification](https://webmachinelearning.github.io/webmcp/#extensions-to-the-document-interface). This was a compatibility review, not a live-browser conformance test.

11. **P2 — Browser ticket updates report success before persistence, including on failed writes. Traced.**

    `update-ticket` awaits the React action and returns a success message, but the action's default branch starts `mutateAsync` with `void`, catches errors internally, and returns immediately. A rejected PATCH can roll back the UI after the agent was told the update succeeded. Browser ticket creation also advertises `labelId`, while the REST route reads `labelIds`, silently losing the requested label.

    References: [tool success response](/home/lance/Documents/Code/Gravity/client/src/utils/webmcp.ts:84), [mutation completion](/home/lance/Documents/Code/Gravity/client/src/context/ticket/TicketMutationContext.tsx:250), [label argument](/home/lance/Documents/Code/Gravity/client/src/utils/webmcp.ts:54), [REST creation](/home/lance/Documents/Code/Gravity/server/src/modules/tickets/routes.ts:334). Tool actions need a server-confirmed result and propagated failure, using the same typed request contracts as REST.

12. **P2 — Generic updates cannot clear assignment, cycle, or parent relationships. Cycle case reproduced.**

    `update_ticket` forwards these fields only when they are strings, dropping explicit `null`. Passing `cycleId: null` left the old cycle intact while the call succeeded. The schema also advertises strings only. Omission must mean “leave unchanged”; null must mean “clear” where supported. Focused unassign/clear/detach tools can expose that behavior more clearly.

    Reference: [field forwarding](/home/lance/Documents/Code/Gravity/server/src/modules/tickets/mcp.ts:328).

13. **P2 — Label discovery is inconsistent with hierarchy and mutation inputs. Team case reproduced.**

    `list_workspace_labels({projectId})` queries only project-owned labels. In teams mode, valid labels are team-owned with a null project ID, so a project-specific lookup returns none while the workspace lookup finds them. Both catalog branches omit label IDs, yet list/create/update ticket tools ask for label IDs. Label-specific mutations instead ask for names. Agents cannot reliably discover and pass the required references.

    References: [project label lookup](/home/lance/Documents/Code/Gravity/server/src/modules/tickets/mcp.ts:1123), [catalog fields](/home/lance/Documents/Code/Gravity/server/src/modules/tickets/mcp.ts:1144), [generic label schema](/home/lance/Documents/Code/Gravity/server/src/modules/tickets/mcp.ts:1497). Reuse hierarchy-aware label discovery and return stable IDs plus names, scope, and color. Use typed arrays consistently.

14. **P2 — Directional dependency removal can delete the reverse relation. Traced.**

    If A does not block B but B blocks A, an explicitly directed removal of A → B falls back to the reverse relationship and removes B → A. That fallback is reasonable only for a separately documented undirected operation. The directed tool should report that the requested relation is absent.

    Reference: [reverse fallback](/home/lance/Documents/Code/Gravity/server/src/modules/tickets/mcp.ts:777). Keep canonical directional arguments and validate preview/removal against the same exact edge.

15. **P2 — Permission controls expose neither the full catalog nor useful field/resource restrictions. Traced.**

    Nine hardcoded UI toggles omit ticket deletion, label operations, and dependency operations. The connection modal cannot choose per-tool scopes although the server accepts them. `tools/list` filters workspace-disabled names but not the connection's callable scopes, advertising actions the token cannot perform. Granting `update_ticket` permits title, description, assignment, status, priority, labels, relationships, PR fields, and timestamp overrides together. There is no token-level “status changes only” or project restriction.

    References: [UI catalog](/home/lance/Documents/Code/Gravity/client/src/modules/settings/components/McpToolsSection.tsx:11), [discovery filter](/home/lance/Documents/Code/Gravity/server/src/modules/mcp/request-handler.ts:96), [update surface](/home/lance/Documents/Code/Gravity/server/src/modules/tickets/mcp.ts:1559). Generate settings and discovery from canonical capabilities. If discovery-only tokens intentionally show unavailable tools, make that distinction explicit; for normal agent connections advertise actionable tools.

16. **P2 — Tool failures are not represented consistently for clients. Traced.**

    Most handler exceptions become `-32603`; structured domain failures can instead be wrapped as successful text results without `isError`. The server exposes no output schemas, and the internal chat path converts failures into free-form strings. This makes repair, retries, and reliable client interpretation harder.

    References: [result and error wrappers](/home/lance/Documents/Code/Gravity/server/src/modules/mcp/request-handler.ts:152), [chat error conversion](/home/lance/Documents/Code/Gravity/server/src/modules/chats/services/chat-service.ts:669). Separate malformed protocol requests from domain execution failures, and expose stable error codes/details through structured results. [MCP tool error semantics](https://modelcontextprotocol.io/specification/2025-11-25/server/tools#error-handling).

**Additional architecture and operational gaps**

- **Discovery is insufficient to start useful work.** Creating a ticket requires a project ID, yet there is no project discovery tool. Cycle IDs and eligible assignees have similar gaps. Workspace-member discovery is not the same as project-assignee eligibility.
- **Read access is coarse at credential issuance.** Even exact scopes for read-only tool calls require workspace owner/admin; ordinary members can obtain only discovery. Define intentional role-aware read/write profiles before exposing scope selection. [scope authorization](/home/lance/Documents/Code/Gravity/server/src/modules/workspaces/routes.ts:113).
- **Ticket querying lacks bounds and useful selectors.** MCP drops pagination supported by the underlying service and has no search text, date range, parent, or team selector. Add bounded pages with a continuation token, deterministic ordering, and explicit returned scope. [MCP filters](/home/lance/Documents/Code/Gravity/server/src/modules/tickets/mcp.ts:116).
- **Browser ticket listing describes broader data than it returns.** `list-tickets` claims workspace scope but receives the active project's cached list, which can also retain the previous project's data during transitions. Return explicit project/scope metadata and query authoritative data for broader requests. [registration input](/home/lance/Documents/Code/Gravity/client/src/modules/workspaceShellPage/screens/WorkspaceShellPage.tsx:1093), [cached ticket list](/home/lance/Documents/Code/Gravity/client/src/context/ticket/TicketListContext.tsx:43).
- **Connection recovery lacks a usable UI.** The revoke hook has no caller, and clipboard failure still clears the sole displayed raw token. Add connection inventory, revoke, scope/expiry selection, and a configuration export that remains available until successfully copied. [copy handling](/home/lance/Documents/Code/Gravity/client/src/modules/workspaces/components/WorkspaceMcpModal.tsx:53), [revoke hook](/home/lance/Documents/Code/Gravity/client/src/hooks/useWorkspaceMcp.ts:15).
- **Realtime events are process-local.** The event bus and SSE client map live in memory. Once standalone stdio works, its writes will still not reach the separately running HTTP process's subscribers. Multiple HTTP replicas have the same issue. Use a cross-process event channel or durable outbox when these deployment modes are supported. [event bus](/home/lance/Documents/Code/Gravity/server/src/lib/mcp-event-bus.ts:128), [SSE bridge](/home/lance/Documents/Code/Gravity/server/src/realtime.ts:255).
- **Temporary-ID sanitization is process-global.** Maps are static, shared across sessions, unbounded, and not durable. A sanitized reference cannot reliably survive restarts or a request reaching another replica, and should not be treated as an authorization or privacy boundary. Prefer stable authorized references, or explicitly scoped durable session mappings. [state maps](/home/lance/Documents/Code/Gravity/server/src/modules/mcp/state-map.ts:6).
- **Keyed HMAC rotation has an uncovered production path.** A local probe issued a token with the default `hmacKeyId = "env"`, rotated the current secret, and retained the old secret as `old=<secret>`: verification failed. Retaining the same old secret as a plain value succeeded. Existing keyed tests manually issue a key ID different from the normal API's default. [key selection and fallback](/home/lance/Documents/Code/Gravity/server/src/modules/mcp/connection.ts:220). Add a test covering tokens minted by the actual endpoint across rotation.
- **Registry and policy metadata are duplicated.** Definitions, handlers, alias groups, chat filtering, prompt descriptions, and settings lists can drift independently. The stdio bootstrap omission and missing alias rule are concrete results of that design.
- **Documentation describes outdated paths and behavior.** `MCP_FLOW.md` still references `server/src/mcp` and `server/src/lib/ai`, describes a line-based stdio path unlike the implementation, and says internal agents send MCP requests even though chat calls the executor directly. Refresh docs after choosing the transport and execution architecture.

**Recommended granularity**

Granularity should let a user authorize a meaningful action precisely, and let the agent discover valid inputs. It does not require creating a new synonym for every existing tool.

| Area | Add or refine first | Permission boundary |
| --- | --- | --- |
| Context discovery | `get_workspace`, `list_projects`, `get_project`, `list_teams`, `list_cycles`, `list_ticket_options`, `list_project_assignees` | Read access to the selected workspace and optional project/team |
| Ticket reads | `search_tickets`, canonical `get_ticket`, bounded pagination and optional expanded fields | Read-only; constrained resources and output size |
| Ticket content | `create_ticket`, `edit_ticket_content` | Separate creation and content editing |
| Workflow | `set_ticket_status`, `set_ticket_priority` | Permit status changes without arbitrary ticket edits |
| Ownership | `assign_ticket`, `unassign_ticket` | Assignment capability with eligible-user validation |
| Scheduling/hierarchy | `set_ticket_cycle`, `clear_ticket_cycle`, `set_ticket_parent`, `clear_ticket_parent`, `move_ticket` | Separate relationship/move capability; validated scope and acyclicity |
| Labels | Hierarchy-aware discovery; typed `add_ticket_labels`, `remove_ticket_labels`, `set_ticket_labels` | Separate additive, subtractive, and replacement writes |
| Dependencies | Canonical directed add/remove, list, and preview | Explicit blocker/dependent relation |
| Comments | Canonical create/list/update/delete | Read/create distinct from editing/deleting |
| Destructive/admin actions | `delete_ticket`; label/project/team administration only as required | Explicitly separate capabilities; timestamp overrides belong here if retained |
| Other app features | Notes discovery/search and CRUD; project/team/label/cycle management as product scope requires | Add deliberately after core MCP is reliable |

Use one capability registry containing the canonical name, compatibility aliases, runtime input schema, output schema, handler, required permission, allowed resource scope, and read/write/destructive metadata. Generate provider definitions, MCP discovery, settings controls, and browser adapters from it. Keep aliases for compatibility while exposing one preferred name to new clients. If generic `update_ticket` remains, restrict its allowed fields according to the same permissions as focused tools.

**Repair order and acceptance checks**

1. **Contain unsafe execution.** Fix relationship scope and parent cycles, validate arguments, enforce policy at every dispatch, and keep tool data out of system instructions. Acceptance: malformed calls make no writes; foreign references fail; disabled aliases and model-returned disabled calls are rejected.
2. **Restore external connections.** Fix stdio launch/bootstrap/framing/logging and implement the HTTP lifecycle with a usable credential model. Acceptance: an actual standard client completes initialize → initialized → discovery → read → write → read using one authorized session; revocation and expiry are enforced.
3. **Restore end-to-end correctness.** Fix Gemini result mapping, same-user realtime updates, browser registration, and server-confirmed browser mutation results. Acceptance: the external user sees their write, each provider completes a real tool round trip, and rejected browser writes never report success. Cross-process realtime requires its own deployment test.
4. **Add discovery and focused actions.** Start with projects/cycles/options/eligible assignees, bounded ticket search, status, assignment, and relationship clearing. Drive all settings and scopes from the registry. Acceptance: a new agent can discover valid inputs and complete these workflows without copied database IDs or broad update access.
5. **Expand parity and operational coverage.** Add remaining app features based on desired agent workflows; address rotation, durable events, observability, docs, and session-reference behavior.

**Original review validation and limits**

- Server typecheck passed: `npm run -w server typecheck`.
- 49 tests passed across MCP request handler/context, stdio config/session, AI provider adapters, and event bus suites.
- 16 existing chat-service tests passed. Three temporary probes also passed assertions demonstrating the current defects: disabled tool execution, missing Gemini function-response name, and tool content replayed as system. The temporary test file was removed after execution.
- 16 tests passed across six connection suites: endpoints, edge cases, multi-scope RBAC, ordinary/keyed HMAC rotation, and concurrency. Local Supertest sockets required sandbox permission; no production service was contacted.
- 14 client tests passed across realtime and settings. Total: **95 existing tests passed**, plus the three temporary chat probes and separate domain/transport probes.
- Separate in-memory domain probes reproduced missing-label deletion, team label lookup failure, foreign cycle/parent acceptance and related data exposure, self-parent acceptance, and ignored null clearing. Separate transport probes checked the missing launch path, empty standalone registries, unsupported initialized/ping handling, and the key-rotation edge case.
- The client MCP SSE E2E suite could not collect because `@testing-library/jest-dom/dist/vitest.mjs` could not resolve `vitest` in this checkout. Its scenarios also use a mocked server and separate actor/viewer identities, so they do not establish external-client interoperability.
- No live production connection, external model call, supported WebMCP browser, PostgreSQL deployment, or multi-replica deployment was exercised. Provider behavior was checked through captured requests and official documentation. Passing existing tests therefore does not contradict the defects above.

Existing strengths worth preserving include workspace-bound authentication, issuer-membership rechecks, hashed connection tokens, atomic single-use consumption, assignee validation, dependency-cycle checks, and typed mutation events. The review did not identify a separate project-membership bypass: the application's existing ticket authorization itself uses workspace membership. Finer project restrictions would be a deliberate policy addition.
