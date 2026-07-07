# Changelog

All notable changes to this project will be documented in this file.

## [0.8.1] - 2026-07-06

### UI Stability
- Fixed the shared AnimeJS easing handling used by the AI chat dock and overlay components so cubic-bezier values no longer crash the app.
- Stabilized ticket detail animation behavior after the latest ticket relationship changes.

## [0.8.0] - 2026-07-06

### Workspace, Routing, and Shell
- `#123` to `#128`: introduced team workspaces, hierarchy selection during workspace creation, a rebuilt team sidebar, team-scoped aggregate views, team-scoped cycles and labels, and team workspace behavior refinements.
- `#132` to `#136`: continued the client codebase overhaul by splitting workspace shells, sidebar flows, ticket detail, notes, project panels, and management screens into smaller modules, while also clarifying ticket ordering, label creation, and storage boundaries.
- `#156` to `#167`: extracted shared contexts and compatibility shells for auth, active project, theme, active view, ticket filters, cycles, labels, ticket mutation, comments, project detail, ticket list, and realtime flows.
- `#174` to `#176`: reduced hot-path cache scans, simplified route configuration, and improved shell aggregate calculations.
- `#178` and `#183`: persisted invite state, hardened workspace access retry flows, and rejected non-member access.

### Tickets, Dependencies, and Labels
- `#129` to `#131`: added inline ticket property editing, context-menu driven ticket moves, and the initial dependency-system UI and schema groundwork.
- `#142` to `#144`: renamed dependency storage to `ticket_relationships`, migrated legacy `blocked_ticket_id`, completed the backend dependency model/API, and added MCP tools for labels and blocker/dependency management.
- `#151` to `#155`: removed non-essential files, added blocker tools, refreshed kanban movement, and fixed the Vite configuration.
- `#168` to `#172`: automatically removed blocker relationships when status changed, clarified sub-ticket status indicators, fixed assignee leakage, and enforced workspace/project isolation.
- `#193` and `#196`: fixed onboarding reset rehydration, kanban drag/drop, and drag listener cleanup regressions.

### AI Chat, Notes, and MCP
- `#184` to `#189`: delivered the AI chat stack end to end, from chat sessions and the MCP-aware chat service through the sidebar dock, message rendering, MCP tool wiring, and notes integration polish.
- `#170`, `#177`, `#179`, and `#191`: scoped the AI assistant to a single workspace, cleaned up spawned-agent lifecycle handling, narrowed default MCP scopes, and removed local AI providers, flows, and docs.

### UI, Themes, and Motion
- `#130`: reworked the UI for a smoother modern presentation.
- `#137` to `#141`: corrected docker services, fixed ticket list scrolling and ticket detail rendering, added Honey Glow and Midnight Azure themes, and cleaned up type errors and deployment scripts.
- `#173`, `#180`, `#182`, and `#190`: fixed flash-of-unstyled-content behavior, added anime.js-driven motion, completed a broader UI redesign, and redesigned the new ticket popup.
- `#194` and `#195`: added `nosniff` headers and improved branch-name normalization and hashing fallback.

### Platform, Realtime, and Release Engineering
- `#145` to `#150`: added the MCP mutation event bus, wired tool handlers into SSE, extracted a dedicated SSE service, added client-side event coalescing and targeted cache updates, hardened the endpoint, and landed pipeline tests and docs.
- `#181` and `#192`: added a repeatable seed script with permanent test users/workspace assignments and an owner-only workspace task JSON export.

## [0.7.6] - 2026-06-10

### Notes
- Launched Notes as a brand-new workspace feature, including sidebar entry points, list views, and workspace-scoped CRUD services.
- Switched note editing from Tiptap back to ProseMirror and tightened the editor around selection bubbles, markdown input rules, autosave timing, and title synchronization.
- Added note search, media upload support, media deletion, and orphaned asset cleanup so the feature is usable end to end.
- Hardened the note editor with safer markdown link handling and fixes for save race conditions.

### Tickets And Labels
- Renamed domains to labels across the product and updated the UI and backend to match the new terminology.
- Allowed tickets to hold multiple labels and added workspace label management for creating and organizing them.
- Added MCP-aware label operations, including tools to read, update, and delete labels.
- Refined ticket editing with a TicketUtilities component, explicit edit mode, and cleaner component structure.
- Redesigned the ticket filter UI with popovers, badges, URL-synced filters, and better mobile and desktop behavior.

### Integrations And Platform
- Added GitHub project repository settings and webhook-driven ticket status transitions.
- Secured webhook handling with HMAC-SHA256 verification, rate limiting, URL validation, and payload validation.
- Centralized TanStack Query configuration and fixed cache state sync issues.
- Migrated to react-router-dom for URL-based routing, including deep-linkable ticket routes and mobile full-screen navigation.
- Added RustFS-backed object storage and secure streaming for uploads and downloads.
- Cleaned up TicketContext networking and fixed the rapid-fire request loop that caused repeated API calls.

## [0.6.9] - 2026-05-29

- Release: bump versions to 0.6.9 across packages.
