# Mobile Ticket and Board View Architecture

## Purpose and Scope
This document explains the mobile design architecture and behavior for rendering project issues, ticket lists, and filter controls in the Gravity client. It maps out how high-density desktop tracking views gracefully degrade into mobile-friendly vertical stacks.

## Boundary Limits
This document specifically covers the presentation layer of the Ticket subsystem (`TicketList`, `TicketRowMobile`, and `TicketFilterBar`). It does not detail the `TicketContext` data fetching logic, websockets updates, or individual ticket detailed viewing modals.

## Key Files and Modules
- `client/src/modules/tickets/components/TicketList.tsx`
- `client/src/modules/tickets/components/TicketRowMobile.tsx`
- `client/src/modules/tickets/components/TicketRowMobile.css`
- `client/src/modules/tickets/components/TicketFilterBar.tsx`
- `client/src/modules/tickets/components/TicketFilterBar.css`

## Flow Steps and Behaviors

### 1. Ticket List and Row Delegation
The core list rendering algorithm occurs within `TicketList.tsx`. 
- **Desktop Rendering**: The desktop primarily utilizes `TicketRow.tsx` (a horizontal, tabular row representing issue metadata concisely) or `DenseGridController` for heavy board visualizations.
- **Mobile Rendering**: Because a tabular row causes severe horizontal overflow on small screens, a dedicated component, `TicketRowMobile.tsx`, was introduced.
- **Delegation Strategy**: Rather than writing complex Javascript event listeners to switch row components at runtime, `TicketList` renders **both** the desktop `TicketRow` and the `TicketRowMobile` component simultaneously for every ticket in the list.
- **CSS Resolution**: The application relies on pure CSS media queries to toggle the visibility of the rows. The `ticket-list__row-desktop` and `ticket-list__row-mobile` wrapper div classes strictly define `display: none` or `display: block` depending on the viewport width breakpoint.

### 2. TicketRowMobile Card Layout
`TicketRowMobile.tsx` converts the horizontal metadata row into a vertically stacked card structure.
- **Main Row**: Contains the priority icon, the ticket title, and the assignee avatar aligned horizontally.
- **Meta Row**: Contains supplementary tags (Domain tags, Sub-ticket indicators) placed below the main content in a secondary row using a smaller font size. This row conditionally renders only if metadata is present.

### 3. Filter Bar Accordion Compression
The `TicketFilterBar` contains numerous controls: search input, priority filter, status filter, domain filter, and sorting mechanism.
- **Desktop Strategy**: These controls map left-to-right across the top of the ticket view.
- **Mobile Compression**: These controls break the layout if forced to wrap on mobile. To resolve this, the mobile view isolates the generic Search input to the top row. The remaining complex filters (Status, Priority, Domain, Sort) are placed inside a `ticket-filter-bar__grid` and wrapped securely in a native `Accordion` component labeled "Filters".
- **Dynamic Labeling**: The Accordion title dynamically updates (e.g. `Filters (2 active)`) based on the currently selected filter count to give users context without needing to open the drawer.
- **Totals Row**: The metric totals row is moved to the bottom of the filter bar, explicitly declaring `Total tickets` and `Completed` counts as isolated spans to fit the screen.

## Change Hazards and Invariants
- **Dual Rendering Performance**: Because `TicketList` maps and mounts both the desktop and mobile row components concurrently, the components themselves must be lightweight (`React.memo` utilized where possible). Attaching heavy lifecycle hooks inside `TicketRow` or `TicketRowMobile` could double the rendering cost of the list.
- **Testing Architecture**: The test suites (`TicketList.test.tsx` and `TicketFilterBar.test.tsx`) enforce the presence of both mobile and desktop rows. If you refactor to use a JS-based `window.innerWidth` switch instead of CSS media queries, those tests will require substantial updates to trigger synthetic resize events instead of static DOM querying.

## Related Docs
- [MOBILE_LAYOUT_AND_SHELL.md](file:///home/lance/Documents/Code/Gravity/docs/client/MOBILE_LAYOUT_AND_SHELL.md)
- [MOBILE_SETTINGS_AND_PREFERENCES.md](file:///home/lance/Documents/Code/Gravity/docs/client/MOBILE_SETTINGS_AND_PREFERENCES.md)
