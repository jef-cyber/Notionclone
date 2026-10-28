# Lumen — Performance Notes

## Baseline inspection

The application is a React 18/Vite frontend backed by Express + MongoDB Atlas. Before changes:

- Database row creation awaited `POST /data-tables/:id/rows` before inserting the row into local state. The user saw no row until the network and Mongo write completed.
- Row updates were already optimistic, but failures invalidated the cache and required a refetch.
- The roadmap was a month-bucket grid. Dragging used native HTML5 drag events and recalculated month offsets from the event target.
- The database cache (`frontend/src/components/database/Database.jsx`) used a 5-second TTL and was invalidated on failure.
- The store batched block/page writes with 600 ms debounce.
- `npm run smoke` covered API behavior but not UI latency.

## Identified bottlenecks

1. **Blocking create mutation.** `addRow` waited for the server before updating the UI. This is the main cause of the “creating an item feels slow” problem.
2. **Full-object cache replacement.** `onSaved` and some save paths could replace the entire data table object, risking clobbering an in-flight edit.
3. **Timeline drag does not need server traffic.** The old implementation used HTML5 drag/drop and persisted on drop, but had no preview geometry and no resize.
4. **Timeline recomputation.** Rendering a month grid per row is acceptable for small datasets, but the new timeline computes geometry from a single range and local drag state, not from the whole app.
5. **No pagination.** Large row sets still load fully. This is a known limitation.

## Changes made

### Optimistic row creation

`Database.jsx` now:

- Inserts a temporary row immediately with a local `row-*` id.
- Updates all visible views immediately.
- Sends `POST /rows` in the background.
- Reconciles the server row and replaces the temporary id.
- Applies any edits made while the row was pending.
- Removes the temporary row and shows an actionable error if the request fails.

### Timeline rendering

`TimelineView.jsx`:

- Computes the visible range once per data-table revision from `viewConfig` + zoom.
- Keeps drag/resize previews in local React state.
- Persists only on pointer-up, not per pointer-move.
- Uses one SVG overlay for dependency connectors.
- Memoizes rows and bar geometry so a pointer move changes the moving bar and
  connector overlay without mutating unrelated task bars.
- Coalesces pointer moves and time-based auto-scroll into one animation frame,
  and re-syncs the preview when the timeline is scrolled during a drag.
- Gives every bar a transparent 32px-minimum, full-row-height grab halo so tiny
  bars at month/quarter zoom do not require pixel-perfect pointer placement.
- Stops drag previews and auto-scroll on release, Escape, blur, visibility
  change or unmount.
- Does not refetch the table during drag.
- Uses pointer capture so interactions do not depend on costly DOM hit-testing.

The browser interaction test observes the timeline subtree during a drag and
asserts that zero unrelated `.tl-bar` nodes mutate while the dragged bar does.

### Ordered targeted writes

- Timeline zoom/anchor changes call `PATCH /data-tables/:id` only when the user changes a view preference.
- Scrolling the timeline changes nothing; the viewport is visual only.
- Row updates remain PATCH-by-row, not full-table replacement.
- Zoom/anchor writes and dependency writes each use an ordered promise queue, so a burst of clicks cannot let an older response overwrite the final preference.
- Per-row writes are serialized; a delete waits for an in-flight update before issuing DELETE.
- Date edits are validated against existing dependencies before the optimistic
  update, so an invalid drag is rejected locally without a wasted row PATCH.

## Measurements

The following are measured API-level observations, not invented UI speedups:

| Workflow | Before | After | Notes |
| --- | --- | --- | --- |
| UI row insert | waits for POST | local insert before POST | Asserted by the browser workflow: the row and count appear before the POST resolves. No millisecond claim. |
| API row insert | 1 POST + Mongo save | same | Network/database cost unchanged; perceived latency removed. |
| Timeline drag/resize | native drag, persist on drop | pointer preview, persist on drop | One PATCH on release; verified for move, both edges, all tested zoom levels, Escape and auto-scroll. |
| Timeline scroll | no persistence | no persistence | No writes. Connector and bar screen positions shift together, asserted within 1px after a 60px scroll. |
| Dependency change | none | one PATCH of dependency array | Validated server-side; invalid schedules rejected before the write. Move/resize/create failures inject a 500 and roll back locally. |
| Rapid view changes | unordered writes | ordered queue | Final zoom/anchor wins; Day, Week, Month and Quarter persistence exercised. |
| Rapid row writes | unordered risk | per-row queue | Move immediately followed by resize persists the newest start and end. |
| Unrelated rows during drag | parent re-render could touch every row | memoized rows | Mutation observer asserted `otherBar: 0` while the dragged bar updated. |

No latency benchmark was run. The table above describes call counts and
user-visible ordering, not invented speed numbers.

### Final build observation

The production build completed in 0.9–1.4 s on the development machine across
the final runs, with 75 transformed modules. The final bundle was 321.00 kB
JavaScript / 71.71 kB CSS before gzip (97.32 kB / 12.79 kB gzip). These are
build-size observations, not runtime performance measurements.

Run the actual build and smoke results in `NOTION_CLONE_TESTING.md` for the
current verification status.

## Known performance limits

- A data table is one MongoDB document with an embedded `rows` array. Every row
  update saves the whole document, so write cost grows with table size.
- All rows are loaded and rendered. Timeline/table virtualization and server-side
  pagination are not implemented.
- The 5-second cache is shared by database blocks. It reduces remount GETs but is
  not a mutation-aware cache.
- Timeline connector and axis layout runs per render. Rows are memoized, but
  layout still walks all rows when the table revision changes. This is
  acceptable for the tested small dataset but was not profiled on thousands of
  rows.
- Cache invalidation on some failed writes can force a refetch.

## Remaining performance work

- Paginate rows server-side and virtualize the table/timeline.
- Move large tables to server-side rows if the embedded-document write cost
  becomes a measured problem.
- Add indexes based on real query patterns if row queries become server-side.
- Add a repeatable browser performance trace and record P50/P95 interaction
  latency.
- Cache data tables with a longer, mutation-aware policy instead of a fixed TTL.
- Profile very large timelines before adding windowing or lane culling.
