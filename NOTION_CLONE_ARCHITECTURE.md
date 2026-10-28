# Lumen — Notion Clone Architecture

## Scope

Lumen is an existing full-stack Notion-style workspace. This document records the architecture as inspected, not an aspirational replacement design.

## Stack

| Layer | Technology |
| --- | --- |
| Frontend | React 18, Vite 5, plain CSS |
| Routing | Custom hash routing in `frontend/src/components/App.jsx` |
| State | Framework-agnostic store + `useSyncExternalStore` |
| Backend | Node.js 18+, Express 4 |
| Database | MongoDB via Mongoose 8 |
| Auth | JWT bearer tokens, bcrypt password hashes |
| Tests | Express API smoke test (`backend/scripts/smoke.js`) plus temporary CDP browser checks (not committed) |

No new runtime dependencies were added for this work.

## Repository map

```
frontend/src/
  components/
    App.jsx              shell, boot, hash routing, shortcuts
    auth/                landing, login, register
    layout/              Sidebar, Topbar, MobileNav
    views/               Dashboard, Activity, Settings, Templates,
                         Favorites, Search, Trash, PageView, NotFound
    common/              ViewHeader, SearchResult, PageCard
    editor/              block editor, slash menu, toolbar, image dialog
    database/            Database.jsx: table, board, list, gallery,
                         calendar and timeline views
                         TimelineView.jsx: drag/resize/dependency timeline
                         databaseUtils.js: shared column, date and link helpers
    overlays/            search modal, command palette
    ui/                  Icon, Toast, Menu, Modal, helpers
  core/
    api.js               the only HTTP layer
    auth.js              login/register validation and session calls
    store.js             cache, optimistic writes, hydration, search
    externalStore.js     small external-store primitive
    theme.js             light/dark/system
    data.js              app metadata, settings, templates
  styles/                tokens, shell, sidebar, editor, database, responsive
backend/
  app.js                 Express app and static frontend
  routes/                /api route groups
  controllers/           HTTP parsing and responses
  services/              business logic and authorization
  models/                six Mongoose collections
  middleware/            auth and error handling
  scripts/smoke.js       end-to-end API test (111 checks at this checkpoint)
```

## Data model

Six canonical collections are pinned by name. There are no per-view collections.

### `users`

Account identity: name, email, password hash, avatar metadata.

### `workspaces`

Ownership boundary. Each account gets a workspace on registration.

### `workspaceMembers`

User ↔ workspace membership with `owner`, `admin`, `member` or `viewer` role.

### `pages`

A recursive page tree through `parentPageId`. Ordering is `position` among siblings. `isFavorite`, `isArchived`, `icon` and `cover` support workspace navigation and page presentation.

Indexes: workspace, parent, workspace+parent, creator, workspace+favorite, title text.

### `blocks`

One collection for every block type. A block stores `type`, flexible `content`, flexible `properties`, `position` and optional `parentBlockId`. The editor's UI type names are mapped to canonical API types in `frontend/src/core/store.js`.

Indexes: page, page+position, parent block, creator, block text search.

### `dataTable`

One generic database document per embedded database block:

- `pageId` and `workspaceId`
- `name`, `description`
- `properties` — flexible column definitions
- `rows` — flexible row maps with stable `id` strings
- `defaultView` — `table`, `board`, `list`, `gallery`, `calendar` or
  `timeline`; the legacy `roadmap` value is still accepted and opens as
  `timeline`
- `viewConfig` — per-view settings, including timeline zoom/anchor and the
  selected default view persisted by the UI
- `createdBy`
- `dependencies` — additive task dependency records
  `{ id, from, to, type }` for the timeline
- timestamps

Rows are the single source of truth for table, board, list, gallery, calendar
and timeline views. No row is copied when switching views.

The timeline and dependency fields are additive. Existing documents without
`dependencies` behave as `[]`; no migration script or destructive update is
required. `roadmap` documents continue to open because the frontend normalizes
the legacy view id.

## API surface

All routes are under `/api` and require a bearer token except auth/health.

| Resource | Endpoints |
| --- | --- |
| Auth | `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `PATCH /auth/me` |
| Workspaces | list/create/get/update/delete, members list/add/update/remove |
| Pages | list by workspace, create, get, update, delete, duplicate, children, search |
| Blocks | list by page, create, get, update, delete, reorder, search |
| Data tables | list by page, create, get, update, delete |
| Rows | add, update, delete |
| Health | `GET /health` |

## Request and state flow

```
UI action
  -> component calls AppContext action or store method
  -> store mutates cached state immediately where safe
  -> version counter increments; useStore subscribers re-render
  -> API request is sent
  -> server validates permissions and persists
  -> response is merged into the cache
  -> failed request rolls back or marks the item for retry
```

The store keeps content out of browser storage. Only preferences (`lumen.prefs.v1`) and the token (`lumen.token.v1`) are local.

## Authorization

`backend/services/access.service.js` is the single authorization gate:

- Resolve the resource first.
- Resolve its workspace from the resource itself.
- Verify the caller's `workspaceMembers` record and role.
- Never trust a browser-supplied workspace id as proof of access.

All controllers go through services that use these checks.

## Editor

`frontend/src/components/editor/Editor.jsx` is a contenteditable block editor:

- Page title and block text persist through the store.
- Slash menu, markdown-ish block types, formatting toolbar and block drag handles.
- Block creation is awaited before its first patch.
- Block and page writes are debounced.
- Image files are stored as data URLs under 1.5 MB.
- Existing content remains in the same `blocks` collection.

## Database views

`frontend/src/components/database/Database.jsx` renders one `dataTable` through
six view components:

- Table: editable cells.
- Board: grouped columns, drag to change a select property.
- List: compact rows with the title and shared metadata.
- Gallery: cards with the same shared metadata.
- Calendar: month grid, drag to change a date.
- Timeline: date-based bars, drag/resize and dependencies.

Column/date/status/dependency helpers are centralized in
`databaseUtils.js`; the views cannot drift on how they discover a title, date,
status or group column. `TimelineView.jsx` owns date math, pointer drag/resize,
dependency connectors and schedule validation rather than mixing those concerns
into the rest of the database shell.

### Database write behavior

- `addRow` inserts a temporary `row_local_*` record, assigns the real server id
  when the POST returns, and replays any edits made while it was pending.
- Updates for one row are serialized so two fast edits cannot overwrite each
  other out of order.
- Deletes wait for an in-flight update of the same row before sending DELETE.
- Timeline zoom/anchor writes and dependency writes each have an ordered queue.
- A failed create removes the temporary row; a failed dependency write restores
  the previous dependency array when it is still the visible state.
- Date edits from a drag, resize, calendar move or record dialog are checked
  against every affected dependency before the optimistic row update. An
  invalid schedule is rejected and the row keeps its previous dates.
- Dependency writes and view-config writes are ordered independently. Per-row
  writes are ordered per row, so a rapid move followed by a resize cannot let
  an older response win.

## Timeline model

- Task date columns are discovered from the database properties (start/end heuristics).
- The visible viewport is stored in `viewConfig` (`timelineZoom`, `timelineAnchor`).
- Task dates and viewport dates are separate. Scroll/zoom never changes task dates.
- Pointer drag moves a task and preserves its inclusive duration. Both edges
  resize, the opposite date stays fixed, and resizing cannot go below one day.
- Drags snap to the active scale: 1 day at day zoom, 7 days at week zoom, 1
  calendar month at month zoom and 3 months at quarter zoom. Month arithmetic
  clamps to the target month's last day.
- Edge auto-scroll runs continuously while a drag is held near the viewport
  edge. Escape cancels the drag and suppresses the follow-up row click.
- The bar shows proposed dates and duration during a drag. Nothing is written
  until pointer-up.
- Very narrow bars (under 28 rendered pixels) hide their resize handles so the
  whole bar remains draggable. Every bar also has a transparent, full-row-height
  grab halo at least 32 px wide, so a one-day bar at quarter zoom is still easy
  to pick up; zooming in exposes both resize handles.
- Pointer moves are coalesced into one animation frame, edge auto-scroll is
  time-based, and scrolling while a drag is active re-runs the preview math so
  the bar and connectors stay under the cursor.
- Dependencies are stored on the data table, not in a parallel task collection.
- Dependency records use `{ id, from, to, type }`. Supported types are
  `finish-to-start` (default), `start-to-start`, `finish-to-finish` and
  `start-to-finish`.
- Finish-to-start is strict: the successor starts after the predecessor ends.
  Start-to-start, finish-to-finish and start-to-finish allow equal dates because
  they express "cannot start/finish before" rather than a strict gap.
- The browser validates type-specific dates before saving a link, a drag/resize,
  or a date edit from the record dialog. The scheduling policy is **manual with
  validation**: invalid changes are rejected rather than silently cascading dates.
- Connectors attach to the edge implied by each type and are rendered in one SVG
  overlay. They realign after moves, resizes, timeline scroll, zoom and window
  resize. Rows are memoized so a pointer move does not re-render unrelated bars.
- Dependencies can be created by link mode or the record dialog, selected by
  clicking a connector or chip, inspected in a details strip, and removed with
  the Delete/Backspace key or the chip's remove button.
- The API rejects self-links, duplicates, unknown rows, unsupported types,
  unauthorized edits and cycles. Deleting or replacing rows prunes links that
  reference missing rows.
- Server-side date/schedule validation is not implemented because date-column
  discovery is currently a UI heuristic. This is a known gap for non-browser API
  clients.

## Security and integrity

- JWT middleware verifies tokens.
- Access services enforce workspace membership and minimum roles.
- Row/column values are coerced against declared properties.
- Dependency changes are validated against row ids and cycles.
- Destructive database operations require explicit confirmation in the UI.
- Secrets are read from environment variables; `.env` is not read or logged by the app.

## Known architectural limits

- No migration framework; schema fields are additive and backward-compatible.
- No real-time collaboration/CRDT layer.
- No object storage; images are embedded data URLs.
- The custom hash router is intentionally smaller than React Router.
- No automated component test suite is committed; browser tests are temporary.
- No database filters, sorts or server-side pagination/virtualization.
- Timeline scheduling validation is client-side; the API validates structure and cycles only.
- A data table is still one document with an embedded rows array. Very large tables will eventually need server-side rows.
