# Performance audit — September 24, 2026

Branch: `codex/performance-optimization`, based on main `910cfb5f`.

This pass uses source inspection and regression tests to identify unnecessary work.
Query counts and render counts below are test observations, not production latency
measurements. The existing ticket list and board already limit or virtualize rows.

## Implemented

| Area | Unnecessary work | Change and evidence |
| --- | --- | --- |
| Route startup | Main workspace, directory, account, and workspace settings screens were imported eagerly. | Load each screen through `React.lazy` behind authentication and a shared Suspense boundary. A navigation regression verifies that screen modules load only when visited after sign-in. Bundle-size savings have not been measured. |
| Ticket board | Handler caches were cleared after rendering, discarding stable callbacks. Timestamp-only card comparison also suppressed changed avatars and navigation callbacks. | Keep drag handlers for the lifetime of each ticket object and scope selection handlers to the current selection callback. Compare card content normally and let the memoized ticket card skip unchanged props. Regression tests cover unchanged-card render counts and fresh avatars/callbacks. |
| Chat markdown | Parent updates reparsed unchanged historical message text. | Memoize the shared `FormattedMarkdown` component. Regression tests verify skipped work with stable props and updates when text, token renderer, or tone changes. |
| Chat animation | Cleanup read a ref after it could be cleared on unmount, and enter/exit animations could overlap. | Capture the animated element in the transition effect and remove its animation during cleanup. Tests cover interruption ordering and detached-element cleanup. |
| Ticket reads | Statuses already present in ticket rows were fetched again, and project/workspace lists duplicated the same hydration code. | Reuse row statuses, fetch only missing related statuses, share list hydration, and load labels alongside relationships. Fixture: full list with internal relationships uses **4 reads instead of 6**; terminal-only page uses **2 instead of 3**. External relationship statuses remain covered. |
| Comment saves | Creating/updating a comment loaded and mapped the entire discussion to return one record. | Read back by ticket ID and comment ID, with a one-row limit. Regression verifies one returned row with 40 existing comments, correct backdated creation, and ticket scoping. |

## Remaining candidates

These are source-backed follow-ups, prioritized by potential scaling impact. They
need focused profiling or behavior design before a larger change.

1. **Relationship cleanup query fan-out.**
   `server/src/modules/tickets/routes.ts`, `emitRelationshipCleanupEvents`, starts
   a full detail hydration and scope lookup for every affected ticket through an
   unbounded `Promise.all`. Batch scope/snapshot reads or cap concurrency; measure
   query count and connection-pool wait when a highly connected ticket closes.
2. **Duplicate detail hydration.**
   `server/src/modules/tickets/services/tickets.ts`, `getTicketDetailsByKey`, calls
   `getTicketByKey` and then `getTicketDetails`, which reads and hydrates the ticket
   again. Split row lookup from detail hydration so both ID/key paths can share it.
3. **Unbounded dropdown DOM.**
   `TicketAssignmentSubMenu.tsx` and `SearchableOptionPickerPopoverContent.tsx`
   mount all matching options inside short scroll containers. Test thousands of
   tickets/options and add accessible virtualization or explicit pagination while
   keeping search across the full dataset.
4. **Timestamp cache lifetime.**
   `client/src/modules/tickets/utils/ticketView.ts` stores each distinct timestamp
   in a module-level `Map` with no eviction. Long sessions with continuous ticket
   updates retain old timestamps. Consider bounded caching or ticket-lifetime
   caching and measure retained heap over repeated updates.
5. **Repeated workspace label scans.**
   `WorkspaceShellPage.tsx` filters every team's label array separately for every
   project while building `labelsByProject`. Group labels by project once to avoid
   projects × labels work when that memo recomputes.
6. **Other animation/listener cleanup.**
   `NotificationCenter.tsx` also reads a potentially cleared ref during cleanup;
   `ChatInterface.tsx` does not cancel its delayed scroll; mobile
   `WorkspaceLayout.tsx` lacks animation cleanup on unmount. Verify rapid
   mount/unmount and route changes. Library `Scrollspy.tsx` reads every target's
   layout on every captured scroll event; frame batching is worth checking if used.
7. **Large coordination modules.**
   `WorkspaceShellPage.tsx` (~1,300 lines), workspace server routes (~2,100), and
   ticket MCP handlers (~1,800) combine many responsibilities. Extract cohesive
   queries, derived data, and request handlers as those paths change. File length
   alone is not evidence of a runtime bottleneck.

## Validation

- Targeted behavior, query-count, render-count, and animation lifecycle regressions
  pass.
- Client TypeScript checking and server compilation pass.
- Full client suite: **120 files, 760 tests passed**. After the final
  reduced-motion/embedded animation correction, its focused suite passed all
  **5 tests**, including two additional regressions.
- Full server suite: **59 files, 400 tests passed**. The suite used local HTTP
  listeners outside the sandbox for API tests.
- Host production bundling is blocked by the installed Rolldown 1.0.3 native Linux
  binding crashing with `SIGILL` before application bundling. Reproduced on the
  unchanged route configuration and with an independent minimal virtual module
  (`SIGSEGV`); a debugger locates the failure inside the native binding. Node
  22/24 and execution outside the sandbox do not resolve it. No dependency or
  lockfile changes were made, and no bundle-size or end-user timing improvement
  is claimed.
- Subsequent production builds inside Docker succeeded for both frontend and
  backend during the requested port 9999 restart. The frontend output includes
  separate workspace, directory, account, and workspace settings chunks. The
  native binding failure above is limited to the host build environment tested.
