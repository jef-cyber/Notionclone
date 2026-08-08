<<<<<<< HEAD
# Lumen — a Notion clone (frontend only)

A polished, frontend-only Notion-style workspace built with **HTML5, CSS3, and vanilla JavaScript (ES6+)**. No frameworks, no build step, no backend — every feature runs entirely in the browser and persists to `localStorage`.

## Run it

Simply open `index.html` in any modern browser (Chrome, Edge, Firefox, Safari). No server or install required.

- Prefer a quick local server? `python -m http.server 8000` (or `npx serve .`) and open `http://localhost:8000`.
- Data resets on a fresh browser / cleared site data.

## Features

- **Landing page** — hero, feature grid, template gallery, theme toggle, and Get Started / Open Workspace flows.
- **Workspace shell** — sidebar with page tree, favorites, recents, unread-inbox badge, and responsive layout (off-canvas sidebar on narrow screens, bottom mobile nav below 720px).
- **Block editor** — text, headings (H1–H3), bulleted/numbered lists, to-do (with checkbox), quote, code, callout, divider, image, toggle, and table blocks. Type `/` to summon the slash command menu (full keyboard + mouse support), `Enter` to create blocks, `Backspace` to merge, a phantom trailing block, and an inline icon picker.
- **Formatting toolbar** — floating bar with bold, italic, underline, strikethrough, and inline-code formatting.
- **Pages** — create, rename (double-click), duplicate, favorite, delete, drag-to-reorder in the sidebar, and context menus including Move-to.
- **Search** — `Ctrl/⌘ + K` global search across page titles and block content with live highlight.
- **Command palette** — `Ctrl/⌘ + Shift + P` for quick actions and page navigation.
- **Dashboard, Inbox, Templates, Favorites** — dedicated views with mock data.
- **Import** — paste or open `.txt` / `.md` files to import into a new page.
- **Theming** — light, dark, and system modes (`data-theme` on `<html>`, persisted).
- **Toasts, modals, confirm dialogs, dropdown menus** — shared UI primitives.
- **Keyboard shortcuts** — `Ctrl/⌘ K` search, `Ctrl/⌘ N` new page, `Ctrl/⌘ B/I` bold/italic, `Esc` to dismiss, `#page/<id>` deep-link hash routing.
- **Accessibility** — reduced-motion support, ARIA roles on menus/listboxes, focus management in the editor.

## Structure

```
index.html           App shell + landing + workspace markup
css/
  style.css          Design system, landing, shared components
  sidebar.css        Sidebar tree, favorites, drag & drop
  editor.css         Blocks, slash menu, format toolbar
  responsive.css     1100/1000/720/420px breakpoints
js/
  data.js            Mock workspace data (pages, blocks, templates, notifications)
  store.js           State + localStorage persistence + page/block CRUD
  ui.js              Icons, toasts, modals, confirm, menus
  theme.js           Light / dark / system theming
  sidebar.js         Sidebar rendering, rename, drag, context menus
  editor.js          Block editor, slash menu, format toolbar
  search.js          Global search modal
  app.js             Boot, topbar, views, command palette, shortcuts
assets/
  icons/             logo.svg, favicon.svg
  images/            landing illustration
```

## Tech notes

- State is stored under the `lumen.state.v1` key in `localStorage`.
- Modules attach to `window.Lumen` (`Lumen.store`, `Lumen.ui`, `Lumen.theme`, `Lumen.sidebar`, `Lumen.editor`, `Lumen.search`, `Lumen.app`) and must load in the order declared in `index.html`.
- Formatting in the editor uses `document.execCommand` for compatibility and simplicity.
=======
# Notionclone
A modern, feature-rich Notion-inspired workspace built with React, TypeScript, Tailwind CSS, and shadcn/ui, featuring rich text editing, databases, collaboration tools, and a clean, responsive UI.  Option 2
>>>>>>> e65898f39faa009757d264f8ee37a3f3427789b9
