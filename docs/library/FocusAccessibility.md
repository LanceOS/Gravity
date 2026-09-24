# GRAV-60: focus and display: contents acceptance

Runtime check: September 24, 2026, on branch
`feature/grav-60-verify-focus-and-accessibility-semantics-of-disp`, based on
updated main `8cde01a9`. The backlog audit based on `83d275a3` did not include
runtime acceptance; the results below are a new run.

## Findings and changes

The real FocusTrap, Modal, Drawer, DropdownMenu and ContextMenu components are
mounted in a production-bundled standalone fixture. No account or backend is
needed. The wrappers retain `display: contents`: no loss of descendant roles or
names was reproduced by the checks below, and ordinary focus traversal worked.
At the time of this audit, dropdown/context-menu keyboard **trigger** semantics
remained GRAV-98 and menus were opened with pointer events. The subsequent
[GRAV-98 trigger changes](InteractiveTriggers.md) extend this fixture with
keyboard invocation and additional disclosure coverage.

Two defects were reproduced before the fixes in Chromium and Firefox:

- FocusTrap included controls inside hidden/inert ancestors, disabled fieldsets,
  and native controls with negative tabindex. Initial focus could remain on the
  outside opener or move to a control outside the sequential tab order. Hidden
  controls at the boundaries could also prevent wrapping. The filter now checks
  native tab order, effective disabled/inert state and rendered visibility. A
  style/ancestor fallback supports runtimes without `checkVisibility`.
- Drawer exposed an unnamed dialog despite a visible title. Its dialog now uses
  `aria-labelledby` with a unique `useId` reference to its own heading.

## Executed coverage

| Engine | Version | Keyboard and DOM-derived semantics | Native accessibility tree |
| --- | --- | --- | --- |
| Chromium | 147.0.7727.15 | 14 scenarios passed | CDP `Accessibility.getFullAXTree` roles/names passed |
| Firefox | 148.0.2 | 14 scenarios passed | Not captured |
| WebKit | 26.4 | 14 scenarios passed | Not captured |

All runs were headless desktop engines on Linux with reduced motion. Playwright
is pinned at 1.59.1. WebKit here is the Playwright engine, not a macOS Safari run.

The 14 scenarios per engine cover:

- Initial focus, forward Tab, reverse Tab and wrapping in a basic trap, including
  children of another `display: contents` element; return focus on unmount.
- Valid controls in the first legend of a disabled fieldset and controls that
  restore `visibility: visible` under a hidden ancestor.
- Eight separate exclusion cases at both boundaries: HTML hidden ancestor, CSS
  hidden ancestor, inert ancestor, disabled fieldset, tabindex -1, tabindex -2,
  hidden input, and visibility-hidden button.
- Actual Modal and Drawer dialog roles/names, labeled fields, focus wrapping and
  return focus after closing.
- Descendant button semantics through both menu wrappers; dropdown item Tab
  traversal; context-menu roles/items, ArrowDown movement, Escape dismissal and
  focus restoration.

Playwright `ariaSnapshot()` and role locators derive semantics from the rendered
DOM. They are **not** evidence that Firefox/WebKit expose the same native
accessibility tree to assistive technology. Chromium additionally checks actual
non-ignored native AX nodes and their dialog/menu ancestry, independently of
those DOM-derived snapshots.

Semantic assertions resolve each expected role/name directly. Whole-page ARIA
snapshots can omit a visible child under a `visibility: hidden` parent, so the
saved snapshot alone is not used to reject that valid focus target. Chromium's
native tree and real keyboard traversal both pass this visibility-override case.

Remaining acceptance: native Firefox and Safari/WebKit accessibility-tree
inspection and supported OS/screen-reader combinations. These results do not
claim complete screen-reader acceptance, mobile coverage, all nested overlays,
or coverage of every possible custom FocusTrap child.

## Regression commands

```sh
npm run -w client install:focus-accessibility-browsers
npm run -w client test:focus-accessibility
```

On a supported Linux host, install Playwright system dependencies if needed with
`npx playwright install-deps`. The default test runs all three engines and fails
if an engine cannot launch. For a targeted run or retained evidence:

```sh
GRAVITY_FOCUS_TEST_BROWSERS=chromium npm run -w client test:focus-accessibility
GRAVITY_FOCUS_TEST_ARTIFACTS=/tmp/gravity-focus-evidence npm run -w client test:focus-accessibility
```

Artifacts include DOM-derived `.aria.yml` snapshots for all engines and native
Chromium `.ax.json` trees. Local CI invokes this suite alongside the existing CSP
browser checks and installs browser system dependencies on GitHub Actions. Unit regressions also verify the fallback focus filter and unique
Drawer title associations.

Local verification: 42 browser scenarios, 10 relevant Vitest tests across
`layout-utilities`, `contextmenu`, and `overlay-surfaces`, and `tsc -b` passed.
The host's Vite 8 native build crashed (SIGILL/SIGSEGV), so the acceptance fixture
was bundled using the already installed Vitest Vite 7.3.5 runtime through a
**temporary external module loader**, with the same fixture and Vite config.
Node 22.22.2 was used; temporary ICU/JPEG compatibility libraries enabled WebKit
on this non-Playwright-supported Linux distribution. No production bundler,
package lock, or system dependency changes were made as a workaround. Standard
Vite 8 fixture/production build execution still needs a supported build host.

References: [Playwright ARIA snapshots](https://playwright.dev/docs/aria-snapshots),
[Playwright DOM snapshot implementation](https://github.com/microsoft/playwright/blob/v1.59.1/packages/injected/src/ariaSnapshot.ts).
