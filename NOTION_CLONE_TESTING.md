# Lumen - Testing and Verification

## Commands

```bash
# install (if needed)
npm run setup

# production build
cd frontend
npm run build

# API smoke test (requires MongoDB)
cd ..
npm run smoke

# dev servers
npm run dev            # API/static app on :4000
npm run dev:frontend   # Vite on :5173
```

## Final results

All results below were run against the current working tree on 27-28 October
2026. No test result is copied from an earlier revision.

| Check | Result | Evidence |
| --- | --- | --- |
| Production build | **Passed** | Vite 5.4.21, 75 modules, 0 errors. Final bundle: 321.00 kB JS / 71.71 kB CSS before gzip (97.32 kB / 12.79 kB gzip). |
| API smoke suite | **Passed** | 111 checks, 0 failed. Includes all four dependency types, structural validation, authorization and row-deletion pruning. |
| General browser workflow | **Passed** | 22 checks, 0 failed. Boot, auth, 404, settings validation, page create/favorite, search and responsive layout. |
| Database/timeline browser workflow | **Passed** | 24 checks, 0 failed. Six views, optimistic add, move, both resize edges, zoom persistence, valid/invalid dependencies and cycle rejection. |
| Timeline interaction workflow | **Passed** | 40 checks, 0 failed. All four snap levels, auto-scroll, Escape, live preview, grab halos at quarter zoom, draft links, all dependency-type controls, connector alignment, rollback and rapid writes. |
| Runtime errors in the three browser passes | **None** | Each script fails on uncaught exceptions and `console.error`. |

### Reproducing the browser checks

The three browser passes used temporary Chrome DevTools Protocol scripts rather
than a committed test harness. The scripts were run with the production build on
`http://127.0.0.1:4000` and headless Chrome:

- `C:\Users\hrudu\AppData\Local\Temp\opencode\lumen-ui-test.js` - 22 checks.
- `C:\Users\hrudu\AppData\Local\Temp\opencode\lumen-db-test.js` - 24 checks.
- `C:\Users\hrudu\AppData\Local\Temp\opencode\lumen-timeline-interactions.js` -
  40 checks.

They are intentionally outside the repository. Do not claim them as committed
tests. A future task should convert them into a committed `smoke:browser` script
with a configurable Chrome path.

The rollback checks intercept `window.fetch` in the browser and return one
injected HTTP 500 response for a row PATCH or a data-table PATCH. The workflow
then asserts that the optimistic change is reverted, the error toast is visible,
the server state is unchanged and unrelated rows are untouched. This is fault
injection, not a mocked unit test.

### MongoDB flake observed once

One earlier full smoke run failed after MongoDB Atlas stopped accepting
connections (`ETIMEDOUT`/`MongoServerSelectionError`). The failures were network
errors and cascaded because the suite intentionally stops creating dependent
fixtures after a setup request fails. An immediate rerun completed with
**111 passed, 0 failed**. The application code was unchanged between those runs.
This is an infrastructure flake, not a passing result that should be hidden.

## What the smoke suite covers

- Health, auth, JWT rejection, profile validation and workspace membership.
- Nested pages, ordering, favorites, archive/trash, duplicate and cascade delete.
- Blocks, text search, reorder and authorization.
- Data tables, properties, rows, partial row patches and view switching.
- Timeline dependencies: save, server-assigned id, default finish-to-start,
  start-to-start, finish-to-finish, start-to-finish, duplicate rejection,
  self-link rejection, unknown-row rejection, unsupported-type rejection and
  cycle rejection.
- Unauthorized dependency modification is rejected.
- Deleting a row removes its dependency records.
- Cross-workspace and anonymous access rejection.
- Cleanup of every test account and all created data.

## Browser workflows exercised

### General application (22 checks)

1. Boot screen, landing page, token session and workspace shell.
2. Unknown hash -> not-found view with a way home.
3. Settings validation and `aria-invalid` on invalid fields.
4. New-page validation, successful creation and favorite actions.
5. Global search results.
6. Responsive header and settings form at phone width.
7. No uncaught runtime errors.

### Database/timeline basics (24 checks)

1. All six database views over the same rows.
2. Day zoom + `viewConfig` persistence.
3. Drag a timeline bar by whole days while preserving duration.
4. Resize the end date from the right handle.
5. Resize the start date from the left handle without changing the end date.
6. Link two tasks in link mode and persist the dependency.
7. Reject an invalid finish-to-start schedule.
8. Reject a reverse dependency as a cycle.
9. Remove a dependency.
10. Reload the persisted timeline view/zoom.
11. Open the record dialog and confirm dependency controls render.
12. Click `+ Task` and verify the optimistic row is visible before the POST
    finishes, then persisted with the selected date.

### Timeline interactions (40 checks)

1. Day drag snapping and duration preservation.
2. Right resize, left resize and opposite-date preservation.
3. Escape cancellation without a write or follow-up row click.
4. Continuous edge auto-scroll, then Escape cancellation.
5. Week snapping to seven days, month snapping to one calendar month and
   quarter snapping to three calendar months; a one-day bar can be grabbed
   outside its visible edge at quarter zoom.
6. Link-mode source state and the four option values in the type selector.
7. Invalid target red highlighting and invalid-schedule rejection.
8. Valid target green highlighting and finish-to-start persistence.
9. Connector rendering and persistence across a full page reload.
10. Duplicate, cycle and self-link prevention in link mode.
11. Rejection of a connected-task move that would break its schedule.
12. Live proposed dates and duration label during a drag.
13. Mutation-observer check that unrelated task bars do not re-render during a
    drag.
14. Connector updates after a move and a resize.
15. Connector/bar alignment within 1px after a 60px horizontal scroll.
16. Connector realignment after zoom.
17. Dependency selection, details strip and Delete-key removal.
18. Start-to-start creation through the UI.
19. Injected row-save failure: optimistic dates roll back, toast shown, server
    and unrelated rows unchanged.
20. Injected dependency-save failure: optimistic chip rolls back.
21. Rapid move followed by resize persists the newest dates.
22. No uncaught runtime errors.

## Acceptance workflows not yet automated end-to-end

- Cross-view calendar drag and board drag under browser automation.
- Timeline previous/next navigation.
- A screenshot or pixel-diff visual-regression pass.
- A fully keyboard-only move/resize flow (keyboard dependency deletion is
  covered; keyboard linking is implemented but not automated).
- Multi-user sharing and role changes in the browser.
- Server-side date/schedule validation for non-browser API clients.
- A committed visual-regression or performance trace.

## Test coverage status

- The API smoke test is committed and repeatable.
- Dependency validation is covered in the committed suite.
- No component-test framework is configured in the repository.
- Browser automation is verified but not committed.
- The first smoke run can be affected by Atlas connectivity; rerun if all
  failures are `MongoServerSelectionError`/`ETIMEDOUT`.
