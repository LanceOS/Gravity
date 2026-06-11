# Changelog

All notable changes to this project will be documented in this file.

## [0.7.6] - 2026-06-10

### Notes
- Launched Notes as a brand-new workspace feature, including sidebar entry points, list views, and workspace-scoped CRUD services.
- Switched note editing from Tiptap back to ProseMirror and tightened the editor around selection bubbles, markdown input rules, autosave timing, and title synchronization.
- Added note search, media upload support, media deletion, and orphaned asset cleanup so the feature is usable end to end.
- Hardened the note editor with safer markdown link handling and fixes for save race conditions.

### Tickets And Labels
- Renamed domains to labels across the product and updated the UI and backend to match the new terminology.
- Allowed tickets to hold multiple labels and added workspace label management for creating and organizing them.
- Added MCP-aware label operations, including tools to read, update, and delete labels.
- Refined ticket editing with a TicketUtilities component, explicit edit mode, and cleaner component structure.
- Redesigned the ticket filter UI with popovers, badges, URL-synced filters, and better mobile and desktop behavior.

### Integrations And Platform
- Added GitHub project repository settings and webhook-driven ticket status transitions.
- Secured webhook handling with HMAC-SHA256 verification, rate limiting, URL validation, and payload validation.
- Centralized TanStack Query configuration and fixed cache state sync issues.
- Migrated to react-router-dom for URL-based routing, including deep-linkable ticket routes and mobile full-screen navigation.
- Added RustFS-backed object storage and secure streaming for uploads and downloads.
- Cleaned up TicketContext networking and fixed the rapid-fire request loop that caused repeated API calls.

## [0.6.9] - 2026-05-29

- Release: bump versions to 0.6.9 across packages.
