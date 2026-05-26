# Client Architecture: Module-Driven Flow

The client application follows a **Module-Driven Flow** architecture. This structure emphasizes feature cohesion, encapsulation, and maintainability by organizing code primarily around functional domains (modules) rather than technical concerns (e.g., grouping all components in one place, all hooks in another).

## Directory Structure Overview

The primary codebase lives in `client/src`, with the following key directories:

- `/modules`: The core of the application's domain logic. Features are grouped into standalone modules (e.g., `tickets`, `workspaces`, `auth`).
- `/pages`: Composition roots that assemble modules into routable views.
- `/components`: Generic, highly reusable UI components (e.g., buttons, inputs, dialogs) that are not tied to any specific business logic or domain.
- `/context`: Global React contexts for application-wide state management.
- `/hooks`, `/utils`, `/types`: Shared utilities and definitions that cross-cut multiple domains.

## The Module Pattern

A module in `client/src/modules/` encapsulates everything related to a specific business feature. 

### Internal Structure of a Module

Each module contains the pieces it needs to function, typically organized into subdirectories:

```text
src/modules/tickets/
├── components/       # Feature-specific components (e.g., TicketBoard, TicketList)
├── utils/            # Feature-specific utility functions (e.g., filterTickets)
├── types/            # Types and interfaces specific to the domain
└── index.ts          # The public API of the module
```

### Encapsulation and the Public API (`index.ts`)

Modules are designed to be encapsulated. Code *outside* a module should generally avoid deep-importing from within the module's internal directories. Instead, each module has an `index.ts` file acting as a barrel export. This defines the public API of the module.

For example, `src/modules/tickets/index.ts` exports the components and utilities that the rest of the application is permitted to use.

**Preferred Approach:**
```typescript
// Importing from the module's public API
import { TicketBoard, TicketList } from '../../modules/tickets';
```

**Avoid:**
```typescript
// Bypassing the public API
import { TicketBoard } from '../../modules/tickets/components/TicketBoard';
```

*(Note: In some specific cases, you might import heavily specialized files like `utils/ticketView` directly to avoid cyclical dependencies or large bundle sizes, but the `index.ts` serves as the primary boundary).*

## Pages as Composition Roots

The `client/src/pages/` directory contains the top-level views that are typically mapped to routes. Pages are responsible for **composition**.

A Page component generally does not contain deep business logic or complex, isolated UI markup itself. Instead, its responsibilities are to:
1. Connect to global state or receive it via props (e.g., from `src/context`).
2. Import feature components and utilities from various `/modules`.
3. Orchestrate them together, passing state down as props and handling high-level events.

**Example (simplified from `WorkspacePage`):**
```typescript
// 1. Importing generic components
import { Button } from '@library';

// 2. Importing from module public APIs
import { TicketBoard, TicketFilterBar } from '../../modules/tickets';
import { WorkspaceHeader } from '../../modules/workspaces';

// 3. Importing module-specific utilities
import { filterTickets } from '../../modules/tickets/utils/ticketView';

export function WorkspacePage(props) {
  // Orchestrating logic using module utilities
  const filteredTickets = filterTickets(props.tickets, props.filters);
  
  // Composing the UI using module components
  return (
    <div className="workspace-page">
      <WorkspaceHeader>
        <WorkspaceHeader.Title>My Workspace</WorkspaceHeader.Title>
      </WorkspaceHeader>
      
      <TicketFilterBar filters={props.filters} />
      
      <TicketBoard tickets={filteredTickets} />
    </div>
  );
}
```

## Benefits of this Architecture

1. **Scalability:** As the application grows, the root directories (`/components`, `/utils`) don't become massive, unmanageable dumps of unrelated files.
2. **Discoverability:** When working on a specific feature like "Tickets," developers know exactly where to look: `src/modules/tickets/`.
3. **Refactoring & Isolation:** Modules can be refactored internally without breaking the rest of the app, as long as the `index.ts` contract is maintained.
4. **Separation of Concerns:** Pages handle layout and data orchestration, while Modules handle domain-specific rendering and logic.
