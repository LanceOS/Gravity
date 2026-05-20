**A Semantic, Highly Responsive, Decoupled Interface Architecture**

## 1. Design System Foundations & Semantic Tokens

To guarantee maximum accessibility, contrast, and visual consistency, all layouts strictly utilize the **Poppins** typography system. The interface shifts away from static, hardcoded hex values (like `bg-black`) to a robust **Tailwind Semantic Token Framework** which prevents unreadable text or dark mode failures.

### A. Typography

* **Primary Font:** `Poppins, sans-serif` (imported via `@fontsource/poppins` or Google Fonts CDN).
* **Scale Metrics:**
  * Display/Header: `font-semibold text-2xl tracking-tight text-foreground-main`
  * Sub-Header: `font-medium text-lg text-foreground-main`
  * Body: `font-normal text-sm text-foreground-muted leading-relaxed`
  * Small/Meta: `font-medium text-xs text-foreground-dim`

### B. Theme Color Token Map

By binding component styles to semantic color classes, we guarantee that elements dynamically adapt to light and dark themes without breaking legibility.

|    |    |    |    |
|----|----|----|----|
| **Semantic Token** | **Tailwind (Light Mode)** | **Tailwind (Dark Mode)** | **Purpose** |
| `bg-primary-app` | `bg-neutral-50` | `bg-neutral-950` | Root background |
| `bg-secondary-card` | `bg-white` | `bg-neutral-900` | Sidebar, cards, containers |
| `text-foreground-main` | `text-neutral-900` | `text-neutral-50` | Headers, primary labels |
| `text-foreground-muted` | `text-neutral-600` | `text-neutral-400` | Body copy, meta descriptions |
| `border-accent` | `border-neutral-200` | `border-neutral-800` | Component dividers |
| `brand-active` | `bg-indigo-600 text-white` | `bg-indigo-500 text-white` | Buttons, selected state |

### C. Button Contrast Resolution (Dark Mode Fix)

To prevent buttons from fading into unreadable black containers on dark backgrounds, interactive components are mapped to dynamic boundaries:

```
// Example of the Tailwind button compilation
const buttonBase = "px-4 py-2 rounded-md font-poppins text-sm font-semibold transition-all duration-200 active:scale-[0.98]";
const primaryBtn = "bg-indigo-600 text-white hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 dark:text-neutral-950";
const secondaryBtn = "bg-white text-neutral-800 border border-neutral-200 hover:bg-neutral-50 dark:bg-neutral-900 dark:text-neutral-200 dark:border-neutral-800 dark:hover:bg-neutral-800";
```

## 2. Global App Shell & Layout States

The application manages two distinct top-level layouts: the **Workspace Shell** (with workspace/project tree navigation) and the **Settings Portal** (which completely replaces the standard sidebars).

### A. Core Workspace Shell (Left-to-Right Flow)

The main navigation features a multi-tiered hierarchy. The user can switch servers, browse local/remote projects, and manage sub-entities under a single, unified panel.

```
┌────────────────────────────────────────────────────────────────────────┐
│ Global App Header                                         [User Profile]│
├───────────────┬────────────────────────────────────────────────────────┤
│ Workspace Drop│ Active View Panel                                      │
│               │ (Board vs List)                                        │
│ Project Tree  │                                                        │
│ ├─ Domain A   │ ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│ ├─ Cycle 01   │ │ Task A (Todo)│  │ Task B (Prog)│  │ Task C (Done)│    │
│ └─ Tasks      │ └──────────────┘  └──────────────┘  └──────────────┘    │
│               │                                                        │
├───────────────┤                                                        │
│ User Avatar   │                                                        │
│ & Role Info   │                                                        │
└───────────────┴────────────────────────────────────────────────────────┘
```

#### Element Checklist:


1. **Workspace Dropdown (Top Left):** Houses local connection registries. Swapping triggers a complete base Axios/fetch rewrite to the target Host URL.
2. **The Project Navigation Tree (Sidebar):** Domains, Cycles, and Views are listed as collapsible children beneath each respective Project item to keep context scoped.
3. **Active Workspace Card (Bottom Left):** Replaces basic user selection list. Displays user avatar, name, and their active role badge (e.g., `Owner`, `Contributor`). Clicking this area redirects the router to `/profile/:id`.

### B. Full-Screen Settings Layout (Bypassing Global Navigation)

When navigating to `/settings`, the global application shell is unmounted. It is replaced with a distraction-free, workspace-specific administration view.

```
┌────────────────────────────────────────────────────────────────────────┐
│ Settings Title                                            [Close (X)]  │
├───────────────────────┬────────────────────────────────────────────────┤
│ Settings Category List│ Detail Panel                                   │
│                       │                                                │
│ • General Preferences │ • Ollama Host Endpoint URL                     │
│ • Integrations        │   [ http://host.docker.internal:11434 ]        │
│ • AI Credentials      │                                                │
│ • Team & Validation   │ • Preferred Model Select                       │
│                       │   [ llama3.1 (Auto-Detected)    ▼ ]            │
│                       │                                                │
│                       │ • API Key Configuration                        │
│                       │   [ DeepSeek   ▼ ] [ **************** ]        │
│                       │   [ Test Connection Button (Warns Tokens) ]    │
└───────────────────────┴────────────────────────────────────────────────┘
```

#### Settings Panel Design Requirements:

* **The Settings Sidebar:** A dedicated left-side category layout containing links for General Preferences, Integrations, API Keys, and Team/Invitations.
* **The Close Button (X):** Placed in the top right, routing the user instantly back to their last-active project view.
* **Polymorphic API Key Wrapper:** The AI settings panel provides a dropdown mapping providers (`OpenAI`, `Anthropic`, `DeepSeek`, `Gemini`). Changing the option mounts the appropriate key forms and exposes the **"Test API Connection"** action button alongside an explicit warning message: *"Testing this integration will consume standard query tokens."*

## 3. View Orchestration (Lists, Boards, & Drag-and-Drop)

Swapping views from **Board to List** must perform smoothly without jarring layout flashes. To prevent layout flickering during state transition phases, the layout boundaries utilize **Layout Locks** and structural key bindings.

```
┌────────────────────────────────────────────────────────┐
│ Project Panel                                          │
├────────────────────────────────────────────────────────┤
│ Views: [ Board ] (Active)  [ List ]                    │
├────────────────────────────────────────────────────────┤
│ ┌────────────────────────────────────────────────────┐ │
│ │  Container Height Lock / Stable Flex Wrapper       │ │
│ │                                                    │ │
│ │  * AnimatePresence handles fade out of Board *     │ │
│ │  * Followed by clean fade/height-slide of List *   │ │
│ └────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────┘
```

### Transition Architecture Specs

* **State Locking:** Toggle changes are locked to a parent view state wrapper. The target state mutation is completed inside the database background (`PATCH /projects/:id/view`) before the component changes the view style, preventing instant rollbacks or flash errors.
* **Layout Stability:** The outer view wrapper is assigned a fixed min-height (`min-h-[500px]`) and layout transition animations are controlled via CSS hardware-accelerated transforms (`transform3d`) to prevent shifting of neighboring HTML components during renders.

## 4. Mobile Responsive Strategy

To resolve mobile layout issues, Gravity shifts to a touch-optimized, screen-adaptive layout engine using standard CSS breakpoints.

```
┌────────────────────────────────────────┐
│ Mobile Port View (< 768px)             │
├────────────────────────────────────────┤
│ [=] Gravity Workspace Title       [⚙️]  │
├────────────────────────────────────────┤
│                                        │
│  Active View Display (Tasks Grid)      │
│  ┌──────────────────────────────────┐  │
│  │ Task Title (Touch-Friendly Target)│  │
│  └──────────────────────────────────┘  │
│                                        │
├────────────────────────────────────────┤
│ [📁 Projects]  [🔄 Cycles]  [👥 Team]  │ <-- Mobile Bottom Sheet Nav
└────────────────────────────────────────┘
```

### Breakpoint Adaptation Protocols:

* **Tailwind Breakpoint Rules:**
  * **Desktop (**`md:`) & Up: Renders full sidebar, tree listings, drag-and-drop board cards, and full setting configurations.
  * **Mobile (**`< md:`) & Under: Sidebars collapse into a slide-out hamburger panel. Columns inside boards collapse into clean vertically-stacked lists, optimized for standard scroll configurations.
* **Bottom Sheet Sheet/Overlay Engine:** Complex navigation items (like project switching and view toggling) collapse into animated bottom sheet drawers on touch devices. Action items utilize touch target sizes at or above $48\\text{px} \\times 48\\text{px}$ to meet modern accessibility metrics.

## 5. Micro-Interactions & Popover Dismissal Engine

### A. The Outside-Click Dismissal System

To prevent multiple windows or options lists from staying open at the same time, all popover overlay dialogs register themselves into an active listener. When an event fires, the component checks if the pointer coordinate falls outside of its reference node.

```
// Custom React Hook for stable window dismissal
import { useEffect, useRef } from 'react';

export function useOutsideClick(callback: () => void) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        callback();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [callback]);

  return ref;
}
```

### B. Smooth, Hardware-Accelerated Animations

To achieve natural movement without dragging down frame rates (targeting animation times $T \\le 16\\text{ms}$ or $60\\text{fps}$), all transitions are bound to GPU-optimized styling variables:

* **Transform Styles:** CSS modifications are limited to `transform` and `opacity` properties (avoiding changes to layout properties like `height`, `width`, or `margin` that trigger browser reflow loops).
* **Timing Profiles:** Transitions are mapped to responsive, standard ease curves:
  * *Entrance animations:* `ease-out duration-200`
  * *Exit animations:* `ease-in duration-150`
  * *Active states (clicks):* `scale-95 transition-all duration-100`

## 6. UI Bug Prevention & Optimistic Updates

### Resolving the "Comment Flashing" Bug

The bug where creating comments causes other components to flash occurs because the UI tries to render before the network request returns. This is fixed using **Strict Parent Height Anchoring** and **Deterministic Payload Returns**.

```
[User Clicks "Save Comment"]
   │
   ├─► 1. UI renders an immediate, optimistic comment element
   │      (Identified by a temporary ID, styled with a light pulse animation).
   │
   ├─► 2. Parent comment feed height is locked via CSS (prevents page jumpiness).
   │
   ├─► 3. API resolves 'POST /tasks/:id/comments' 
   │      (Returns fully populated comment data with proper author profiles).
   │
   └─► 4. Hook swaps temporary ID for DB UUID, fading out the loading animation.
```

By maintaining static container bounds and feeding placeholder values during the API roundtrip, the interface updates smoothly without shifting the surrounding layout.