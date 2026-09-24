# Large ticket views — GRAV-173

Measured September 24, 2026 on main `b1106803`, then with the changes on
`feature/grav-173-measure-large-ticket-views-and-add-virtualizatio`.
The ticket's earlier audit basis was `83d275a3` (September 23); that audit did
not include runtime acceptance. The measurements and browser checks below are new.

## Current implementation

Ticket derivations do **not** all run on every render. `WorkspacePage` memoizes
filtering, sorting/grouping, and lookup maps. `ticketView.ts` caches normalized
search text by ticket identity and parsed timestamps. `TicketList` memoizes its
flattened rows; `TicketBoard` memoizes formatted cards and caches handlers.
The views and individual rows/cards are memoized as well. Changing relevant
inputs still recomputes the corresponding derivation.

Ticket lists use `DenseVirtualList`, and ticket boards use a separate per-column
`KanbanBoard` → `DenseVirtualList` path. Library DataGrid virtualization does not
cover either path automatically. Existing paging remains: 50 tickets per list
status, 40 cards per board column, plus the server load-more control when supplied.

The measured board gap was the initial page: 40 cards per column stayed below
the old >50 virtualization threshold, mounting 240 cards across six statuses.
Columns now virtualize above 20 cards, with three overscan rows and a bounded
initial viewport before ResizeObserver reports the actual height. The fixed ticket
card pitch remains 168px (160px card plus 8px gap). Fixed-height ticket columns
keep the same card tree when crossing the threshold, preserving keyboard focus
in both directions. Headers show full group counts.

The list already had bounded DOM for balanced large datasets. It now keeps the
same keyed row tree on both sides of the filtered-count threshold (>=120), changing
only the rendered range. Adding or removing tickets across that threshold retains
the focused row or nested PR link. Its viewport uses the measured height instead
of imposing a 560px minimum on short screens.

Mobile row heights are measured from their natural content with ResizeObserver;
76px is only an initial estimate. Wrapped labels therefore remain visible, and
width changes invalidate offscreen height estimates. Keyboard jumps are adjusted
as the destination's neighbours are measured, so End still reveals its target.
Manual pointer, wheel, or touch scrolling cancels that reveal intent.

Stable item keys retain at most one focused and one dragged row outside the
rendered window. Arrow Up/Down, Home/End, and Tab/Shift+Tab navigate across virtual
boundaries, skip group headers and disabled pagination controls, and allow Tab
to leave at the endpoints. Nested PR links retain native keyboard behavior.
Enter/Space opens a focused ticket; focus rings are visible. Responsive row
replacement retains focus, and deleting/filtering the focused item gives focus
to the list container. Drag completion releases the retained source, including
drops outside the source list. This does not introduce keyboard drag/reordering.
Focus ownership follows the React row tree through portals, so an offscreen
retained row can open a context menu, execute an action, and restore its trigger
on Escape. Leaving both the row and its portal releases the retained row.

## Measurement setup

The production fixture bundles the actual `TicketList`, `TicketBoard`, ticket
rows/cards, CSS, and shared virtualizer using esbuild 0.27.7 and React's production
profiling runtime. It uses the actual filter/sort/group functions with memoization
matching the workspace view. No component mocks are used. The fixture intentionally
omits authenticated providers, so context-menu mutation content and API/database
latency are outside these measurements. This is component-level browser acceptance,
not an authenticated end-to-end project acceptance run.

Data: deterministic single-project sets of 1,000 and 5,000 tickets, six statuses,
five priorities, varied title lengths, descriptions, timestamps, assignment,
labels, parent links, blocked/blocking indicators, and PR badges. The main profile
uses balanced statuses. Additional acceptance uses 5,000 tickets with 80% in Todo,
10% in Backlog, 10% in Done, and three empty columns. The fixture retains paging
and exercises loading additional rows/cards rather than pretending all records
are mounted at once.

Host: Linux x86_64, AMD Ryzen 5 5500, headless Brave/Chromium 153.0.8010.53 via
Playwright 1.59.1, 1600×900 viewport, reduced motion, no CPU throttling. External
Google Fonts requests are blocked. Short-screen checks use 480px height, a 390px
mobile list, and a resize to 1100×400.

Raw observations: [baseline](../performance/grav-173/baseline.json) and
[after the review fixes](../performance/grav-173/after.json). Each table entry is one sample per
scenario, not a median or percentile. Timings include profiling overhead and
normal host noise; the DOM reduction is the firm result. No list speedup or
production INP improvement is claimed.

## Baselines and results

Counts cover descendants of the ticket view, excluding the fixture toolbar.

| Dataset / view | Initially mounted tickets, before → after | Initial DOM nodes, before → after | DOM nodes after scrolling, before → after |
| --- | ---: | ---: | ---: |
| 1,000 / list | 21 → 21 | 437 → 458 | 622 → 649 |
| 5,000 / list | 21 → 21 | 438 → 459 | 608 → 635 |
| 1,000 / board | 240 → 48 | 5,698 → 1,308 | 5,235 → 1,380 |
| 5,000 / board | 240 → 48 | 5,698 → 1,308 | 5,235 → 1,380 |

Board initial card count falls 80%; board DOM falls approximately 77%. The list's
small node increase is the stable identity wrapper used for focus retention.

React Profiler `actualDuration` sums, in milliseconds, before → after:

| Dataset / view | Initial mount and sizing commits | Search filter update | Scroll update |
| --- | ---: | ---: | ---: |
| 1,000 / list | 25.3 → 14.0 | 10.9 → 8.2 | 10.4 → 6.8 |
| 5,000 / list | 18.8 → 13.4 | 10.5 → 8.4 | 10.5 → 6.9 |
| 1,000 / board | 85.3 → 28.2 | 39.1 → 8.7 | 4.8 → 2.3 |
| 5,000 / board | 96.5 → 30.3 | 26.6 → 6.2 | 5.2 → 3.0 |

The board Show action's render work is 5.9 → 1.2ms at 1,000 tickets and
6.1 → 1.2ms at 5,000. Initial fixture filter/sort/group work at 5,000 is
12.2 → 7.0ms for list and 1.2 → 0.7ms for board. No derivation optimization was
made in this change. An unrelated parent update does not rerun the fixture's
derivation and incurs approximately zero ticket-view render work in both versions.

Interaction measurements start before dispatching a Playwright action and end
after two animation frames. They include automation round trips and frame waits,
so they are **not input latency, INP, or pure browser work**. At 5,000 tickets:

| Action | List, before → after (ms) | Board, before → after (ms) |
| --- | ---: | ---: |
| Search input | 80.3 → 66.2 | 145.6 → 71.6 |
| Scroll | 45.7 → 41.5 | 44.1 → 36.1 |
| Show additional cards | — | 99.9 → 65.7 |

## Acceptance and reproduction

Run from the repository root:

```sh
npm ci
npm exec --workspace=client -- playwright install chromium
TICKET_PERF_REPORT=/tmp/ticket-performance.json npm run -w client test:ticket-performance
```

An existing Chromium installation can be selected with `CHROMIUM_PATH`; this run
used `/usr/bin/brave-browser`. Optional `TICKET_PERF_SCREENSHOTS=/tmp` saves desktop,
short-screen, and wrapped-label images. `--regressions-only` runs just the four
review regressions without the timing scenarios. The runner builds and serves a temporary local fixture,
then closes its browser/server and removes the build output. It does not use the
app database. `--baseline` skips the new behavior assertions; to reproduce the old
baseline, copy the fixture and runner into a checkout of `b1106803` and run there
with that flag. Running the flag on changed code does not restore old behavior.

Browser assertions passed for initial DOM bounds, filtering, nonempty scrolled
windows, memoized unrelated updates, keyboard activation/navigation beyond the
overscan range, Tab exit, focus while scrolling, focused/dragged source retention,
column grouping after moves, synthetic drag with scroll during the gesture, native
pointer drag into an empty column, pagination, short viewports, mobile-to-desktop
focus retention, and nonoverlapping resized rows. Desktop board and mobile list
screenshots were visually inspected. The browser emitted no page errors.

Review regression scenarios additionally cover 120 → 119 → 120 tickets while
retaining the exact focused PR link, 21 → 20 → 21 cards while retaining the
exact focused board card, five wrapping labels per mobile ticket at
390px and 330px widths, no clipped labels or overlapping rows after scrolling,
keyboard traversal and End with measured heights, and Shift+F10 on a focused row
retained outside the visible window. The menu test uses the real shared ContextMenu
and verifies focus, action execution, Escape restoration, and retention cleanup;
authenticated ticket mutation services remain outside the fixture.

Unit regressions cover stable focused DOM identity across reordering, releasing
focus pins, skipping headers, virtual-boundary navigation, filtering away a focused
item, releasing a drag after an outside drop, the first board page's virtualization
and full count, fixed card pitch, single-status list pagination/focus, threshold
crossings in both directions, and focus ownership through portaled context menus.

Validation after the review fixes: all 121 client test files / 798 tests passed
on Node 22.22.2. Client
TypeScript and ESLint for changed production components and the profiling fixture
pass. The default host Node 26.7.0 produced unrelated jsdom localStorage/AbortSignal
failures; the complete suite passes on Node 22 without test changes. The esbuild
fixture does not validate the full Vite application bundle. Firefox/WebKit,
screen-reader announcements, authenticated menus, server paging latency, and
long-session heap behavior were not profiled here.
