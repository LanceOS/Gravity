# Tooltip placement — GRAV-95

Verified against `origin/main` at `ac56708a`. Tooltip still used an unmeasured absolute element inside a body portal. The portal browser fixture manually supplied fixed coordinates, masking the defect.

Tooltip now measures its trigger and mounted portal before paint. It uses fixed viewport coordinates, centers below the trigger with a 6px gap, flips above when there is insufficient room below, and clamps horizontally with 8px viewport padding using the existing dropdown positioning helper. Intrinsic width is limited to the viewport and long words wrap. Layout dimensions exclude the animation transform so entrance/exit motion does not affect placement.

Capturing scroll events covers nested scroll containers. Window resize and ResizeObserver notifications for both trigger and tooltip update placement while mounted, including exit animation. Content/style changes also remeasure, even without ResizeObserver. An animation-frame check tracks position-only trigger movement while mounted, without writing styles when the trigger is unchanged. Closing or unmounting removes listeners, disconnects observers, and cancels the frame. Portal's SSR/hydration behavior is unchanged.

The `style` prop continues to customize appearance and sizing. Position, coordinates, margins and opposing offsets are managed by Tooltip; callers no longer need manual portal coordinates. There is no new placement prop. Position-only layout changes, including moving ancestors, are tracked while mounted. Multiline tooltips that fit the viewport are vertically clamped when neither side has enough room; in that case they may overlap the trigger. Content taller than the viewport cannot be fully displayed at once.

## Regression checks

- `client/src/test/library/tooltip-placement.test.tsx`: actual body portal, initial coordinates, nested scroll, viewport resize, edge clamping/flipping, trigger/content observation, changed content without ResizeObserver, visual styles, close/reopen/unmount cleanup under StrictMode.
- `client/scripts/portal-browser-test.mjs`: real production tooltip fixture without placement overrides, first-frame horizontal placement, settled anchor alignment, viewport resize/clamping/flipping, normal/reduced motion, and existing exit/reentry checks.

Non-Docker commands from the repository root (using installed dependencies):

```sh
/usr/bin/node-22 client/node_modules/vitest/vitest.mjs run --root client src/test/library/tooltip-placement.test.tsx src/test/library/feedback.test.tsx src/test/library/overlay-lifecycle.test.tsx
/usr/bin/node-22 node_modules/typescript/bin/tsc -b client --pretty false
GRAVITY_PORTAL_BROWSER=/opt/brave.com/brave/brave \
GRAVITY_PORTAL_VITE_MODULE=../node_modules/vitest/node_modules/vite/dist/node/index.js \
GRAVITY_PORTAL_SCENARIOS=tooltip \
/usr/bin/node-22 client/scripts/portal-browser-test.mjs
```

The browser harness serves only an isolated temporary fixture, with no application server, containers, or shared data. The Vite override uses the installed Vitest Vite version, as documented in the portal acceptance notes. Browser coverage is Chromium only.

## Results

All 16 targeted DOM tests, the client TypeScript build, targeted test/fixture ESLint, and `git diff --check` passed. All placement assertions passed in both Chromium motion modes. The existing driver-timed rapid-reentry assertion passed initially but failed on a later run; a temporary browser-local 50ms reentry diagnostic passed both scenarios. This harness timing sensitivity is tracked in GRAV-245 rather than changing animation lifecycle in this placement fix.

## Critical review follow-up

The review found and fixed position-only layout drift and vertical overflow when a multiline tooltip fits the viewport but neither side of the trigger. Regression tests cover animation-frame repositioning/cancellation and vertical clamping. Scroll observation is passive. The final review covered the full diff (including new tests/docs), effect cleanup, portal timing, visual style compatibility, safe text rendering, and normal/reduced-motion placement. No further actionable in-scope findings remained. The follow-up run passed all 16 DOM tests, the client TypeScript build, targeted ESLint, diff checks, and both Chromium scenarios (including the existing reentry assertion on this run). GRAV-245 remains open for its previously observed intermittent timing failure.
