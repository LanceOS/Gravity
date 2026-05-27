# Client Architecture Overview

## 1. Purpose and Scope
This document outlines the high-level architecture of the React-based client application. The client is a Single Page Application (SPA) built with React and Vite. It serves as the primary user interface for workspaces, project ticketing, AI interactions (via LocalAIChat and MCP), and account settings.

## 2. Non-Goals or Boundary Limits
- **Not covered:** Server-side API implementation, database schemas, and external API rate limits.
- **Not covered:** Detailed routing flows and state management (these are covered in companion documents).

## 3. Entry Points
- `client/src/main.tsx`: Bootstraps the React application, applies initial themes to prevent Flash of Unstyled Content (FOUC), and renders the `App` component.
- `client/src/App.tsx`: Wraps the application shell with global context providers (`ThemeProvider` and `TicketProvider`).

## 4. Flow Steps
1. **Bootstrapping**: `main.tsx` initializes React DOM and CSS.
2. **Global Providers**: `App.tsx` sets up theme and ticket contexts.
3. **Application Shell**: `AppShellPage` orchestrates routing based on user session and selected workspaces.
4. **Layout Composition**: Pages are wrapped in `WorkspaceLayout`, rendering the sidebar and central content areas.

## 5. Data Stores and Resources
- **Local Storage**: Caches user theme preferences, active workspace (`gravity_active_workspace:{userId}`), and pending invites.
- **REST APIs**: The client communicates with the server primarily through REST APIs (e.g., fetching workspaces, members, tickets).

## 6. Interfaces and Contracts
- `client/src/types/domain.ts`: Defines shared types across the client, often mirroring server types for resources like Workspaces, Projects, and Tickets.

## 7. Key Files and Modules
The client codebase is heavily modularized using a domain-driven structure under `client/src/modules/`.
- **`modules/ai/`**: Components and hooks for interacting with local LLMs (Ollama) and the Agent Simulator.
- **`modules/auth/`**: Login screens and onboarding flows.
- **`modules/onboarding/`**: New user tutorials and setup modals.
- **`modules/settings/`**: Account and workspace settings, including theme providers and MCP tool configurations.
- **`modules/tickets/`**: Core project management components (ticket board, grid, modals).
- **`modules/workspaces/`**: UI components for workspace creation and project selection.

## 8. Permissions, Guards, or Tenant Boundaries
- **Authentication**: Unauthorized users are directed to the `AuthScreen`.
- **Workspace Boundaries**: Projects, tickets, and team members are strictly isolated by the `activeWorkspaceId`. 

## 9. Failure Modes, Observability, or Operational Notes
- If the server is unreachable, the client will display generic error boundaries or fallback loading screens.
- API requests generally handle errors by updating local error states (e.g., `projectCreateError`), which are then displayed inline via toasts or modal alerts.

## 10. Change Hazards, Invariants, or Migration Constraints
- **Global Context Abuse**: Avoid adding more global context providers to `App.tsx` unless strictly necessary. Prefer custom hooks that fetch data closer to where it is used.
- **CSS Modularity**: Global styles should remain in `App.css` and `index.css`. Component-specific styles must remain scoped or co-located (e.g., `DashboardLayout.css`).

## 11. Related Docs
- [Client Routing & Flow](CLIENT_ROUTING_FLOW.md)
- [Client State Management](CLIENT_STATE_MANAGEMENT.md)
- [Client User Interactions](CLIENT_USER_INTERACTIONS.md)
