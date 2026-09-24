# UI materials and spacing

Gravity uses a soft glass frame around readable work surfaces. The default light
palette is Marble Blue; saved theme preferences continue to work.

## Shared materials

The material tokens live in `library/styles/theme.css` and derive their colors
from the active theme.

| Token | Use |
| --- | --- |
| `--surface-glass-subtle` | Navigation and quiet background panels |
| `--surface-glass` | Cards and workspace surfaces |
| `--surface-glass-strong` | Inputs, menus, and dialogs that need high readability |
| `--border-subtle` | Dividers and row separators |
| `--border-glass` | Soft surface outlines |
| `--shadow-sm` through `--shadow-xl` | Increasing elevation from cards to dialogs |

Reserve backdrop blur for navigation and floating overlays. Repeated rows and
cards use translucent fills without their own blur, keeping long lists cheap to
render. Browsers without backdrop-filter receive opaque surface fallbacks;
reduced-transparency preferences also switch materials to opaque fills.

## Component conventions

- Use shared radius and spacing tokens. Distinguish sections with whitespace
  before adding borders or nested cards.
- Keep labels in sentence case and use medium weights for controls. Reserve
  larger type for page titles.
- Use filled selection states and small status/priority indicators instead of
  heavy accent rails.
- Preserve visible keyboard focus, theme-aware status colors, and the existing
  reduced-motion behavior.
- Keep virtual row measurements aligned with rendered card heights whenever
  padding or typography changes.

Shared form styling belongs in `library/styles/library.css`. Client styles add
layout-specific variants rather than duplicating the base input and label rules.
The shared Card exposes a `.card` class for client styling and keeps explicit
`style` and `bodyStyle` overrides available.
