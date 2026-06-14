# ContextMenu

The `ContextMenu` is a highly customizable, declarative right-click context menu built for the Gravity application. It supports infinite depth nested submenus, keyboard navigation, collision detection (edge-flipping), and fully accessible portal rendering.

## Overview

The component is exported as a namespace object `ContextMenu` with static properties for its sub-components, enabling a clean declarative API:

```tsx
import { ContextMenu } from '@library';

<ContextMenu.Root content={
  <>
    <ContextMenu.Item icon={<Edit />} onClick={() => edit()}>Edit</ContextMenu.Item>
    <ContextMenu.Item>
      More Actions
      <ContextMenu.SubMenu>
        <ContextMenu.Item danger onClick={() => delete()}>Delete</ContextMenu.Item>
      </ContextMenu.SubMenu>
    </ContextMenu.Item>
  </>
}>
  <div className="right-clickable-area">Right click me!</div>
</ContextMenu.Root>
```

## Exports

- `ContextMenu`
- `ContextMenu.Root` (Alias for `ContextMenuRoot`)
- `ContextMenu.Item` (Alias for `ContextMenuItemComponent`)
- `ContextMenu.SubMenu` (Alias for `ContextMenuSubMenu`)

*(Note: The component is exported using `Object.assign` to preserve static properties in environments using React Fast Refresh.)*

## Components & Props

### ContextMenu.Root

The root container that captures the `onContextMenu` right-click event.

| Prop | Type | Description |
| ---- | ---- | ----------- |
| `children` | `React.ReactNode` | The trigger element. This is the area the user right-clicks to open the menu. |
| `content` | `React.ReactNode` | The declarative menu content (typically a fragment of `ContextMenu.Item`s). |
| `trigger` | `React.ReactNode` | (Optional) Alternative way to specify the trigger. If used, `children` becomes the menu content instead. |
| `items` | `ContextMenuItem[]` | (Optional) Legacy object-based configuration for menu items. |

### ContextMenu.Item

An individual, actionable item within a menu or submenu.

| Prop | Type | Description |
| ---- | ---- | ----------- |
| `children` | `React.ReactNode` | The item label or content. If it contains a `ContextMenu.SubMenu`, it acts as a trigger. |
| `icon` | `React.ReactNode` | (Optional) Icon rendered on the left side of the item. |
| `onClick` | `() => void \| Promise<void>` | (Optional) Function called when the item is clicked. |
| `danger` | `boolean` | (Optional) If true, renders the item with error/danger styling (usually red). |
| `disabled` | `boolean` | (Optional) If true, disables clicks and renders with lower opacity. |
| `closeOnClick` | `boolean` | (Optional) Defaults to `true`. If `false`, the menu remains open after clicking. |

### ContextMenu.SubMenu

Defines a nested submenu. Must be rendered **inside** a `ContextMenu.Item`.

| Prop | Type | Description |
| ---- | ---- | ----------- |
| `children` | `React.ReactNode` | The content of the submenu, consisting of more `ContextMenu.Item`s. |

## How It Works

### Event Propagation
The `ContextMenu.Root` intercepts the `onContextMenu` event, calls `e.preventDefault()` to stop the browser's native menu, and calls `e.stopPropagation()` to prevent nested `ContextMenu.Root` wrappers from overlapping.

### Hover Intent & Timeouts
Submenus use a robust timeout mechanism to prevent accidental closures when moving the mouse from a parent item into the submenu popup.
- Opening a submenu has a `100ms` delay.
- Closing a submenu has a `200ms` delay, which is canceled if the mouse re-enters the submenu bounds.

### Viewport Collision (Edge Flipping)
When the menu or a submenu opens, it calculates its bounding box relative to `window.innerWidth` and `window.innerHeight`. If the menu would render off-screen (e.g., clipped by the right or bottom edges), it flips its positioning to remain fully visible.

### Accessibility & Keyboard Navigation
- Renders via a React `<Portal>` attached to the document body to escape `overflow: hidden` constraints.
- Employs `<FocusTrap>` to keep keyboard focus inside the active menu.
- **ArrowDown / ArrowUp**: Cycles focus through items.
- **ArrowRight**: Opens the focused submenu.
- **ArrowLeft**: Closes the current submenu and returns focus to the parent.
- **Enter / Space**: Triggers the selected item.
- **Escape / Tab**: Closes the entire context menu.

## Usage Instances

The `ContextMenu` is heavily utilized throughout the Gravity app to provide quick actions without cluttering the UI:

- **Tickets**: 
  - Right-clicking a ticket opens the `TicketContextMenu` offering quick actions like assigning members, modifying priority, and moving the ticket to another project.
- **Sidebar**:
  - Right-clicking the main workspace sidebar provides quick creation actions (e.g., "New Ticket", "New Label", "New Project").
- **Workspace Filtering**:
  - Clicking "Filter By" in the workspace header utilizes a deeply nested `ContextMenu` to filter tickets by status, priority, and assignees (rendering their avatars/icons inline).
- **Notes**:
  - Right-clicking in the Notes view offers quick actions to "Create New Note" and to instantly sort notes by "Newest" or "Oldest" (with full-stack pagination support).
