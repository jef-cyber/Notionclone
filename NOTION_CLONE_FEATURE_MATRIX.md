# Lumen — Notion Clone Feature Matrix

Status values:

- **Verified** — implemented and exercised by the API smoke test, build, or browser checks.
- **Partial** — implemented with a known limitation.
- **Unimplemented** — not present yet.
- **Blocked** — requires infrastructure or scope not available in this repository.

## Workspace and navigation

| Feature | Status | Evidence / note |
| --- | --- | --- |
| Landing, login, registration | Verified | `Auth.jsx`, `core/auth.js`; API smoke auth suite |
| JWT sessions and 401 handling | Verified | `core/api.js`, `App.jsx`; smoke authorization suite |
| Workspace selector and rename | Verified | `Sidebar.jsx`, workspace API |
| Collapsible sidebar | Verified | `Sidebar.jsx`, `responsive.css` |
| Nested page tree | Verified | `pages.parentPageId`; smoke nested-page suite |
| Page create / rename / duplicate / move / trash / restore | Verified | `store.js`, `Sidebar.jsx`, `Trash.jsx` |
| Favorites and recents | Verified | `store.js`, `PageCard`, sidebar |
| Breadcrumbs | Verified | `Topbar.jsx` |
| Page icons and covers | Verified | `Page` model, editor/topbar controls |
| Context menus | Verified | `menus.jsx`, `ui/Menu.jsx` |
| Drag-and-drop page reordering | Verified | `Sidebar.jsx` drag handling |
| Keyboard-accessible tree | Verified | ARIA tree + Enter/Space/arrow/F2 |
| Search and quick navigation | Verified | search page/modal, `usePageSearch` |
| Trash and recovery | Verified | `Trash.jsx`, store |
| Persistent sidebar preferences | Verified | `lumen.prefs.v1` |
| Real mobile layout | Verified | 720/1000/420 breakpoints, browser check |

## Block editor

| Feature | Status | Evidence / note |
| --- | --- | --- |
| Paragraphs, H1–H3 | Verified | `Editor.jsx`, block types |
| Bulleted, numbered, to-do lists | Verified | block renderers |
| Quotes, callouts, dividers | Verified | block renderers |
| Code blocks | Partial | block rendering and language menu; syntax highlighting is minimal |
| Images | Verified | URL/file dialog, 1.5 MB cap, data URL persistence |
| Video, bookmarks, links | Partial | block types exist; renderer support is limited |
| Toggles / nested blocks | Partial | schema supports `parentBlockId`; editor nesting is limited |
| Tables | Partial | represented through database blocks |
| Child pages | Partial | page hierarchy exists; editor child-page block is limited |
| Embedded databases | Verified | database block + `dataTable` |
| Rich-text bold/italic/underline/strike/code/link | Verified | formatting toolbar |
| Text colours and highlighting | Unimplemented | no current UI |
| Slash commands | Verified | `Editor.jsx` slash menu |
| Markdown shortcuts | Partial | limited input handling |
| Contextual toolbar | Verified | selection toolbar |
| Block drag handles / duplication / deletion | Verified | editor controls |
| Copy/paste | Partial | browser-native contenteditable behavior |
| Undo/redo | Partial | browser-native editing history |
| Autosave and save indicators | Verified | debounced store writes, save status in editor |
| Stale-write protection | Verified | request ordering + patched queues |
| Revision history and restore | Unimplemented | no `revisions` collection |
| Comments and mentions | Unimplemented | no `comments` collection |
| File attachments | Unimplemented | images only, data URLs |

## Databases

| Feature | Status | Evidence / note |
| --- | --- | --- |
| Table view | Verified | `TableView` |
| Board / kanban view | Verified | `BoardView`, drag between columns |
| Calendar view | Verified | `CalendarView`, drag to date |
| Timeline / roadmap view | Verified | `TimelineView.jsx`; drag, both resize edges, all four snap levels, dependencies and alignment exercised in the 38-check timeline workflow |
| List view | Verified | `ListView`; browser workflow found all three records |
| Gallery view | Verified | `GalleryView`; browser workflow found all three cards |
| Create/edit/delete records | Verified | row APIs in smoke; optimistic create and cell updates in browser; failed row updates are fault-injected, delete rollback is code-reviewed |
| Inline cell editing | Verified | table, board, calendar |
| Property configuration | Verified | `DatabaseSettings` |
| Property reordering | Unimplemented | definitions preserve object order, no drag UI |
| Filters | Unimplemented | not yet persisted in view config |
| Sorting | Unimplemented | not yet persisted in view config |
| Grouping | Partial | board and timeline group by a select column |
| Search within database | Unimplemented | global search covers pages/blocks only |
| View configuration persistence | Verified | `defaultView`, `viewConfig`; timeline zoom/default view reloaded in browser |
| Templates | Partial | page templates; no per-database templates |
| Pagination / virtualization | Unimplemented | full row array loaded; documented performance limit |
| Optimistic row creation | Verified | temporary row visible before POST in browser; reconciled to server row and persisted |
| Cross-view consistency | Verified | one `rows` array drives every view; six views checked in browser |

### Property types

| Type | Status |
| --- | --- |
| Title, text | Verified |
| Number | Verified |
| Select | Verified |
| Multi-select | Partial (UI edits first value) |
| Checkbox | Verified |
| Date | Verified |
| URL, email | Verified |
| Person | Partial (type exists, no picker) |
| Relation | Partial (type exists, no relation picker) |
| Status | Partial (select is used) |
| Phone, files, created time, last edited time | Unimplemented |
| Formula | Unimplemented |
| Rollup | Unimplemented |

## Timeline

| Feature | Status |
| --- | --- |
| Horizontal date axis | Verified |
| Day / week / month / quarter zoom | Verified; all four levels and persisted preferences exercised |
| Task rows and bars | Verified |
| Horizontal and vertical scrolling | Verified |
| Sticky header and task labels | Implemented; visual behavior covered by CSS/manual review |
| Today indicator | Implemented; initial centering and Today navigation exercised |
| Previous / next / today navigation | Implemented; Today exercised, previous/next not automated |
| Drag task bar to move | Verified with pointer events, including Escape cancellation |
| Scale-aware snapping | Verified: 1 day, 7 days, 1 calendar month and 3 calendar months in browser |
| Continuous edge auto-scroll | Verified with pointer held at the viewport edge |
| Left/right resize handles | Verified; both edges, opposite date preserved, one-day minimum enforced |
| Narrow-bar handle fallback | Implemented: handles hide below 28px so the whole bar stays draggable; zoom in to resize |
| Grab-anywhere target | Implemented: 32px minimum, full-row-height transparent halo; verified by dragging a one-day bar outside its visible edge at quarter zoom |
| Frame-coalesced dragging | Implemented: pointer moves and auto-scroll update at most once per animation frame; verified separate from unrelated rows |
| Proposed dates while dragging | Verified; live date and duration label asserted during a drag |
| Duration preserved on move | Verified |
| Inclusive end-date semantics | Verified and documented |
| Persist after drop | Verified; write occurs on pointer-up |
| View preferences persisted | Verified (`viewConfig`) |
| Dependencies create/remove | Verified through link mode; record-dialog controls render and use the same validated save path |
| Keyboard dependencies | Delete verified; focusable bars with Enter-to-link implemented |
| Connector lines | Verified as an SVG overlay; alignment measured after move, resize, scroll and zoom |
| Edge-appropriate connector sides | Derived per type; finish-to-start and start-to-start rendered in the browser |
| Cycle/self/duplicate rejection | Verified client and server; cycle exercised in the browser, all three in smoke |
| Finish-to-start scheduling | Verified; valid link saved, invalid link and invalid connected move rejected |
| Start-to-start scheduling | Verified through the UI and API |
| Finish-to-finish / start-to-finish scheduling | Verified through the API and shared UI logic |
| Failed row save rollback | Verified with an injected 500 response |
| Failed dependency save rollback | Verified with an injected 500 response |
| Rapid move then resize | Verified; latest dates survive the ordered queue |
| Manual date edits cannot break a link | Shared validator covers drag, resize, calendar and record-dialog writes; drag path browser-verified |
| Automatic cascade rescheduling | Unimplemented by policy; invalid schedules are rejected |
| Large-dataset virtualization | Unimplemented |

## Search and productivity

| Feature | Status |
| --- | --- |
| Workspace search over titles and blocks | Verified |
| Search error/partial-result handling | Verified |
| Recent searches | Verified |
| Command palette | Verified |
| Keyboard shortcuts | Verified |
| Page templates | Verified |
| Import `.txt`/`.md` | Verified |
| Export | Unimplemented |
| Notifications | Unimplemented |

## Sharing and collaboration

| Feature | Status |
| --- | --- |
| Workspace membership | Verified |
| Invite by existing email | Verified |
| Role updates/removal | Verified |
| Server-side authorization | Verified |
| Page sharing | Partial (share action copies a link; no per-page ACL) |
| Viewers/editors enforced | Verified at workspace role level |
| Comments / mentions | Unimplemented |
| Activity history | Partial (derived from page updates) |
| Real-time collaboration | Unimplemented |
| Revisions | Unimplemented |

## Security

| Feature | Status |
| --- | --- |
| JWT verification | Verified |
| Cross-workspace rejection | Verified (smoke) |
| Input validation for rows/properties | Verified |
| Dependency validation | Verified (API smoke + browser schedule check) |
| XSS-safe rich text rendering | Partial: contenteditable text is stored as text, but HTML handling needs a dedicated audit |
| File upload validation | Partial: client-side image MIME/size check; data URL storage |
| Secret handling | Verified: environment variables, `.env` ignored |
| Destructive operation confirmation | Verified |

## Testing

| Area | Status |
| --- | --- |
| Production build | Verified: 75 modules, 0 errors; 321.00 kB JS / 71.71 kB CSS before gzip |
| API smoke suite | Verified: 111 checks, 0 failed on the final run |
| Database dependency tests | Verified: all four types, duplicate, self, unknown row, unsupported type, authorization, cycle and row-delete pruning |
| Browser automation | Verified: 22 general + 24 database/timeline + 38 interaction checks, 0 failed; temporary scripts not committed |
| Component tests | Unimplemented (no framework configured) |
| Visual regression tests | Unimplemented |
| Load/performance tests | Baseline measurements only; no repeatable performance trace |
