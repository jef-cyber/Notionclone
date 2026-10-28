# Lumen

A Notion-inspired workspace: **React 18 + Vite on the front end, Express + Mongoose on the back end.**
The API and the production build run from one Node process and one port.

## Requirements

- Node.js >= 18
- A running MongoDB (local `mongodb://127.0.0.1:27017` is the default)

## Setup

```bash
npm run setup                        # installs backend and frontend dependencies
cp backend/.env.example backend/.env # then edit it
```

`backend/.env` is git-ignored — never commit it. Configuration:

| Variable           | Purpose                                             |
| ------------------ | --------------------------------------------------- |
| `MONGODB_URI`      | MongoDB connection string                           |
| `JWT_SECRET`       | Signing key for session tokens                      |
| `JWT_EXPIRES_IN`   | Token lifetime, e.g. `7d`                           |
| `PORT`             | Port for both the API and the built frontend (default `4000`) |
| `CORS_ORIGIN`      | Allowed origin if the frontend is served separately |
| `LOG_REQUESTS`     | Set to log every request                            |

## Run

Build the frontend, then start the Express server that serves it:

```bash
npm run build     # Vite production build -> frontend/dist
npm run dev       # node --watch server.js, via backend/
```

Then open `http://localhost:4000`. The API lives under `/api`; the app itself is
served from `frontend/dist`, so same-origin requests need no CORS setup. On boot
the server asserts the six collection names and refuses to start if they have
drifted.

For frontend work with hot module replacement, run these in two terminals:

```bash
npm run dev            # API on :4000
npm run dev:frontend   # Vite on :5173, proxying /api to :4000
```

Open `http://localhost:5173` while using the Vite dev server.

Other root commands forward to the relevant package:

```bash
npm run start     # production start (no file watching)
npm run smoke     # end-to-end API smoke test
```

`npm run smoke` boots the real Express app in-process on an OS-assigned port,
talks to it over HTTP exactly like the browser does, exercises every resource and
authorization rule, and deletes everything it creates. It needs a reachable
MongoDB and leaves no residue. The current suite runs 111 checks, including
timeline dependency validation for all four dependency types.

## Data model

Everything lives in **six collections**. The interesting constraint is that
"different-looking" features are never new collections — a database block,
kanban board, calendar, list, gallery and timeline are all the same documents:

| Collection          | Holds                                                    |
| ------------------- | -------------------------------------------------------- |
| `users`             | Accounts, bcrypt password hashes                         |
| `workspaces`        | One per account on sign-up; the ownership boundary       |
| `workspaceMembers`  | User ↔ workspace membership with a role                  |
| `pages`             | The page tree, nested through `parentPageId`             |
| `blocks`            | Every content type, distinguished only by `type`         |
| `dataTable`         | Rows and column definitions behind any database view     |

Two shapes are worth knowing:

- **`blocks`** stores `content` (the primary payload, e.g. `{ text: "…" }`) and
  `properties` (per-type extras, e.g. `{ checked: false, icon: "💡" }`). Both are
  `Mixed`, so a new block type needs no migration. Per-type extras belong in
  `properties` — that is where the frontend reads them back.
- **`dataTable`** holds a flexible `properties` map (`{ Status: { type: "select",
  options: [...] } }`), flat `rows` of `{ [column]: value }`, and optional
  `dependencies` records (`finish-to-start`, `start-to-start`,
  `finish-to-finish` or `start-to-finish`) for timeline tasks. A `database`
  block is only a
  *pointer* to one of these, stored as `properties.dataTableId`; the rows
  themselves never enter the `blocks` collection.

## Architecture

```
frontend/
  index.html          Vite entry document
  vite.config.js      React plugin, /api proxy for the dev server
  public/assets/      Icons and illustration
  src/
    main.jsx          React root
    hooks.js          useStore / app context hooks
    appContext.js     Navigation and editor actions shared by components
    components/       Every React component lives here, grouped by feature
      App.jsx         Shell, routing, boot, shortcuts, global overlays
      menus.jsx       App-level menu and modal builders
      auth/Auth.jsx   Landing, login, register
      common/PageCard.jsx
                      Shared page/favorite card and empty state
      layout/
        Sidebar.jsx   Page tree, favorites, workspace switcher, drag/drop
        Topbar.jsx    Breadcrumbs, page actions, search trigger
        MobileNav.jsx Bottom navigation below 720px
      ui/
        index.jsx     Public UI toolkit exports
        Icon.jsx      Inline SVG icon set
        Toast.jsx     Toast renderer
        Menu.jsx      Context menus and submenus
        Modal.jsx     Dialogs, confirm flow and modal layer
        helpers.js    Formatting, platform and clipboard helpers
      editor/Editor.jsx
                      Page header, block editing, slash menu, toolbar
      database/Database.jsx
                      Table / board / list / gallery / calendar views
      database/TimelineView.jsx
                      Interactive timeline, drag/resize and dependencies
      database/databaseUtils.js
                      Shared database, date and dependency helpers
      overlays/
        SearchModal.jsx Global search dialog
        CommandPalette.jsx Command palette
      views/          Dashboard, Activity, Favorites, Templates, Search,
                      Trash, Settings, PageView
    core/
      api.js          The only module that knows about HTTP
      auth.js         Register / login / session validation
      store.js        State, optimistic writes, lazy blocks, search
      externalStore.js
                      Framework-agnostic store primitive
      toast.js        Toast queue shared by the store and renderer
      theme.js        Light / dark / system
      data.js         App metadata, settings defaults, templates
      blockTypes.js   Slash-menu vocabulary
    styles/           The original design tokens and component styles
backend/
  app.js              Express app: /api + frontend/dist + SPA fallback
  server.js           Process entry point (connects to Mongo, then listens)
  config/             db.js (connection), constants.js
  controllers/        HTTP layer: parse, delegate, respond
  services/           Business logic and authorization
  models/             Mongoose schemas (one per collection)
  routes/             URL -> controller
  middleware/         auth.middleware.js, error.middleware.js
  utils/              ApiError, objectId, respond, token, asyncHandler
  scripts/smoke.js    End-to-end API test
```

### Frontend conventions

- React views are mounted by `components/App.jsx`; every component lives under
  `components/`, grouped by feature. The CSS contracts (`#sidebar`, `.modal-root`,
  `.menu-root`, `.slash-menu`, `.format-toolbar`, `.toast-root`) are unchanged, so
  the existing styles and responsive breakpoints still apply.
- `core/api.js` is the only place that knows about HTTP. It unwraps the
  `{ success, data }` envelope, attaches the bearer token, and turns a `401`
  into a single `lumen:unauthorized` event so the app drops the session exactly
  once instead of reacting per request.
- `core/store.js` is framework-agnostic state plus optimistic writes. React reads
  it through `useSyncExternalStore`; the store mutates its cache in place and
  bumps a version counter to notify subscribers.
- The store applies mutations to its local cache first and flushes the network
  write afterwards, debounced per page. That is what keeps typing responsive.
  A block's creation `POST` is always awaited before a `PATCH` for the same
  block, so a patch can never overtake the block it modifies.
- Only preferences live in `localStorage` (`lumen.prefs.v1`). The session token
  is `lumen.token.v1`, and the optional API base override is
  `lumen.apiBase.v1`. Your actual content is never in the browser's storage.
- The API base defaults to same-origin `/api`. To serve the frontend separately,
  set `localStorage["lumen.apiBase.v1"]` (or `window.Lumen.API_BASE`) and set
  `CORS_ORIGIN` on the server.

## Features

- **Auth** — register, login, JWT sessions, profile editing, workspace
  auto-provisioning with a starter page and a sample database.
- **Pages** — nested trees, rename, favorite, duplicate, move, archive, and
  permanent delete. Trashing archives a whole subtree; deleting removes the
  pages, their blocks and their tables.
- **Block editor** — text, H1–H3, bulleted/numbered lists, to-dos, quote, code,
  callout, divider, image, video, toggle, and database blocks. Type `/` for the
  command menu, `Enter` to split, `Backspace` to merge, drag the handle to
  reorder.
- **Databases** — one document, six views: table, board (drag a card between
  status columns), list, gallery, calendar, and an interactive timeline.
  Switching views never moves or copies data, because there is only one copy.
  New rows appear immediately and reconcile with the server afterwards.
- **Timeline** - day/week/month/quarter zoom, scale-aware snapping, drag to
  move, drag either edge to resize, edge auto-scroll, Escape cancellation and
  live date/duration previews. Pointer moves are frame-coalesced, and every bar
  has a full-row-height grab halo so one-day tasks stay draggable even at
  quarter zoom. Finish-to-start, start-to-start,
  finish-to-finish and start-to-finish dependencies render as edge-appropriate
  SVG connectors, can be selected or removed by keyboard, and are validated
  before saving. Invalid schedules, cycles, duplicates and self-links are
  rejected instead of silently changing other tasks; failed saves roll back
  only the affected row or dependency.
- **Search** — `Ctrl/⌘ + K` across page titles and block content.
- **Command palette** — `Ctrl/⌘ + Shift + P`.
- **Activity** — derived from the pages collection; there is no notifications
  collection to invent one.
- **Import** — paste or open `.txt` / `.md` into a new page.
- **Theming** — light, dark, and system, all driven by the CSS tokens in
  `style.css`.
