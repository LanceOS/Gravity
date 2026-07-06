# Mobile Settings and Preferences Design

## Purpose and Scope
This document explains the mobile design architecture and behavior for user settings, account preferences, and workspace directories within the Gravity client. It describes how interfaces that traditionally rely on complex sidebar routing and multi-column layouts adapt structurally on mobile devices to preserve usability.

## Boundary Limits
This document focuses exclusively on the UI/UX structural changes for settings and preference screens. It does not cover the underlying API mutations, user persistence, or authorization checks that occur when modifying settings.

## Key Files and Modules
- `client/src/modules/settings/screens/SettingsScreen.tsx`
- `client/src/pages/AccountPreferencesPage/AccountPreferencesPage.tsx`
- `client/src/pages/WorkspaceDirectoryPage/WorkspaceDirectoryPage.tsx`

## Flow Steps and Behaviors

### 1. Vertical Stacking vs. Sidebar Routing
On the desktop viewport, the `SettingsScreen` and `AccountPreferencesPage` utilize a two-column layout:
- **Left Column**: A navigational sidebar (e.g., Overview, Invites, Members / General, Provider, Onboarding).
- **Right Column**: The active content pane matching the selected tab.

On mobile viewports (`window.innerWidth <= 768`), this tabbed navigation model is completely removed.
- **Stacked Rendering**: Instead of rendering a single active tab, the components render *all* sections simultaneously.
- **Ordering**: The sections are stacked vertically in a single continuous scrolling view (e.g., General -> Provider -> Onboarding).
- **Header Suppression**: The top-level settings header text is conditionally hidden on mobile to avoid redundant titling and save vertical space.
- **Action Buttons**: The "Save Changes" or persistent action buttons are repositioned to span the full width at the bottom of the stacked layout.

### 2. Workspace Directory Accordion Conversion
The `WorkspaceDirectoryPage` allows users to select a workspace, accept invites, or create new workspaces.
- **Desktop**: Renders a wide layout where the list of workspaces is displayed, and the "Create or Join Workspace" form sits prominently alongside or below it as a persistent panel.
- **Mobile Adaption**: The "Create or Join Workspace" form takes up too much initial screen real estate on mobile devices.
- **The Solution**: The component wraps the form panel inside a `Library` Accordion component. It defaults to a collapsed state, hiding the complex form inputs behind a "Create or Join Workspace" toggle button, keeping the immediate focus on the user's available workspace list.

## Interfaces and Contracts
- **`isMobile` State Tracker**: Similar to the shell components, these pages manage their own local `isMobile` state via a `window.addEventListener('resize')` hook initialized to `window.innerWidth <= 768`. This local state drives the conditional rendering of the stacked versus tabbed UI blocks.

## Change Hazards and Invariants
- **Testing**: When making changes to the settings pages, the test suites (e.g., `SettingsPages.test.tsx`) enforce that all sections render concurrently in a stacked format when the window size is mocked to `< 768`. Breaking the concurrent rendering will cause test regressions.
- **Section Component Reusability**: Because the mobile view renders all sections simultaneously, the individual section sub-components (like `WorkspaceOverviewSection` or `ProviderSection`) must not have conflicting global states, IDs, or assumptions that they are the only section mounted on the screen at one time.

## Related Docs
- [MOBILE_LAYOUT_AND_SHELL.md](file:///home/lance/Documents/Code/Gravity/docs/client/MOBILE_LAYOUT_AND_SHELL.md)
- [MOBILE_TICKET_BOARD.md](file:///home/lance/Documents/Code/Gravity/docs/client/MOBILE_TICKET_BOARD.md)
