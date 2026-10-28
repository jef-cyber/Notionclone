# Lumen — Notion Clone Roadmap

## Objective

Move the existing Lumen app toward Notion-style visual and functional parity without replacing the project, resetting data, or removing working features.

## Phase status

| Phase | Scope | Status | Notes |
| --- | --- | --- | --- |
| 1 | Audit repository, schema, routes, state, tests | Complete | See architecture/feature matrix. |
| 2 | Design shell, sidebar, tokens, responsive behavior | Complete from prior pass | Existing Notion-like shell retained. |
| 3 | Pages, hierarchy, actions, persistence | Complete from prior pass | Nested pages, trash, favorites, drag/drop. |
| 4 | Block editor, formatting, slash commands, autosave | Partial | Core editor works; rich text colours, revisions and comments remain. |
| 5 | Databases: properties, rows, views, filters, sorts | Partial | Six views and optimistic rows are verified. Filters, sorts, property reordering and database-local search remain. |
| 6 | Timeline: drag, resize, dependencies, connectors | Complete for scoped feature | Pointer drag, snapping, both resize edges, auto-scroll, Escape, four dependency types, rollback and connector alignment verified. |
| 7 | Performance: measured bottlenecks and optimistic updates | Partial | Optimistic row creation and targeted writes verified; virtualization and trace-based measurement remain. |
| 8 | Search, command palette, settings, import/export | Partial | Search/palette/import exist; export missing. |
| 9 | Sharing, permissions, comments, real-time | Partial | Workspace roles/sharing link exist; comments/real-time missing. |
| 10 | Hardening: security, a11y, responsive, tests | In progress | 111 API checks, 22 general, 24 database and 40 timeline-interaction browser checks pass; browser tests are not committed. |

## Completed in this pass

- Audited all six collections, API route groups, services and editor/database components.
- Added five project documents.
- Added list and gallery database views over the same rows.
- Added optimistic database row creation with rollback and temporary-id reconciliation.
- Added a dedicated pointer-driven timeline with day/week/month/quarter zoom, sticky labels, today marker and navigation.
- Added drag-to-move and left/right resize with inclusive end dates and local previews.
- Added data-table dependency records, client/server validation, cycle/self/duplicate rejection and SVG connectors for finish-to-start, start-to-start, finish-to-finish and start-to-finish.
- Added link mode, record-dialog dependency controls and a manual scheduling policy: invalid schedules are rejected, never silently cascaded.
- Added scale-aware snapping, continuous edge auto-scroll, Escape cancellation and a live date/duration preview to timeline drags.
- Added one-day minimum resize, opposite-date preservation and a narrow-bar fallback that keeps small tasks draggable.
- Coalesced pointer moves and auto-scroll into animation frames and added a minimum 32px, full-row-height grab halo so every bar can be picked up even at quarter zoom.
- Added selectable dependency connectors/details, keyboard deletion and shared validation for date edits from the timeline, calendar and record dialog.
- Added queued dependency/view-config writes and serialized per-row writes so rapid edits cannot reorder on the server.
- Added optimistic rollback for failed row and dependency writes, including fault-injected browser checks.
- Verified with the real production build: 75 modules, 0 build errors; API smoke 111/111; general browser workflow 22/22; database/timeline browser workflow 24/24; timeline interaction workflow 40/40.
- Verified optimistic row creation is visible before `POST` and persists with the selected date.
- Verified both resize edges, duration-preserving move, day/week/month snapping, auto-scroll, Escape, live preview, connector alignment, four dependency types, invalid schedules, duplicate/cycle/self prevention, rollback and rapid writes.
- Verified a one-day bar at quarter zoom can be dragged from outside its visible edge using the 32px grab halo.

## Known gaps at this checkpoint

- No committed browser test harness. The three passing CDP scripts live in the OS temp directory and are documented in `NOTION_CLONE_TESTING.md`.
- Filters/sorts/database search are not implemented; all views render the full row set.
- Timeline dependency scheduling is enforced in the client. The server validates structure, row references, types and cycles but not dates, so a non-browser API client could store a schedule-invalid dependency.
- Connector paths are checked by geometry/alignment assertions, not a screenshot or pixel-diff visual test.
- Timeline previous/next navigation is not browser-driven.
- Bars narrower than 18 rendered pixels hide their resize handles until the user zooms in.
- One smoke run hit transient MongoDB Atlas `ETIMEDOUT` errors; the immediate stable rerun passed 111/111.

## Next priorities

1. Add database filter and sort controls persisted in `viewConfig`, applied consistently to every view.
2. Add property reordering and richer editors for multi-select, person, relation, phone, files and status.
3. Add per-database templates and saved view definitions.
4. Add pagination/virtualization for large row sets and timeline lanes.
5. Add comments, page-level ACLs and revision history.
6. Add export (Markdown/JSON/CSV) and a richer import path.
7. Add committed component tests and a repeatable browser test.
8. Audit rich-text rendering and file handling for production security.

## Explicit non-goals / blocked

- Real-time collaborative editing is not implemented. Yjs would require a WebSocket server and a collaboration-aware editor model.
- Pixel-perfect Notion verification is not claimed; no authenticated reference inspection was possible.
- No destructive migration is performed. Timeline fields are additive and optional.
