# Mobile Support and Responsive Layouts

## 1. Purpose and Scope
This document explains the technical approach to mobile support and responsive design within the React client application. It maps out the code paths, CSS abstractions, and component patterns that govern how the interface adapts to smaller screens (specifically `< 768px` and `< 500px` breakpoints), focusing primarily on ticket rendering and dashboard layouts.

## 2. Non-Goals or Boundary Limits
- **Not covered:** Server-side logic or user agent sniffing. All responsiveness is handled entirely client-side via CSS and React rendering.
- **Not covered:** Tablet specific breakpoints. The primary focus is mobile vs. desktop experiences.

## 3. Entry Points
- **CSS Media Queries**: The primary engine for mobile responsiveness is `index.css`, which toggles visibility of mobile and desktop elements.
- **Component Toggles**: `TicketList.tsx` and `TicketDetail.tsx` (for subtasks) render both desktop and mobile variants of a ticket row, deferring to CSS for display logic.

## 4. Flow Steps
1. **Screen Resize / Mobile Load**: The browser evaluates CSS media queries (primarily in `index.css` and `WorkspacePage.css`).
2. **Component Rendering Strategy**: Instead of JavaScript-based window size listeners, list components like `TicketList.tsx` unconditionally render both `<TicketRow />` (desktop) and `<TicketRowMobile />` (mobile). 
3. **Display Toggling**: CSS classes `.ticket-list__row-desktop` and `.ticket-list__row-mobile` dictate which component is visible. At `< 768px`, the desktop row receives `display: none;` and the mobile row is revealed.
4. **Detail Views**: In `TicketDetail.tsx`, the desktop sidebar is hidden, and a mobile `Accordion` component (`ticket-detail__accordion-mobile`) is surfaced to display ticket properties.

## 5. Data Stores and Resources
- **No persistent data stores** directly manage mobile state. It is entirely stateless and CSS-driven.

## 6. Interfaces and Contracts
- **`TicketRowProps`**: Both `TicketRow` and `TicketRowMobile` adhere to the exact same prop interface (`TicketRowProps`). This allows seamless switching in list views without altering data fetching or prop drilling logic.
- **CSS Classes**: 
  - `.ticket-list__row-desktop`: Visible by default, hidden `< 768px`.
  - `.ticket-list__row-mobile`: Hidden by default, visible `< 768px`.
  - `.ticket-parent-mobile-btn`: A specialized small button for mobile ticket headers (hidden by default, shown `< 500px`).

## 7. Key Files and Modules
- **`client/src/index.css` & `client/src/pages/WorkspacePage/WorkspacePage.css`**: Contain the core `@media` queries governing global responsive behavior, layout shifts, and list toggles.
- **`client/src/modules/tickets/components/TicketList.tsx`**: Maps over ticket collections and implements the dual-render strategy (both desktop and mobile rows).
- **`client/src/modules/tickets/components/TicketDetail.tsx`**: Implements dual-render for subtasks. Also implements responsive logic for ticket headers (e.g., swapping the long parent-ticket reference label for a compact `ticket-parent-mobile-btn` with a `CornerLeftUp` icon).
- **`client/src/modules/tickets/components/TicketRowMobile.tsx`**: Dedicated component for mobile ticket layout. Uses `.ticket-row-mobile__meta` to place properties like `createdAt` date and `domainId` cleanly.

## 8. Permissions, Guards, or Tenant Boundaries
- N/A - Mobile support does not alter permission boundaries.

## 9. Failure Modes, Observability, or Operational Notes
- **Performance consideration**: Rendering two variants of every ticket in a list (desktop + mobile) doubles DOM node count. If lists become extensively large (e.g., >500 items on a single page), this dual-render strategy may induce scroll lag on low-end devices and require refactoring to virtualized lists or JS-based `matchMedia` rendering.

## 10. Change Hazards, Invariants, or Migration Constraints
- **Prop Synchronization**: If `TicketRowProps` is modified, you must update both `TicketRow.tsx` and `TicketRowMobile.tsx` to maintain feature parity between viewports.
- **Dual-Render Edits**: When adding elements to a list item (like the creation date), ensure it is added to both the desktop row and the mobile row explicitly.
- **CSS Specificity**: Take care when adding `!important` to responsive visibility helpers (e.g., `.ticket-parent-mobile-btn`), as it can conflict with parent layout abstractions.

## 11. Related Docs
- [Client Architecture Overview](CLIENT_ARCHITECTURE_OVERVIEW.md)
- [Client Routing Flow](CLIENT_ROUTING_FLOW.md)
