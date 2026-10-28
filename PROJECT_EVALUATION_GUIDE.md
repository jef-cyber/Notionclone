# Lumen — Project Evaluation Guide

This guide explains how the Lumen React/Express Notion clone is built and walks through the parts you are most likely to be asked about. It is written to match the code as it exists in this repository, not an idealized version of it.

---

## 1. Component architecture

Lumen is a single-page React app. `frontend/src/main.jsx` mounts one root component, `App`, and every other component is reachable from there.

### Application shell

| Layer | File | Responsibility |
| --- | --- | --- |
| Entry point | `frontend/src/main.jsx` | Imports the five stylesheets and renders `<App />` into `#root`. |
| Application shell | `frontend/src/components/App.jsx` | Session boot, hash routing, auth/workspace switching, global shortcuts, import, global overlays. |
| Shared navigation actions | `frontend/src/appContext.js` | React context (`useApp`) exposing `navigate`, `openPage`, `createNewPage`, `logout`, `setSearchOpen`, `setPaletteOpen`, `showLogin`, `showRegister`, `authenticate`. |
| Sidebar | `frontend/src/components/layout/Sidebar.jsx` | Page tree, favorites, search entry, workspace menu, members dialog, drag/drop, inline rename. |
| Topbar | `frontend/src/components/layout/Topbar.jsx` | Breadcrumbs, search trigger, page share/favorite actions, profile/more menus. |
| Mobile navigation | `frontend/src/components/layout/MobileNav.jsx` | Bottom navigation shown below 720 px. |
| Auth screens | `frontend/src/components/auth/Auth.jsx` | Landing page, login form and registration form. |
| Global overlays | `frontend/src/components/overlays/SearchModal.jsx`, `CommandPalette.jsx` | `Ctrl/⌘ + K` search and `Ctrl/⌘ + Shift + P` command palette. |
| Menu/modal builders | `frontend/src/components/menus.jsx` | Reusable profile, page, theme, help and sharing menus. |

### Feature views

Every non-editor page is a view under `frontend/src/components/views/`:

- `Dashboard.jsx` — greeting, quick actions, recents, favorites, “new top-level page” dialog.
- `PageView.jsx` — loads one page and renders the editor; owns the loading/not-found states.
- `SearchPage.jsx` — dedicated search screen.
- `Settings.jsx` — account, appearance, preferences and about tabs.
- `Favorites.jsx` — starred pages.
- `Activity.jsx` — recently changed pages derived from the pages collection.
- `Templates.jsx` — create a page from a built-in template.
- `Trash.jsx` — restore or permanently delete archived pages.
- `NotFound.jsx` — explicit fallback for an unknown hash route.

`App.jsx` chooses a view with `renderView(state, openPage)`, a small switch over `state.view`. `PageView` then renders `frontend/src/components/editor/Editor.jsx`, which contains the page header, block editor, slash menu and formatting toolbar. Database blocks are handled by `frontend/src/components/database/Database.jsx`, which renders table, board, list, gallery, calendar and timeline views. The interactive timeline is isolated in `TimelineView.jsx`, and shared column/date/dependency logic lives in `databaseUtils.js`.

### Shared building blocks

| Component | File | Used by |
| --- | --- | --- |
| `ViewHeader` | `frontend/src/components/common/ViewHeader.jsx` | Settings, Search, Favorites, Activity, Templates, Trash, NotFound. |
| `SearchResult` + `Highlight` | `frontend/src/components/common/SearchResult.jsx` | Search page and search modal. |
| `PageCard` + `EmptyCard` | `frontend/src/components/common/PageCard.jsx` | Dashboard and Favorites. |
| `Dialog` | `frontend/src/components/ui/Modal.jsx` | Dashboard, Sidebar members, Editor image dialog, Database settings. |
| `ConfirmDialog` | `frontend/src/components/ui/Modal.jsx` | Destructive actions such as trash, delete, remove member. |
| `Icon` | `frontend/src/components/ui/Icon.jsx` | Inline SVG icon set used throughout the app. |
| `showToast` / `ToastRoot` | `frontend/src/components/ui/Toast.jsx` | Success/error feedback across views. |
| `openMenu` / `MenuLayer` | `frontend/src/components/ui/Menu.jsx` | Context menus and submenus. |

The UI toolkit is re-exported from `frontend/src/components/ui/index.jsx`, so feature components import from one place.

---

## 2. Props and component reuse

Reuse is mostly achieved through three patterns: presentational props, the app context, and shared store access.

### Presentational props

```jsx
// frontend/src/components/common/ViewHeader.jsx
<ViewHeader
  title="Settings"
  subtitle="Manage your account, appearance, and preferences."
/>
```

`ViewHeader` accepts `title`, optional `subtitle`, and optional `action`. `Trash` uses `action` for its “Empty trash” button; the other views omit it. The component keeps heading spacing and mobile wrapping consistent.

```jsx
// frontend/src/components/common/PageCard.jsx
<PageCard page={p} showStar={false} /> // Dashboard recents
<PageCard page={p} showStar />          // Dashboard favorites and Favorites view
```

`PageCard` receives one page object and a `showStar` flag. The card body is a `<button>` for opening the page; the star is a sibling `<button>`, not a nested button. This is valid HTML and gives keyboard users two separate actions.

```jsx
// frontend/src/components/common/SearchResult.jsx
<SearchResult
  result={{ page, snippet: "" }}
  index={i}
  query={q.toLowerCase()}
  selected={selected === i}
  option
  onHover={() => setSelected(i)}
  onOpen={() => open(page)}
/>
```

`SearchResult` accepts `result`, `index`, `query`, `selected`, `onHover`, `onOpen`, and `option`. The `option` flag adds `role="option"` and `aria-selected` for the modal listbox; the search page omits it and gets a normal button. One component therefore serves two interaction models.

### Shared navigation through context

Components such as `PageCard`, `Topbar`, `Sidebar`, `Templates`, and `NotFound` call `useApp()` instead of receiving navigation callbacks through several layers of props. `App.jsx` creates the value once with `useCallback` functions and wraps the shell in `<AppContext.Provider>`. This avoids prop drilling while keeping the navigation API explicit.

### Shared state through the store

Views call `useStore()` for reactive state and `store.getPage`, `store.getFavorites`, `store.getActivity`, etc. for derived data. The store is the single source of truth for pages, blocks, user, workspace, members and settings.

### Reused UI flows

- `Dialog` is used by the Dashboard page-creation flow, the Sidebar members dialog, the Editor image dialog and Database settings.
- `confirmDialog` is the shared promise-based confirmation flow for destructive actions.
- `openMenu` is used by the Topbar, Sidebar and Editor so context menus look and behave the same everywhere.
- `showToast` gives consistent feedback after mutations.

---

## 3. Conditional rendering

Conditional rendering is used to represent session state, route state, data-loading state and empty states. Important examples:

| Location | Condition | What is rendered |
| --- | --- | --- |
| `App.jsx` (boot) | `!booted` | Full-screen boot loader with `role="status"` while `store.loadSession()` resolves. |
| `App.jsx` (auth) | `!loggedIn` and `authMode` | `Landing`, `AuthView` in login mode, or `AuthView` in register mode. |
| `App.jsx` (workspace) | `loggedIn` | Sidebar, Topbar, `<main>`, `MobileNav`, and the active view. |
| `App.jsx` (`renderView`) | `state.view` | `PageView`, `Dashboard`, `Activity`, `Settings`, `Templates`, `Favorites`, `SearchPage`, `Trash`, or `NotFound`. |
| `PageView.jsx` | page missing / blocks not loaded / loaded | Not-found state, loading state, or `Editor`. |
| `Dashboard.jsx` | recents and favorites length | `PageCard` grid or `EmptyCard`. |
| `Favorites.jsx` | favorites length | Card grid or “No favorites yet” empty state. |
| `Activity.jsx` | activity length | Empty state or grouped activity list. |
| `SearchPage.jsx` | empty query / searching / error / no matches / matches | Recent searches and recent pages, loading row, error row, no-results row, or result list. |
| `SearchModal.jsx` | same search states | Recently visited pages or live results with selection. |
| `Settings.jsx` | `tab` | Account form, Appearance, Preferences, or About section. |
| `Settings.jsx` | `errors.name` / `errors.email` | Inline error text plus `aria-invalid` and `aria-describedby`. |
| `Dashboard.jsx` | `newPageError` | Inline dialog error instead of the normal hint. |
| `Sidebar.jsx` | `hasChildren` / `isOpen` | Expand/collapse button, `aria-expanded`, and `role="group"` children. |
| `Sidebar.jsx` | `isRenaming` | Inline rename input instead of the page title. |
| `Sidebar.jsx` | `canManage` | Invite form only for owners/admins. |
| `PageCard.jsx` | `showStar` | Favorite star button on relevant cards only. |
| `Editor.jsx` | `imageFor !== null` | Image insertion dialog. |
| `Editor.jsx` | `slash`, `format` | Slash command menu and formatting toolbar. |

The empty/loading/error branches matter because they prevent a blank screen from looking like a bug. The search page and modal, for example, distinguish “still searching”, “search failed”, and “no matches” instead of showing the same empty message for all three.

---

## 4. Hooks and state management

### Global state: the store plus `useSyncExternalStore`

- `frontend/src/core/store.js` holds the application cache and the API write logic.
- The store mutates its state object in place and increments a `version` counter.
- `frontend/src/hooks.js` exposes `useStore()`, which calls `useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot)` and then returns `store.getState()`.
- Components re-render when the version changes; data is read through store selectors such as `getPage`, `getChildren`, `getPath`, `getFavorites`, `getActivity`, `getPageBlocks` and `getRecentSearches`.

This is intentionally framework-agnostic: the store does not import React, which keeps persistence, optimistic writes and API sequencing testable and separate from rendering.

State owned by the store includes:

- session/user/workspace and members
- pages and their hierarchy
- page blocks
- recent pages and recent searches
- expanded tree nodes
- settings and theme preferences
- current view and current page id

Only preferences (`lumen.prefs.v1`) and the auth token (`lumen.token.v1`) are stored in `localStorage`; page content is stored through the API.

### The custom hooks

| Hook | File | Purpose |
| --- | --- | --- |
| `useStore` | `frontend/src/hooks.js` | Subscribe React to the external store. |
| `useMediaQuery(query)` | `frontend/src/hooks.js` | Track a CSS media query with `matchMedia`, including cleanup. |
| `useIsMobile()` | `frontend/src/hooks.js` | `useMediaQuery("(max-width: 720px)")` for conditional labels and mobile behavior. |
| `usePageSearch(query, options)` | `frontend/src/hooks.js` | Shared debounced search used by the search page and search modal. |

`usePageSearch` is the most interesting hook:

- trims the query and clears results when the query is erased;
- debounces by 200 ms on the search page and 180 ms in the modal;
- increments a request token so a slow, stale response cannot overwrite a newer one;
- tracks `loading` and `error`;
- returns `{ query, results, loading, error }`.

The underlying `store.searchPages` in `frontend/src/core/store.js` runs the page-title search and block-content search with `Promise.allSettled`. If one collection fails, it still returns partial results. If both fail, it throws so the UI can show “search unavailable” instead of “no matches”.

### Local component state

Local state is used when the state belongs to one screen or interaction:

- `App.jsx`: `booted`, `authMode`, `mobileSidebarOpen`, `searchOpen`, `paletteOpen`, plus refs for the import input, content scroller and boot guard.
- `Auth.jsx`: `name`, `email`, `password`, `confirm`, `errors`, `busy`.
- `Settings.jsx`: `tab`, `name`, `email`, `errors`, `saving`.
- `Dashboard.jsx`: `newPageOpen`, `newPageTitle`, `newPageError`, `creating`.
- `Sidebar.jsx`: drag state, drop target, rename draft, prompt dialog, workspace-name editor, members dialog, invite form state.
- `SearchPage.jsx`: `query` and an input ref.
- `SearchModal.jsx`: `query`, `selected`, input/results refs.
- `Editor.jsx`: slash menu, formatting toolbar, image dialog state, drag state, focus refs.
- `Database.jsx`: active view, month cursor, settings dialog, selected row, plus a `useReducer` bump used to force a re-render after direct cache changes.

### Effects in `App.jsx`

| Effect | What it does |
| --- | --- |
| Boot effect | Applies the theme, awaits `store.loadSession()`, sets `booted`, then routes from the current hash. A ref prevents duplicate boot calls in development. |
| Hash effect | Adds a `hashchange` listener after boot and removes it on cleanup. |
| Unauthorized effect | Listens for the `lumen:unauthorized` event and clears the session once, rather than handling 401 separately in every request. |
| Preference effect | Toggles `no-anim` and `compact` classes on `<body>`. |
| Theme effect | Re-applies the selected light/dark/system theme. |
| Scroll effect | Resets the content pane scroll position when the view or page changes. |
| Shortcut effect | Handles `Ctrl/⌘ + K`, `Ctrl/⌘ + Shift + P`, `Ctrl/⌘ + N` and `Escape`. |

### Data flow

```
User action
   ↓
Component calls AppContext action or store method
   ↓
store mutates the local cache immediately (optimistic update)
   ↓
version++ → useStore subscribers re-render
   ↓
debounced API write flushes (page patches / block patches)
   ↓
server response normalizes back into the store
```

Page and block writes are debounced separately. A block's creation `POST` is awaited before its first `PATCH`, so an update cannot overtake the creation of the block it edits. `store.flushPage` and `store.flushAll` flush pending writes when navigating or logging out.

---

## 5. Routing and navigation

Lumen uses **custom hash routing**, not React Router.

### Route parsing

`frontend/src/components/App.jsx` contains:

```js
function parseHash() {
  const h = (window.location.hash || "").replace(/^#/, "");
  if (!h) return { route: "dashboard" };
  if (h.indexOf("page/") === 0) return { route: "page", id: h.slice(5) };
  const map = {
    login: "login",
    register: "register",
    search: "search",
    trash: "trash",
    settings: "settings",
    templates: "templates",
    favorites: "favorites",
    inbox: "inbox",
  };
  return { route: map[h] || "notfound" };
}
```

Supported hashes:

| Hash | View |
| --- | --- |
| empty | Dashboard |
| `#page/<id>` | Page editor for that page |
| `#inbox` | Activity |
| `#settings` | Settings |
| `#templates` | Templates |
| `#favorites` | Favorites |
| `#search` | Search page |
| `#trash` | Trash |
| `#login` / `#register` | Auth screens when signed out |
| any other non-empty hash | `NotFound` when signed in |

`HASH_FOR_VIEW` maps view names back to hashes. `navigate(view)` updates the store and calls `setHash`; `openPage(id)` hydrates the page and sets `#page/<id>`. The `hashchange` listener calls `routeFromHash`, so the browser back/forward buttons and manually pasted URLs work.

### Auth gating

When signed out, only `#login` and `#register` are honored. Any other hash shows the landing page and clears the hash. When signed in, auth hashes redirect to the dashboard.

### Deep links and missing pages

- A `#page/<id>` hash for a page not yet in the local cache triggers a hydrate attempt through `openPage`.
- If the page does not exist, the app still sets the page view and `PageView` shows its own “Page not found” state with a Home button.
- An unknown non-page hash resolves to `state.view === "notfound"` and renders `frontend/src/components/views/NotFound.jsx`.
- The 404 view offers “Go to Home” and “Search pages”.

### Why hash routing

It requires no server rewrite rules, works when Express serves the built frontend from `frontend/dist`, and keeps deep-link behavior explicit. The tradeoff is that it is less feature-rich than React Router (no nested route objects, loaders or route-level code splitting).

---

## 6. Forms, validation and submission

All forms are controlled React forms. They use `noValidate` and explicit validation so the app controls when errors appear and how they are announced. Submission always calls the real API through `frontend/src/core/api.js` or the store.

### Auth: login and registration

Files: `frontend/src/components/auth/Auth.jsx`, `frontend/src/core/auth.js`.

- Login validates required email and password, plus the email shape.
- Registration validates name, email, password length (at least 8), confirmation presence and matching passwords.
- The server remains authoritative. `auth.js` maps the server's field `details` into the form's `errors` object; otherwise it shows a general form error.
- Each `Field` has a `name`, `required`, `aria-invalid`, and `aria-describedby` pointing at its error element.
- Per-field errors clear when the user edits that field.
- The submit button is disabled and labeled “Working…” while the request is in flight.
- On success, `onAuthenticated` adopts the session, refreshes pages and navigates to the dashboard.

### Settings: profile update

File: `frontend/src/components/views/Settings.jsx`.

- `validateProfile` requires a non-empty name and a valid email.
- The form is a real `<form onSubmit>`; `saveProfile` trims values, validates, then calls `api.auth.updateProfile`.
- Inline errors use `role="alert"`, and the inputs receive `aria-invalid` and `aria-describedby`.
- `saving` prevents duplicate submissions and changes the button label to “Saving…”.
- On success, `store.updateUser` updates the shared user state and a toast confirms the change.

### Dashboard: create a top-level page

File: `frontend/src/components/views/Dashboard.jsx`.

- The dialog contains a real form with `id="new-page-form"`.
- The footer “Create” button is `type="submit"` with `form="new-page-form"`, so pressing Enter also submits.
- Empty titles produce “Give the page a name.”; the input has `maxLength={120}` and `aria-invalid`.
- The dialog stays open on API failure and shows the error inline; it closes only after successful creation.
- While creating, the button is disabled and labeled “Creating…”.

### Sidebar: invite a member

File: `frontend/src/components/layout/Sidebar.jsx`.

- The invite UI is a `<form>` with an email input, role select and submit button.
- Empty and malformed emails are rejected before the API call.
- Server failures keep the dialog open and display the error inline.
- The invite form only renders for owners/admins (`canManage`).

### Editor: insert an image

File: `frontend/src/components/editor/Editor.jsx`.

- The image dialog accepts an `http(s)` URL or a local image file.
- Files must have an image MIME type and be under 1.5 MB.
- A `FileReader` converts the file to a data URL so it survives a reload; the previous object-URL approach did not persist.
- Empty, invalid and oversized inputs produce inline errors with `aria-invalid` and `aria-describedby`.
- The “Insert” button is disabled while reading a file or when the URL is empty.

### Shared form conventions

- Error text uses `.field-error` and `role="alert"`.
- Invalid inputs get `aria-invalid="true"`.
- Error text is connected with `aria-describedby`.
- Buttons expose busy labels such as “Saving…”, “Creating…”, “Inviting…”, “Working…” and “Reading…”.
- Server-side authorization and validation still decide what actually succeeds.

---

## 7. Responsive styling and visual structure

Styles are split by responsibility and imported once in `frontend/src/main.jsx`:

- `frontend/src/styles/style.css` — design tokens, layout, shell, topbar, cards, forms, modals, shared view headers, boot screen, accessibility helpers, reduced motion.
- `frontend/src/styles/sidebar.css` — sidebar, page tree, favorites, member list, tree focus styles.
- `frontend/src/styles/editor.css` — page header, blocks, slash menu, formatting toolbar, image blocks.
- `frontend/src/styles/database.css` - table, board, list, gallery, calendar, timeline and dependency layouts.
- `frontend/src/styles/responsive.css` — all responsive overrides.

### Breakpoints

| Breakpoint | Main behavior |
| --- | --- |
| `max-width: 1100px` | Tighter view/editor padding; landing switches to one column and centers its copy. |
| `max-width: 1000px` | Sidebar becomes a fixed off-canvas panel with an overlay; block handles move inward. |
| `max-width: 720px` | Mobile layout: compact view padding, mobile bottom nav, single-column cards, stacked view headers, full-width form controls, fixed formatting toolbar, responsive modals, bottom-positioned slash menu and toasts. |
| `max-width: 420px` | Smaller titles, full-width quick actions, stacked theme options and landing feature pills. |

### Responsive techniques used

- The workspace uses flex layout with `min-width: 0` on the main column so content can shrink instead of forcing horizontal overflow.
- The sidebar is translated off-screen at tablet width and slides in with `.is-open`; a backdrop closes it.
- `MobileNav` is hidden on desktop and displayed below 720 px.
- Cards move from a multi-column grid to one column on phones.
- Forms stack their controls and buttons at 720 px, including the Settings form and member invite row.
- The editor's formatting toolbar becomes fixed above the mobile navigation, and the slash menu spans the viewport width.
- `useIsMobile()` hides keyboard hints and adjusts labels in `Topbar` rather than relying only on CSS.
- Focus-visible outlines, reduced-motion handling and `body.no-anim` support accessibility and user preferences.

### Theming

`frontend/src/core/theme.js` applies light, dark or system mode by setting the theme on the document. Colors come from CSS custom properties defined in `style.css`, so the same components work in both themes. The Settings appearance tab and the profile/landing theme menus all call the same theme module.

---

## 8. Key files to study

| File | Why it matters |
| --- | --- |
| `frontend/src/components/App.jsx` | Shell, boot, hash router, auth gating, global shortcuts, overlays. |
| `frontend/src/hooks.js` | `useStore`, media-query hooks and the shared debounced search hook. |
| `frontend/src/core/store.js` | Single source of truth, optimistic updates, page hydration, search, navigation, persistence. |
| `frontend/src/core/api.js` | The only HTTP layer; token handling and the `{ success, data }` envelope. |
| `frontend/src/core/auth.js` | Login/register validation and server error mapping. |
| `frontend/src/appContext.js` | Shared navigation/editor actions. |
| `frontend/src/components/layout/Sidebar.jsx` | Recursive tree, ARIA tree semantics, keyboard navigation, rename, drag/drop, members and invite form. |
| `frontend/src/components/views/Dashboard.jsx` | Cards, empty states, validated page-creation dialog. |
| `frontend/src/components/views/Settings.jsx` | Tabs, controlled profile form and validation. |
| `frontend/src/components/views/PageView.jsx` | Page loading, not-found and editor mounting. |
| `frontend/src/components/editor/Editor.jsx` | Block editing, slash commands, formatting, image dialog, keyboard behavior. |
| `frontend/src/components/database/Database.jsx` | Six views over one data-table document, plus optimistic row writes. |
| `frontend/src/components/database/TimelineView.jsx` | Timeline zoom, navigation, drag/resize, dependency linking and connectors. |
| `frontend/src/components/database/databaseUtils.js` | Shared column, date, status and dependency helpers. |
| `frontend/src/components/common/ViewHeader.jsx` | Small example of prop-driven reuse. |
| `frontend/src/components/common/SearchResult.jsx` | Reuse across two different interaction models. |
| `frontend/src/components/common/PageCard.jsx` | Valid sibling-button composition and empty state. |
| `frontend/src/components/ui/Modal.jsx` | Portal dialog, Escape handling, confirm flow. |
| `frontend/src/styles/responsive.css` | Every breakpoint in one place. |
| `backend/app.js` | Express API plus static frontend and SPA fallback. |
| `backend/scripts/smoke.js` | End-to-end API smoke test. |

---

## 9. Suggested demo sequence (8–10 minutes)

1. **Start cleanly**
   - Show `npm run build` and `npm run dev`.
   - Open `http://localhost:4000`.
   - Point out the boot screen while the session is restored.

2. **Landing and auth**
   - Show the landing page and theme toggle.
   - Open registration, submit an empty form to show inline validation and `aria-invalid`, then register a real account.
   - Mention that the API creates the user, workspace, starter page and sample database.

3. **Dashboard and page creation**
   - Show the greeting, recents and favorites.
   - Use “New Workspace Page”, submit an empty title to show the inline error, then create a page with a real title.
   - Point out that the dialog stays open on failure and closes only on success.

4. **Editor**
   - Add text, headings, a to-do, a code block and a callout.
   - Open the slash menu with `/`.
   - Insert an image by URL or upload a small image; show the inline validation for an invalid URL.
   - Reload the page to demonstrate that content and the uploaded image persist.

5. **Sidebar and keyboard navigation**
   - Create a subpage, expand/collapse the tree, drag a page, and rename with `F2` or double-click.
   - Tab to a tree row and use Enter/Space, arrow keys and `F2`.
   - Star a page and show it in Favorites.

6. **Search**
   - Press `Ctrl/⌘ + K`, search for a title and for body text, and use arrow keys plus Enter.
   - Open the dedicated Search view and show recent searches.
   - Mention that page-title and block-content searches run in parallel and partial results survive one failed request.

7. **Settings validation**
   - Open Settings → My Account.
   - Clear the name and enter an invalid email; submit and show both inline errors.
   - Fix the values and save; show the success toast and updated profile.

8. **Members validation**
   - Open the workspace/members dialog.
   - Submit an empty or malformed invite email and show the inline error.
   - Explain that only owners/admins see this form and the server still enforces permissions.

9. **Responsive check**
   - Open DevTools device mode at 390 px.
   - Show the off-canvas sidebar, bottom navigation, single-column cards, stacked forms and fixed editor toolbar.
   - Resize to tablet width to show the 1000 px sidebar breakpoint.

10. **Routing and 404**
    - Visit `#settings`, `#search` and a real `#page/<id>` deep link.
    - Visit `#does-not-exist` and show the NotFound view with Home/Search actions.
    - Use browser Back/Forward to show `hashchange` routing.

11. **Trash and recovery**
    - Move a page to trash, restore it, then show permanent deletion behind a confirmation dialog.

---

## 10. Likely evaluator questions and answers

**Why did you not use React Router?**
The app is a single shell with a small, fixed set of views. A custom hash router keeps the production build self-contained behind Express without extra rewrite rules, and it makes auth gating and deep-link handling explicit in `App.jsx`. For a larger app with nested layouts and route loaders, React Router would be the better choice.

**Where is the application state?**
Global state is in `frontend/src/core/store.js`; React subscribes through `useSyncExternalStore` in `frontend/src/hooks.js`. Screen-specific state such as dialogs, form drafts and selected tabs stays in local `useState` inside the relevant component.

**Why mutate the store in place instead of using Redux?**
The store needs optimistic updates and debounced writes with careful ordering. Keeping it framework-agnostic avoids a dependency and makes the write-behind queue explicit. The version counter gives React a stable snapshot while the cache is mutated.

**How does the UI stay responsive while typing?**
Block and page edits update the local cache immediately. Network writes are queued and debounced (600 ms). The queue merges patches for the same block and ensures a block creation request completes before its first update request.

**How is stale search data prevented?**
`usePageSearch` keeps a request token and ignores responses that are not from the latest query. It also clears the previous results when the query changes and cancels the debounce timer on cleanup.

**What happens if one search endpoint fails?**
`store.searchPages` uses `Promise.allSettled`. One failed collection still produces partial results; only when both fail does it throw, and the UI shows an error message rather than “no results”.

**How does authentication work?**
`frontend/src/core/auth.js` calls the Express API, stores the JWT with `api.setToken`, and `store.loadSession` restores it on boot. `core/api.js` attaches the bearer token. A 401 dispatches one `lumen:unauthorized` event so the app clears the session once.

**How is the session protected on the server?**
The Express middleware verifies the JWT, and services enforce workspace membership and roles. Client-side checks are only for immediate feedback; the API is authoritative.

**What validation exists on forms?**
Auth validation is in `core/auth.js`; profile validation is in `Settings.jsx`; page-title validation is in `Dashboard.jsx`; invite-email validation is in `Sidebar.jsx`; image validation is in `Editor.jsx`. All use controlled inputs, inline errors and ARIA attributes, and all still handle server errors.

**How did you make the sidebar accessible?**
The tree container has `role="tree"`, each page wrapper has `role="treeitem"` with `aria-level`, `aria-selected` and `aria-expanded`, and children are in a `role="group"`. Rows are focusable and support Enter/Space to open, Left/Right to collapse/expand and `F2` to rename. Favorite and action controls are separate buttons, so there are no nested interactive elements.

**How is responsive layout implemented?**
`responsive.css` defines breakpoints at 1100, 1000, 720 and 420 px. The desktop sidebar becomes an off-canvas panel at 1000 px; the bottom navigation appears at 720 px; grids collapse to one column; forms stack; and the editor toolbar/slash menu move to mobile-safe positions. `useIsMobile` also changes labels and keyboard hints.

**What is the difference between `PageView`'s not-found state and `NotFound`?**
`PageView` handles a page id that does not exist or was deleted. `NotFound` handles an unknown non-page hash route. Both offer a way back, but they represent different failures.

**Why does the image dialog convert files to data URLs?**
Object URLs are temporary and do not survive a reload. The dialog reads the file with `FileReader` and stores a data URL in the block content so the image persists, with a 1.5 MB cap to keep requests and documents reasonable. A production app would upload to object storage instead.

**What are the main limitations?**
Hash routing is simpler than a full router; image files are embedded rather than uploaded to object storage; there is no real-time collaboration or conflict resolution beyond last-write-wins/optimistic updates; database filters/sorts and large-table virtualization are not implemented; timeline date/schedule rules are enforced in the browser while the API validates dependency structure, types, row ids and cycles but not dates; and the test suite is an API smoke test plus temporary browser checks rather than a committed component/browser suite.

**What would you improve next?**
Move images to an upload endpoint, add component/integration tests for forms and routing, replace the custom router if the route graph grows, and add stronger offline/conflict handling.

---

## Verification performed

These are the checks that were actually run for this project:

```bash
# Production frontend build
cd frontend
npm run build

# End-to-end API smoke test (needs a reachable MongoDB)
cd ..
npm run smoke
```

Results observed:

- `npm run build`: Vite 5.4.21 built 75 modules successfully (321.00 kB JS / 71.71 kB CSS before gzip); output written to `frontend/dist`.
- `npm run smoke`: 111 passed, 0 failed, against the configured MongoDB instance. This includes all four dependency types, structure/cycle checks and row-delete pruning.
- A Chrome DevTools Protocol browser pass checked 22 general scenarios with 0 failures, including boot/landing, authenticated workspace, unknown-hash 404, Settings validation, Dashboard dialog validation and success, favorite card/sidebar buttons, search results, mobile stacking, and no uncaught runtime errors.
- A second browser pass checked 24 database/timeline scenarios with 0 failures: six views, optimistic row creation, drag move, both resize edges, zoom persistence, valid/invalid dependencies, cycle rejection, removal and reload persistence.
- A third browser pass checked 40 timeline-interaction scenarios with 0 failures: day/week/month/quarter snapping, edge auto-scroll, Escape cancellation, live date/duration preview, one-day grab halos at quarter zoom, valid/invalid link targets, duplicate/cycle/self prevention, connector alignment, injected row/dependency failure rollback and rapid writes.

The browser passes used temporary test scripts outside the repository; they are not part of the committed project. The repository itself contains the API smoke test at `backend/scripts/smoke.js`. One earlier smoke run hit transient MongoDB Atlas timeouts and was rerun successfully; see `NOTION_CLONE_TESTING.md`.

## Short honest summary

Lumen is a working full-stack Notion-style app with a substantial component tree, a real Express/MongoDB API, optimistic persistence, hash routing, validated forms, responsive layouts and accessible interaction patterns. The strongest areas for demonstration are the store/data flow, the editor and database features, form validation, routing/auth gating, and the shared component patterns. The main tradeoffs are the intentionally simple custom router, embedded image data URLs, and the absence of a large automated UI test suite.
