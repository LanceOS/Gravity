# Portal lifecycle acceptance — GRAV-99

Runtime validation on 2026-09-24, starting from main `3fa9012f` (updated from the backlog audit's `83d275a3`).

## Decision

Keep Portal's existing `useEffect` host selection. Server rendering and the first hydration render both return `null`; only the committed client effect reads `document.body`. Switching the container moves the children, and unmount removes them without removing the caller-owned host. Changing hosts remounts the child subtree, consistent with React portals.

The visible regressions were in consumers that assumed their DOM existed during the parent's first effect. Modal, Drawer, Popover, and Tooltip now track the attached element with callback-ref state so their effects run when Portal mounts it. Cleanup captures that element rather than reading a ref that is already null on detach.

## Reproductions and fixes

The production browser fixture imports real library consumers and application styles. It records animation-frame geometry and opacity; an effect flush in a DOM-only test is not treated as proof of first-paint behavior.

- Initially open and interaction-opened Modal and Drawer had no entrance animation, including on reopen. Every sampled modal frame had opacity `1`; drawer frames stayed at `x=400` in an 800px viewport. Their entrance effects had run before the nodes existed. The fixed consumers start their fade/translation when their nodes attach.
- Popover and Tooltip likewise skipped their entrance animations. Popover also missed attaching its ResizeObserver. The fixed Popover observes its mounted element and follows child-only content growth.
- A right-aligned Popover retained CSS `right: 0` after receiving a calculated fixed `left`. In the fixture it stretched to the viewport edge at `x=800`, instead of ending at its trigger's right edge near `702`. Clear the conflicting right offset and use intrinsic CSS sizing; consumer CSS widths remain overridable. Growing the fixture content now changes the panel from 224px to 384px while keeping its right edge aligned.
- With reduced motion, a centered Popover received both a calculated centered `left` and CSS `translateX(-50%)`. Remove the duplicate CSS translation.
- With reduced motion, ContextMenu returned before positioning or revealing the root menu (opacity stayed `0`), and its submenu stayed at `(0, 0)`. Position and reveal regardless of motion preference; skip only animation.
- Select and Toast use the existing Portal lifecycle successfully; no production changes were needed for them.

## Coverage and commands

`client/src/test/library/portal.test.tsx` covers body/custom hosts, custom-to-custom and body transitions, child cleanup, preserving host-owned content, cancellation before mount, server rendering with a throwing `document` getter, hydration to body/custom hosts, and hydration/unmount of initially open Modal, Drawer, and Popover. Lifecycle and hydration checks include StrictMode.

`npm run -w client test:portal-browser` builds an isolated production fixture and runs the browser checks. It covers all seven direct overlay consumers, initial and interaction opening where supported, normal/reduced motion, Modal/Drawer close and reopen (including interruption during exit), Popover left/right/center alignment and child growth, real desktop and mobile consumer CSS width overrides, and nested ContextMenu placement. Screenshots and frame samples can be saved with `GRAVITY_PORTAL_TEST_ARTIFACTS`.

This machine's Vite 8 native build crashed with an illegal instruction under Node 26 and Node 22; its Playwright browser download was absent. Browser acceptance used the already installed Vite 7.3.5 from Vitest and Brave 153.1.95.104 (Chromium), with no dependency changes:

```sh
GRAVITY_PORTAL_BROWSER=/opt/brave.com/brave/brave \
GRAVITY_PORTAL_VITE_MODULE=../node_modules/vitest/node_modules/vite/dist/node/index.js \
GRAVITY_PORTAL_TEST_ARTIFACTS=/tmp/grav-99-final \
npm run -w client test:portal-browser
```

Use `GRAVITY_PORTAL_SCENARIOS=modal,drawer` to restrict a local reproduction to named consumers. The optional `GRAVITY_PORTAL_REPORT_ONLY=1` records baseline failures without exiting on assertions. Normal runs fail on any regression. Browser validation uses a production build; StrictMode's development-only replay is exercised by the DOM tests. Hydration is tested with React `renderToString`/`hydrateRoot` in jsdom, not an application SSR route. Firefox and WebKit were not run.

## Validation results

- All 115 client test files / 746 tests passed using Node 22 (`cd client && /usr/bin/node-22 node_modules/vitest/vitest.mjs run`). Node 26's initial suite attempt hit unrelated `localStorage` availability failures; no application storage changes were made.
- All 36 Chromium browser scenarios passed, including normal and reduced motion and the application CSS width override.
- `npm exec -w client tsc -- -b --pretty false` and `git diff --check` passed.
- Targeted ESLint passed for the new lifecycle test and browser fixture.

The browser fixture initializes the application's dark theme for screenshot review. Baseline measurements above describe the initial reproduction run; theme borders can change the final panel's outer dimensions slightly without changing alignment.

## Review follow-up

The first review reproduced two additional issues and added regression coverage before publication:

- Modal/Drawer reopened 50ms into their exit still ran the previous unmount timer, destroying and recreating the dialog. Effect cleanup now cancels the deadline on reopen or unmount, and entrance animations cancel the previous animation. StrictMode tests exercise timer cancellation and preserve the original dialog node; browser checks verify the final visible state and scroll lock.
- Intrinsic Popover sizing overrode the mobile ticket filter's intended stretch between its 8px left/right insets. The mobile consumer now explicitly uses `width: auto`. At a 390px viewport, the panel must occupy 374px in both motion modes.

The browser assertions now require animations to settle at full opacity, and verify tooltip reentry preserves its mounted node. These checks supplement entrance-frame sampling so a permanently transparent overlay cannot pass.

The follow-up review of the corrected lifecycle, responsive CSS, SSR/hydration contract, and regression harness found no further actionable issues. The final 36 browser scenarios and 746 client tests passed.
