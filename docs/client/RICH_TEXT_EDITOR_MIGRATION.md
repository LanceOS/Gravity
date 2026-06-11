# Rich Text Editor Migration

The ticket and note editing experience now uses raw ProseMirror instead of TipTap.

## Editor Modes

- Notes use the full inline toolbar.
- Ticket descriptions and comments use the plain editor surface with the selection-triggered formatting bubble.
- Both paths persist ProseMirror JSON, render HTML for display, and export Markdown for copy actions.

## Bundle Size

The production client build should be used as the reference point for bundle impact.

Last verified on `2026-06-10` with `npm run build` in `client/`:

- `dist/assets/index-BzkuhOuU.js`
  - Raw size: `916.66 kB`
  - Gzip size: `280.68 kB`

The build still reports a chunk-size warning because the client bundle is already above the default threshold.
