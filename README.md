# Lumen

A Notion-inspired workspace: **vanilla HTML/CSS/JavaScript on the front end, Express + Mongoose on the back end.** No frameworks, no bundler, no build step. One Node process serves both the JSON API and the static frontend, so everything runs on a single port.

## Requirements

- Node.js >= 18
- A running MongoDB (local `mongodb://127.0.0.1:27017` is the default)

## Setup

```bash
npm run setup                        # installs backend dependencies
cp backend/.env.example backend/.env # then edit it
```

`backend/.env` is git-ignored — never commit it. Configuration:

| Variable           | Purpose                                             |
| ------------------ | --------------------------------------------------- |
| `MONGODB_URI`      | MongoDB connection string                           |
| `JWT_SECRET`       | Signing key for session tokens                      |
| `JWT_EXPIRES_IN`   | Token lifetime, e.g. `7d`                           |
| `PORT`             | Port for both the API and the static frontend (default `4000`) |
| `CORS_ORIGIN`      | Allowed origin if the frontend is served separately |
| `LOG_REQUESTS`     | Set to log every request                            |

## Run

```bash
npm run dev       # node --watch server.js, via backend/
```

Then open the URL printed on startup, `http://localhost:4000` by default. The
API lives under `/api`, and the app itself is served from the repository root,
so same-origin requests need no CORS setup. On boot the server asserts the six
collection names and refuses to start if they have drifted.

The root scripts just forward to `backend/`; you can also run them from in there.

```bash
npm run smoke     # end-to-end API smoke test
```

`npm run smoke` boots the real Express app in-process on an OS-assigned port,
talks to it over HTTP exactly like the browser does, exercises every resource and
authorization rule, and deletes everything it creates. It needs a reachable
MongoDB and leaves no residue.

## Data model

Everything lives in **six collections**. The interesting constraint is that
"different-looking" features are never new collections — a database block, a
kanban board, a calendar and a roadmap are all the same documents:

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
  options: [...] } }`) and flat `rows` of `{ [column]: value }`. A `database`
  block is only a *pointer* to one of these, stored as
  `properties.dataTableId`; the rows themselves never enter the `blocks`
  collection.

## Architecture

```
index.html            App shell: landing, auth, workspace, overlay roots
css/
  style.css           Design tokens, landing, shared components
  sidebar.css         Sidebar tree, favorites, drag & drop
  editor.css          Blocks, slash menu, format toolbar
  database.css        Table / board / calendar / roadmap views
  responsive.css      1100/1000/720/420px breakpoints
js/
  data.js             App metadata, settings defaults, templates
  api.js              The only module that knows about HTTP
  ui.js               Icons, toasts, modals, confirm dialogs, menus
  store.js            State, optimistic writes, lazy block loading, search
  auth.js             Register / login / session validation
  database.js         The four database views over one dataTable document
  blockRenderer.js    Block type -> content element
  editor.js           Page header, block editing, slash menu, toolbar
  sidebar.js          Page tree, workspace switcher, context menus
  search.js           Global search modal
  theme.js            Light / dark / system
  app.js              Boot, routing, topbar, views, command palette
backend/
  app.js              Express app: /api + static frontend
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

- Modules attach to `window.Lumen` and **must load in the order declared in
  `index.html`**, because each one reads the modules above it off `window.Lumen`
  while it is being evaluated. `index.html` documents that order inline.
- `js/api.js` is the only place that knows about HTTP. It unwraps the
  `{ success, data }` envelope, attaches the bearer token, and turns a `401`
  into a single `lumen:unauthorized` event so the app drops the session exactly
  once instead of reacting per request.
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
- **Databases** — one document, four views: table, board (drag a card between
  status columns), calendar, and a roadmap timeline. Switching views never moves
  or copies data, because there is only one copy.
- **Search** — `Ctrl/⌘ + K` across page titles and block content.
- **Command palette** — `Ctrl/⌘ + Shift + P`.
- **Activity** — derived from the pages collection; there is no notifications
  collection to invent one.
- **Import** — paste or open `.txt` / `.md` into a new page.
- **Theming** — light, dark, and system, all driven by the CSS tokens in
  `style.css`.
