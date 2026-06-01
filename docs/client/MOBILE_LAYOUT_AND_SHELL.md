# Mobile Layout and Shell Architecture

## Purpose and Scope
This document explains how the global layouts, shell pages, and top-level navigation components adapt to mobile viewports within the Gravity client application. It maps out the code paths that handle transitioning from standard persistent desktop navigations into mobile-friendly structural paradigms (like overlays, drawers, and forced-view states).

## Non-Goals or Boundary Limits
This document does not cover individual module screens (like Settings or Issue Trackers) in depth, nor does it cover global state management beyond its role in viewport responsiveness. For subsystem specifics, refer to the related mobile subsystem documents.

## Key Files and Modules
- `client/src/pages/AppShellPage/AppShellPage.tsx`
- `client/src/layouts/WorkspaceLayout/WorkspaceLayout.tsx`
- `client/src/components/DashboardLayout/DashboardLayout.tsx`
- `client/src/components/DashboardLayout/DashboardLayout.css`

## Entry Points
- **AppShellPage**: This acts as the highest-level orchestrator of the workspace view logic.
- **WorkspaceLayout**: This acts as the primary layout wrapper around authenticated screens that handles the insertion of the `Sidebar`.

## Flow Steps and Behaviors

### 1. View Constraint Overrides in AppShellPage
The desktop version of Gravity permits viewing projects in either a "List" or "Board" format. The `AppShellPage` implements a runtime listener that enforces the `list` view on mobile devices.
- A `resize` event listener watches `window.innerWidth`.
- When `window.innerWidth <= 768` (`isMobile` threshold), it evaluates the current `activeView`.
- If the application is in `board` mode on a mobile viewport, it forces the state to `list`.
- **Reasoning**: The Kanban-style `board` view requires extensive horizontal screen real estate. The mobile paradigm strictly supports vertical scrolling and list-based architectures.

### 2. Sidebar Detachment and Drawer Overlay
On the desktop, the `Sidebar` is a static component injected securely into the DOM adjacent to the `DashboardLayout.Main`. On mobile, it cannot persist on the screen without obscuring content.
- `WorkspaceLayout` receives an `isMobile` boolean.
- When `isMobile` is false, it renders the `<Sidebar>` inline.
- When `isMobile` is true, it omits the inline Sidebar. Instead, it utilizes `createPortal` to render the Sidebar within a `mobile-sidebar-overlay` fixed to the `document.body`.
- This converts the navigation into a modal drawer. `WorkspaceLayout` manages an `isMobileSidebarOpen` state to animate this drawer in and out.
- Handlers passed to the `mobileSidebarProps` are intercepted with a `wrapHandler` wrapper that automatically closes the drawer (`setIsMobileSidebarOpen(false)`) whenever a user makes a navigation choice.

### 3. DashboardLayout Header Adaptations
The `DashboardLayout` manages a top-bar header. On mobile, this header becomes the primary mechanism for invoking the hidden Sidebar.
- `WorkspaceLayout` injects a mobile-only "Hamburger" toggle button (`Menu` / `X` icons) into the `DashboardLayout.Header`.
- The desktop navigation tabs or secondary actions in the header are often visually hidden using CSS media queries (e.g., `@media (max-width: 768px)` in `DashboardLayout.css`).

## Interfaces and Contracts
- **`isMobile` Prop**: The primary contract across top-level components to signal the structural change. It is calculated consistently at the `AppShellPage` or `WorkspaceLayout` level via `window.innerWidth <= 768`.

## Change Hazards and Migration Constraints
- **Global `window.innerWidth`**: The current implementation relies on direct evaluation of `window.innerWidth` rather than a unified React context or ResizeObserver hook across all pages. Ensure consistency with the `768px` breakpoint.
- **Portal Overlays**: Because the mobile Sidebar utilizes `createPortal` to append to `document.body`, any z-index changes to root elements or dialogs need to ensure they don't incorrectly overlap the mobile sidebar backdrop.

## Related Docs
- [MOBILE_SETTINGS_AND_PREFERENCES.md](file:///home/lance/Documents/Code/Gravity/docs/client/MOBILE_SETTINGS_AND_PREFERENCES.md)
- [MOBILE_TICKET_BOARD.md](file:///home/lance/Documents/Code/Gravity/docs/client/MOBILE_TICKET_BOARD.md)
