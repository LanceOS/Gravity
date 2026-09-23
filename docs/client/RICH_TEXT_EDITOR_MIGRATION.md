# Rich Text Editor Migration

The ticket and note editing experience now uses raw ProseMirror instead of TipTap.

## Editor Modes

- Notes use the full inline toolbar.
- Ticket descriptions and comments use the plain editor surface with the selection-triggered formatting bubble.
- Both paths persist ProseMirror JSON, render HTML for display, and export Markdown for copy actions.

## Ticket and Comment Sanitization

The ticket persistence services sanitize descriptions and comments for REST, MCP,
and webhook callers. Editor JSON retains literal text and formatting while unsafe
link/image URLs and unsupported attributes are removed. Safe legacy Markdown is
kept unchanged, including code examples and autolinks. HTML and mixed HTML/Markdown
are parsed, sanitized, and returned as ProseMirror JSON using the same schema as
the client, so API callers must use the returned value after saving.

Comments emptied by sanitization are rejected (HTTP 400 or MCP invalid parameters),
and failed updates preserve the existing comment. Structured audit events record
the operation, identifiers, format, and removal count without copying content.
The browser still sanitizes paste and render output to protect legacy records;
this change does not rewrite existing database rows.

## Bundle Size

The production client build should be used as the reference point for bundle impact.

Last verified on `2026-06-10` with `npm run build` in `client/`:

- `dist/assets/index-BzkuhOuU.js`
  - Raw size: `916.66 kB`
  - Gzip size: `280.68 kB`

The build still reports a chunk-size warning because the client bundle is already above the default threshold.
