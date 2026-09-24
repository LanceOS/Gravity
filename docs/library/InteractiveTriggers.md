# GRAV-98: accessible interactive triggers

DropdownMenu, MegaMenu, Popover and Popconfirm now attach activation to a native
button. Text, icons and other non-interactive trigger content get a button;
existing HTML buttons and library `Button` components are composed directly.
They keep their styles, refs and event handlers, without nested buttons or a
clickable `div`. Trigger buttons use `type="button"`, `aria-expanded`,
`aria-controls` while open, and the library focus ring. Disabled and aria-disabled
buttons cannot toggle; an existing handler can cancel toggling with
`event.preventDefault()`.

Custom button components must opt into `triggerAsChild` and forward button props
(including events and ARIA attributes) to their native button. Custom visual
components need no opt-in. Trigger content must not contain other interactive
controls; use one button for the trigger.

```tsx
<DropdownMenu trigger={<span>Actions</span>}>
  <button type="button">Archive</button>
</DropdownMenu>

<Popover trigger={<Button>Filters</Button>}>
  <FilterForm />
</Popover>

<Popover triggerAsChild trigger={<CustomButton>Filters</CustomButton>}>
  <FilterForm />
</Popover>
```

Enter and Space use native button activation. Escape closes an open disclosure
and restores trigger focus; outside interaction closes without stealing focus.
Popover announces a dialog popup named from its trigger. It preserves autofocus
inside its content; otherwise it focuses the dialog without scrolling the page,
so Tab reaches its portaled controls. Existing trigger ids and caller-supplied
popup metadata are preserved. Closing dropdown/popover surfaces are inert during
exit animation. DropdownMenu and MegaMenu retain ordinary button/link Tab
navigation; arbitrary content is not given an ARIA `menu` role that would require
menuitem semantics and arrow navigation.

ContextMenu supports Shift+F10 and the Context Menu key from its focused target,
positions the menu beneath that target, and preserves the existing menu focus
and Escape behavior. Its actual child receives a default tab stop (an explicit
`tabIndex` is preserved), popup state and a focus ring. Custom target components
must forward those props or expose focusable descendants; keyboard events from
those descendants bubble to the context-menu listener.

ContextMenu's structural `display: contents` wrapper remains to preserve table
and flex layouts. It does not carry focus or an interactive role. The prior
[focus audit](FocusAccessibility.md) verified descendant semantics through this
wrapper; GRAV-98 removes DropdownMenu's clickable wrapper and adds keyboard
invocation to ContextMenu.

## Verification

The unit suite covers native and custom visual/button triggers, keyboard
activation, expanded/control relationships, refs, handler composition and
cancellation, disabled/loading/aria-disabled states, form submission prevention,
controlled popovers, outside dismissal, context-menu positioning/focus return,
autofocus search fields, dialog names and unique trigger label references.
The production-bundled browser fixture covers real Enter/Space, Tab, Escape,
Shift+F10 and Context Menu key behavior, plus Chromium native accessibility nodes.

```sh
npm run -w client test -- src/test/library src/test/components/ContextMenuConfirmDialog.test.tsx
npm exec -w client -- tsc -b
npm run -w client test:focus-accessibility
```

Verified September 24, 2026: 119 tests across 24 files, TypeScript build checks,
and 48 browser scenarios passed (16 each in Chromium 147.0.7727.15, Firefox
148.0.2, and WebKit 26.4). These are headless Linux engines with reduced motion;
Chromium additionally checks its native accessibility tree. This does not claim
manual screen-reader or native Safari acceptance. WebKit used the existing
temporary compatibility libraries described in the prior focus audit.

Local host notes: Node 26 exposes a web-storage global that conflicts with the
unchanged theme test's jsdom storage. Running Vitest with
`NODE_OPTIONS=--no-experimental-webstorage` avoids that host issue. The standard
Vite 8 browser build exits with a native SIGILL on this machine, as recorded in
the prior focus audit. Browser checks use the already installed Vite 7.3.5 runtime
via `/tmp/grav-60-vite-loader.mjs`; repository dependencies and production build
configuration are unchanged. Standard Vite 8 build acceptance still requires a
supported host.
