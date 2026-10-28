/* ============================================================
   Lumen — database block.

   A database block points at one `dataTable` document. The table, board,
   calendar and roadmap are four renderings of the same rows.
   ============================================================ */

import React, { useCallback, useEffect, useReducer, useRef, useState } from "react";

import { store } from "../../core/store.js";
import {
  confirmDialog,
  Dialog,
  Icon,
  showToast,
} from "../ui/index.jsx";
import {
  cellText,
  columns,
  columnOfType,
  dayKey,
  dependencyDescription,
  dependencyExists,
  dependencyScheduleError,
  dependencyTypeOf,
  DEPENDENCY_TYPES,
  endDateColumn,
  groupColumn,
  makeDependency,
  MONTHS,
  optionsFor,
  PROPERTY_TYPE_LABELS,
  rowDates,
  startDateColumn,
  statusColor,
  statusColumnOf,
  titleColumn,
  toDate,
  wouldCreateCycle,
} from "./databaseUtils.js";
import TimelineView from "./TimelineView.jsx";

const VIEWS = [
  { id: "table", label: "Table" },
  { id: "board", label: "Board" },
  { id: "list", label: "List" },
  { id: "gallery", label: "Gallery" },
  { id: "calendar", label: "Calendar" },
  { id: "timeline", label: "Timeline" },
];

/* Legacy databases persisted "roadmap". The timeline is the same view. */
function normalizedView(id) {
  return id === "roadmap" ? "timeline" : id;
}

/* Re-mounting the editor re-mounts every database block, so the cache keeps
   that from becoming one GET per table per render. */
const CACHE_TTL = 5000;
const cache = new Map();

function cached(id) {
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < CACHE_TTL) return Promise.resolve(hit.dt);
  return store.getDataTable(id).then((dt) => {
    cache.set(id, { dt, at: Date.now() });
    return dt;
  });
}

function invalidate(id) {
  if (id) cache.delete(id);
  else cache.clear();
}

/* ---------- cell ---------- */
function Cell({ dataTable, row, column, setCell }) {
  const spec = (dataTable.properties || {})[column] || { type: "text" };
  const value = row[column];

  if (spec.type === "checkbox") {
    return (
      <div className="db-cell">
        <input
          type="checkbox"
          checked={!!value}
          onChange={(e) => setCell(row.id, column, e.target.checked)}
        />
      </div>
    );
  }

  if (spec.type === "select" || spec.type === "multi_select") {
    const options = spec.options || [];
    const current =
      spec.type === "multi_select" && Array.isArray(value)
        ? value[0] || ""
        : cellText(value);
    return (
      <div className="db-cell">
        <select
          className="db-select"
          value={current}
          onChange={(e) => setCell(row.id, column, e.target.value || null)}
        >
          <option value=""></option>
          {options.map((o) => (
            <option value={o} key={o}>
              {o}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (spec.type === "date") {
    const d = toDate(value);
    return (
      <div className="db-cell">
        <input
          type="date"
          className="db-date"
          value={d ? dayKey(d) : ""}
          onChange={(e) => setCell(row.id, column, e.target.value || null)}
        />
      </div>
    );
  }

  const commit = (input) => {
    if (spec.type === "number") {
      setCell(row.id, column, input.value === "" ? null : Number(input.value));
    } else {
      setCell(row.id, column, input.value);
    }
  };

  return (
    <div className="db-cell">
      <input
        className="db-input"
        type={
          spec.type === "number"
            ? "number"
            : spec.type === "url" || spec.type === "email"
              ? spec.type
              : "text"
        }
        defaultValue={cellText(value)}
        placeholder={spec.type === "title" ? "Untitled" : "\u2014"}
        onBlur={(e) => commit(e.currentTarget)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
      />
    </div>
  );
}

/* ---------- database ---------- */
let localRowSeq = 0;
function localRowId() {
  localRowSeq += 1;
  return `row_local_${Date.now().toString(36)}_${localRowSeq}`;
}

export default function Database({ block, pageId }) {
  const [revision, bump] = useReducer((v) => v + 1, 0);
  const dtRef = useRef(null);
  const rowWrites = useRef(new Map());
  const pendingRows = useRef(new Map());
  const configWrites = useRef(Promise.resolve());
  const dependencyWrites = useRef(Promise.resolve());
  const savedDependencies = useRef([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [view, setView] = useState("table");
  const [monthCursor, setMonthCursor] = useState(() => new Date());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [rowId, setRowId] = useState(null);

  const dataTable = dtRef.current;

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setError("");
    const spec = block.database || { name: "New database" };

    const ensure = block.dataTableId
      ? cached(block.dataTableId)
      : store
          .createDataTable(pageId, {
            name: spec.name || "New database",
            description: spec.description || "",
            properties: spec.properties,
            rows: spec.rows,
            defaultView: spec.defaultView || "table",
          })
          .then((created) => {
            store.updateBlock(pageId, block.id, { dataTableId: created._id });
            cache.set(created._id, { dt: created, at: Date.now() });
            return created;
          });

    ensure
      .then((dt) => {
        if (cancelled) return;
        dtRef.current = dt;
        savedDependencies.current = dt.dependencies || [];
        cache.set(dt._id, { dt, at: Date.now() });
        const initial = normalizedView(dt.defaultView);
        setView(VIEWS.some((v) => v.id === initial) ? initial : "table");
        setReady(true);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message);
        setReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, [pageId, block.id]);

  /* ---------- row writes ----------
     All writes for one row go through a queue. Two quick edits therefore reach
     the server in order instead of racing and overwriting each other. */
  const queueRowWrite = (dtId, id, patch) => {
    const key = String(id);
    const previous = rowWrites.current.get(key) || Promise.resolve();
    const next = previous
      .catch(() => null)
      .then(() => store.updateDataTableRow(dtId, id, patch));
    rowWrites.current.set(key, next);
    const done = () => {
      if (rowWrites.current.get(key) === next) rowWrites.current.delete(key);
    };
    next.then(done, done);
    return next;
  };

  const setCells = (id, patch) => {
    const dt = dtRef.current;
    if (!dt) return Promise.resolve(null);
    const row = (dt.rows || []).find((r) => String(r.id) === String(id));
    if (!row) return Promise.resolve(null);

    // Date edits can also arrive from the record dialog. Keep the same
    // dependency rules as timeline drag/resize so no UI path can silently
    // break a link while the server still stores a structurally valid edge.
    const startCol = startDateColumn(dt);
    const endCol = endDateColumn(dt, startCol);
    const touchesDates =
      (startCol && Object.prototype.hasOwnProperty.call(patch, startCol)) ||
      (endCol && Object.prototype.hasOwnProperty.call(patch, endCol));
    if (touchesDates && startCol && (dt.dependencies || []).length) {
      const tempRow = { ...row, ...patch };
      const nextRange = rowDates(dt, tempRow, startCol, endCol);
      if (nextRange) {
        for (let i = 0; i < dt.dependencies.length; i += 1) {
          const dep = dt.dependencies[i];
          if (
            String(dep.from) !== String(row.id) &&
            String(dep.to) !== String(row.id)
          ) {
            continue;
          }
          const source = (dt.rows || []).find(
            (item) => String(item.id) === String(dep.from)
          );
          const target = (dt.rows || []).find(
            (item) => String(item.id) === String(dep.to)
          );
          if (!source || !target) continue;
          const sourceRange =
            String(source.id) === String(row.id)
              ? nextRange
              : rowDates(dt, source, startCol, endCol);
          const targetRange =
            String(target.id) === String(row.id)
              ? nextRange
              : rowDates(dt, target, startCol, endCol);
          const scheduleError = dependencyScheduleError(
            dependencyTypeOf(dep),
            sourceRange,
            targetRange
          );
          if (scheduleError) {
            showToast(scheduleError, "error");
            return Promise.resolve(null);
          }
        }
      }
    }

    const before = {};
    Object.keys(patch).forEach((key) => {
      before[key] = row[key];
    });

    Object.assign(row, patch); // optimistic
    bump();

    const pending = pendingRows.current.get(String(id));
    if (pending) {
      // The row has not reached the server yet. Keep the edits and replay them
      // after the POST returns the authoritative row id.
      Object.assign(pending.edits, patch);
      return Promise.resolve(row);
    }

    return queueRowWrite(dt._id, id, patch)
      .then(() => row)
      .catch((err) => {
        // Only roll back values that have not been superseded by a newer edit.
        Object.keys(patch).forEach((key) => {
          if (row[key] === patch[key]) row[key] = before[key];
        });
        bump();
        showToast(err.message, "error");
        return null;
      });
  };

  const setCell = (id, column, value) => setCells(id, { [column]: value });

  const addRow = (extra) => {
    const dt = dtRef.current;
    if (!dt) return Promise.resolve(null);
    const values = Object.assign({}, extra || {});
    columns(dt).forEach((c) => {
      const type = dt.properties[c].type;
      if (type === "checkbox" && values[c] === undefined) values[c] = false;
    });

    // Show the record immediately. The temporary id is replaced as soon as the
    // server responds; edits made in the meantime are replayed against the real
    // id. This removes the POST round-trip from the user-visible interaction.
    const tempId = localRowId();
    const localRow = { id: tempId, ...values, __pending: true };
    dt.rows.push(localRow);
    const pending = { row: localRow, edits: {}, deleted: false };
    pendingRows.current.set(tempId, pending);
    cache.set(dt._id, { dt, at: Date.now() });
    bump();

    return store
      .addDataTableRow(dt._id, values)
      .then((saved) => {
        pendingRows.current.delete(tempId);
        if (pending.deleted) {
          store.deleteDataTableRow(dt._id, saved.id).catch((err) => {
            showToast(err.message, "error");
          });
          return null;
        }

        const merged = { ...saved, ...pending.edits };
        const index = dt.rows.findIndex((r) => String(r.id) === String(tempId));
        if (index === -1) dt.rows.push(merged);
        else dt.rows[index] = merged;

        if (Object.keys(pending.edits).length) {
          queueRowWrite(dt._id, saved.id, pending.edits).catch((err) => {
            showToast(err.message, "error");
          });
        }

        cache.set(dt._id, { dt, at: Date.now() });
        bump();
        return merged;
      })
      .catch((err) => {
        pendingRows.current.delete(tempId);
        dt.rows = dt.rows.filter((r) => String(r.id) !== String(tempId));
        bump();
        showToast(err.message, "error");
        return null;
      });
  };

  const deleteRow = (id) => {
    const dt = dtRef.current;
    if (!dt) return;
    const index = (dt.rows || []).findIndex((r) => String(r.id) === String(id));
    if (index === -1) return;
    const removed = dt.rows[index];
    const dependenciesBefore = dt.dependencies || [];

    dt.rows = dt.rows.filter((r) => String(r.id) !== String(id));
    dt.dependencies = dependenciesBefore.filter(
      (dep) => String(dep.from) !== String(id) && String(dep.to) !== String(id)
    );
    cache.set(dt._id, { dt, at: Date.now() });
    bump();

    const pending = pendingRows.current.get(String(id));
    if (pending) {
      pending.deleted = true;
      pendingRows.current.delete(String(id));
      return;
    }

    const restore = (err) => {
      // Restore the row and its links if the server rejected the delete.
      dt.rows.splice(Math.min(index, dt.rows.length), 0, removed);
      dt.dependencies = dependenciesBefore;
      cache.set(dt._id, { dt, at: Date.now() });
      bump();
      showToast(err.message, "error");
    };

    // Never send DELETE while an update for this row is still in flight: the
    // update could otherwise save after the delete and re-create stale data.
    const queued = rowWrites.current.get(String(id));
    const removeOnServer = () => store.deleteDataTableRow(dt._id, id);
    if (queued) {
      queued
        .catch(() => null)
        .then(removeOnServer)
        .catch(restore);
    } else {
      removeOnServer().catch(restore);
    }
  };

  const deleteRowConfirm = async (id) => {
    const ok = await confirmDialog({
      title: "Delete row?",
      message: "This removes the row from every view of this database.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (ok) deleteRow(id);
  };

  /* ---------- timeline preferences & dependencies ---------- */
  const saveConfig = (patch) => {
    const dt = dtRef.current;
    if (!dt) return;
    dt.viewConfig = { ...(dt.viewConfig || {}), ...patch };
    const snapshot = dt.viewConfig;
    cache.set(dt._id, { dt, at: Date.now() });
    bump();

    // Keep writes in order. A burst of zoom/navigation clicks settles on the
    // final preference instead of letting an older response win.
    configWrites.current = configWrites.current
      .catch(() => null)
      .then(() => store.updateDataTable(dt._id, { viewConfig: snapshot }))
      .then((saved) => {
        const current = dtRef.current;
        if (!current || current.viewConfig !== snapshot) return;
        current.viewConfig = saved.viewConfig || snapshot;
        current.updatedAt = saved.updatedAt;
        cache.set(current._id, { dt: current, at: Date.now() });
        bump();
      })
      .catch((err) => showToast(err.message, "error"));
  };

  const saveDependencies = (next) => {
    const dt = dtRef.current;
    if (!dt) return Promise.resolve(false);
    dt.dependencies = next;
    cache.set(dt._id, { dt, at: Date.now() });
    bump();

    const write = dependencyWrites.current
      .catch(() => null)
      .then(() => store.updateDataTable(dt._id, { dependencies: next }));
    dependencyWrites.current = write;

    return write
      .then((saved) => {
        // Track the server-confirmed state even when a newer optimistic array
        // is already visible; a later failure should roll back to this state.
        savedDependencies.current = saved.dependencies || next;
        const current = dtRef.current;
        if (current && current.dependencies === next) {
          current.dependencies = savedDependencies.current;
          current.updatedAt = saved.updatedAt;
          cache.set(current._id, { dt: current, at: Date.now() });
          bump();
        }
        return true;
      })
      .catch((err) => {
        const current = dtRef.current;
        // Roll back to the last state the server actually confirmed, not to a
        // previous optimistic array that may also have failed to save.
        if (current && current.dependencies === next) {
          current.dependencies = savedDependencies.current;
          cache.set(current._id, { dt: current, at: Date.now() });
          bump();
        }
        showToast(err.message, "error");
        return false;
      });
  };

  /* ---------- view switch ---------- */
  const switchView = (id) => {
    setView(id);
    const dt = dtRef.current;
    if (!dt) return;
    dt.defaultView = id;
    bump();
    store
      .updateDataTable(dt._id, { defaultView: id })
      .then((saved) => {
        // Only the default view changed. Keep the locally cached rows and
        // properties: replacing the whole object here could clobber a row
        // edit that was still in flight (for example a date typed just before
        // switching to Calendar).
        const current = dtRef.current || saved;
        current.defaultView = saved.defaultView;
        current.updatedAt = saved.updatedAt;
        cache.set(current._id, { dt: current, at: Date.now() });
        bump();
      })
      .catch((err) => showToast(err.message, "error"));
  };

  /* ---------- render ---------- */
  let body;
  if (error) {
    body = (
      <div className="db-empty">
        <p>{error}</p>
      </div>
    );
  } else if (!ready || !dataTable) {
    body = <div className="db-status">Loading…</div>;
  } else {
    body = (
      <>
        <div
          className="db-toolbar"
          onDoubleClick={(e) => {
            if (e.target.closest("button, input, select, a, [contenteditable]")) {
              return;
            }
            setSettingsOpen(true);
          }}
        >
          <div className="db-name" title="Double-click to edit database">
            {dataTable.name || "Database"}
          </div>
          <span className="db-count">{(dataTable.rows || []).length + " rows"}</span>
          <div className="db-tabs">
            {VIEWS.map((v) => (
              <button
                key={v.id}
                className="db-tab"
                data-active={String(view === v.id)}
                onClick={() => switchView(v.id)}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>
        <div className="db-body">
          {view === "table" ? (
            <TableView
              dataTable={dataTable}
              setCell={setCell}
              addRow={addRow}
              deleteRow={deleteRowConfirm}
            />
          ) : view === "board" ? (
            <BoardView
              dataTable={dataTable}
              setCell={setCell}
              addRow={addRow}
              deleteRow={deleteRowConfirm}
            />
          ) : view === "list" ? (
            <ListView
              dataTable={dataTable}
              addRow={addRow}
              openRow={(row) => setRowId(row.id)}
            />
          ) : view === "gallery" ? (
            <GalleryView
              dataTable={dataTable}
              addRow={addRow}
              openRow={(row) => setRowId(row.id)}
            />
          ) : view === "calendar" ? (
            <CalendarView
              dataTable={dataTable}
              monthCursor={monthCursor}
              setMonthCursor={setMonthCursor}
              setCell={setCell}
              addRow={addRow}
              openSettings={() => setSettingsOpen(true)}
              openRow={(row) => setRowId(row.id)}
            />
          ) : (
            <TimelineView
              dataTable={dataTable}
              revision={revision}
              setCells={setCells}
              addRow={addRow}
              openSettings={() => setSettingsOpen(true)}
              openRow={(row) => setRowId(row.id)}
              onConfigChange={saveConfig}
              onDependenciesChange={saveDependencies}
            />
          )}
        </div>
      </>
    );
  }

  const dialogRow =
    dataTable && rowId
      ? (dataTable.rows || []).find((r) => String(r.id) === String(rowId)) || null
      : null;

  return (
    <div className="db">
      {body}
      <DatabaseSettings
        open={settingsOpen}
        dataTable={dataTable}
        onClose={() => setSettingsOpen(false)}
        onSaved={(saved) => {
          dtRef.current = saved;
          invalidate(saved._id);
          bump();
        }}
        onDatabaseDeleted={(id) => {
          store.removeBlock(pageId, block.id);
          invalidate(id);
          setSettingsOpen(false);
          showToast("Database deleted", "info");
        }}
      />
      {dialogRow ? (
        <RowDialog
          dataTable={dataTable}
          row={dialogRow}
          setCell={setCell}
          dependencies={dataTable.dependencies || []}
          onDependenciesChange={saveDependencies}
          onDelete={() => {
            const id = dialogRow.id;
            setRowId(null);
            deleteRow(id);
          }}
          onClose={() => setRowId(null)}
        />
      ) : null}
    </div>
  );
}

/* ============================================================
   Table
   ============================================================ */
function TableView({ dataTable, setCell, addRow, deleteRow }) {
  const cols = columns(dataTable);
  if (!cols.length) {
    return (
      <div className="db-empty">
        <p>This database has no columns.</p>
      </div>
    );
  }
  const primary = titleColumn(dataTable);

  return (
    <>
      <div className="db-table-wrap">
        <table className="db-table">
          <thead>
            <tr>
              {cols.map((c) => (
                <th key={c} className={c === primary ? "db-col-primary" : undefined}>
                  {c}
                </th>
              ))}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(dataTable.rows || []).map((row) => (
              <tr key={row.id} data-id={row.id}>
                {cols.map((c) => (
                  <td key={c} className={c === primary ? "db-col-primary" : undefined}>
                    <Cell dataTable={dataTable} row={row} column={c} setCell={setCell} />
                  </td>
                ))}
                <td className="db-row-actions">
                  <button
                    className="db-icon-btn"
                    aria-label="Delete row"
                    onClick={() => deleteRow(row.id)}
                  >
                    <Icon name="trash" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="db-footer">
        <button className="btn btn-ghost btn-sm" onClick={() => addRow()}>
          + New row
        </button>
      </div>
    </>
  );
}

/* ============================================================
   Board
   ============================================================ */
function BoardView({ dataTable, setCell, addRow, deleteRow }) {
  const group = groupColumn(dataTable);
  const options = optionsFor(dataTable, group);
  const primary = titleColumn(dataTable);

  return (
    <div className="db-board">
      {options.map((option) => {
        const rows = (dataTable.rows || []).filter(
          (r) => cellText(r[group]) === option
        );
        return (
          <div
            className="db-board-col"
            key={option}
            data-group={option}
            data-color={statusColor(option)}
            onDragOver={(e) => {
              if (!e.dataTransfer.types.includes("text/plain")) return;
              e.preventDefault();
              e.currentTarget.classList.add("is-over");
            }}
            onDragLeave={(e) => e.currentTarget.classList.remove("is-over")}
            onDrop={(e) => {
              e.preventDefault();
              e.currentTarget.classList.remove("is-over");
              const id = e.dataTransfer.getData("text/plain");
              if (id) setCell(id, group, option);
            }}
          >
            <div className="db-board-head">
              <span className="db-board-title">{option}</span>
              <span className="db-board-count">{rows.length}</span>
            </div>
            <div className="db-board-list">
              {rows.map((row) => (
                <div
                  className="db-card"
                  key={row.id}
                  draggable="true"
                  data-id={row.id}
                  data-color={statusColor(option)}
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", row.id);
                    e.currentTarget.classList.add("is-dragging");
                  }}
                  onDragEnd={(e) => e.currentTarget.classList.remove("is-dragging")}
                >
                  <Cell dataTable={dataTable} row={row} column={primary} setCell={setCell} />
                  <CardMeta dataTable={dataTable} row={row} skip={group} />
                  <button
                    className="db-icon-btn"
                    aria-label="Delete row"
                    onClick={() => deleteRow(row.id)}
                  >
                    <Icon name="trash" />
                  </button>
                </div>
              ))}
            </div>
            <button
              className="db-board-add"
              onClick={() => {
                const values = {};
                values[group] = option;
                addRow(values);
              }}
            >
              + Add
            </button>
          </div>
        );
      })}
    </div>
  );
}

function CardMeta({ dataTable, row, skip }) {
  return (
    <div className="db-card-meta">
      {columns(dataTable)
        .filter((c) => c !== skip && c !== titleColumn(dataTable))
        .slice(0, 3)
        .map((c) => {
          const spec = dataTable.properties[c];
          const raw = row[c];
          if (raw === null || raw === undefined || raw === "") return null;
          const kind =
            spec.type === "date" ? "date" : spec.type === "checkbox" ? "check" : "text";
          return (
            <span className={"db-pill db-pill-" + kind} key={c}>
              {spec.type === "checkbox" ? "\u2713" : cellText(raw)}
            </span>
          );
        })}
    </div>
  );
}

/* ============================================================
   Calendar
   ============================================================ */
function CalendarView({
  dataTable,
  monthCursor,
  setMonthCursor,
  setCell,
  addRow,
  openSettings,
  openRow,
}) {
  const dateCol = columnOfType(dataTable, "date");
  if (!dateCol) {
    return (
      <div className="db-empty">
        <Icon name="clock" />
        <p>This database has no date property, so there is nothing to lay out on a calendar.</p>
        <button className="btn btn-secondary btn-sm" onClick={openSettings}>
          Add a date property
        </button>
      </div>
    );
  }

  const year = monthCursor.getFullYear();
  const month = monthCursor.getMonth();
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7; // Monday-first
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const primary = titleColumn(dataTable);
  const groupCol = groupColumn(dataTable);
  const todayKey = dayKey(new Date());

  const days = [];
  for (let i = 0; i < lead; i += 1) days.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) days.push(day);

  return (
    <>
      <div className="db-cal-head">
        <button
          className="db-icon-btn"
          aria-label="Previous month"
          onClick={() => setMonthCursor(new Date(year, month - 1, 1))}
        >
          <Icon name="chevron-left" />
        </button>
        <span className="db-cal-label">
          {MONTHS[month] + " " + year}
        </span>
        <button
          className="db-icon-btn"
          aria-label="Next month"
          onClick={() => setMonthCursor(new Date(year, month + 1, 1))}
        >
          <Icon name="chevron-right" />
        </button>
      </div>

      <div className="db-cal">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div className="db-cal-dow" key={d}>
            {d}
          </div>
        ))}

        {days.map((day, i) => {
          if (day === null) {
            return <div className="db-cal-day is-empty" key={"blank" + i} />;
          }
          const date = new Date(year, month, day);
          const key = dayKey(date);
          const rows = (dataTable.rows || []).filter((r) => {
            const d = toDate(r[dateCol]);
            return d && dayKey(d) === key;
          });
          return (
            <div
              className={"db-cal-day" + (key === todayKey ? " is-today" : "")}
              data-date={key}
              key={key}
              onDragOver={(e) => {
                if (!e.dataTransfer.types.includes("text/plain")) return;
                e.preventDefault();
                e.currentTarget.classList.add("is-over");
              }}
              onDragLeave={(e) => e.currentTarget.classList.remove("is-over")}
              onDrop={(e) => {
                e.preventDefault();
                e.currentTarget.classList.remove("is-over");
                const id = e.dataTransfer.getData("text/plain");
                if (id) setCell(id, dateCol, key);
              }}
            >
              <div className="db-cal-num">{day}</div>
              <button
                className="db-cal-add-day"
                type="button"
                aria-label="Add row on this day"
                onClick={(e) => {
                  e.stopPropagation();
                  const values = { [dateCol]: key };
                  addRow(values).then((row) => {
                    if (row) openRow(row);
                  });
                }}
              >
                <Icon name="plus" />
              </button>
              {rows.map((row) => (
                <div
                  className="db-cal-chip"
                  key={row.id}
                  draggable="true"
                  data-id={row.id}
                  data-color={statusColor(row[groupCol])}
                  title={"Click to edit \u00b7 drag to reschedule"}
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", row.id);
                    e.currentTarget.classList.add("is-dragging");
                  }}
                  onDragEnd={(e) => e.currentTarget.classList.remove("is-dragging")}
                  onClick={() => openRow(row)}
                >
                  {cellText(row[primary]) || "Untitled"}
                </div>
              ))}
            </div>
          );
        })}
      </div>

      <button className="btn btn-ghost btn-sm db-cal-add" onClick={() => addRow()}>
        + New row
      </button>
    </>
  );
}

/* ============================================================
   List & gallery views
   ============================================================ */
function ListView({ dataTable, addRow, openRow }) {
  const primary = titleColumn(dataTable);
  const secondary = statusColumnOf(dataTable);
  const dateCol = columnOfType(dataTable, "date");
  const rows = dataTable.rows || [];

  return (
    <div className="db-list">
      {rows.length === 0 ? (
        <div className="db-empty">
          <p>No records yet. Add the first one.</p>
        </div>
      ) : (
        rows.map((row) => (
          <button
            type="button"
            className="db-list-row"
            key={row.id}
            data-color={secondary ? statusColor(row[secondary]) : ""}
            onClick={() => openRow(row)}
          >
            <span className="db-list-title">{cellText(row[primary]) || "Untitled"}</span>
            {secondary && row[secondary] ? (
              <span className="db-pill">{cellText(row[secondary])}</span>
            ) : null}
            {dateCol && row[dateCol] ? (
              <span className="db-pill db-pill-date">{cellText(row[dateCol]).slice(0, 10)}</span>
            ) : null}
            <span className="db-list-open" aria-hidden="true">Open</span>
          </button>
        ))
      )}
      <div className="db-footer">
        <button className="btn btn-ghost btn-sm" onClick={() => addRow()}>
          + New row
        </button>
      </div>
    </div>
  );
}

function GalleryView({ dataTable, addRow, openRow }) {
  const primary = titleColumn(dataTable);
  const group = groupColumn(dataTable);
  const rows = dataTable.rows || [];

  if (!rows.length) {
    return (
      <div className="db-empty">
        <Icon name="layout" />
        <p>No records yet. Add one to start the gallery.</p>
        <button className="btn btn-secondary btn-sm" onClick={() => addRow()}>
          + New record
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="db-gallery">
        {rows.map((row) => (
          <button
            type="button"
            className="db-gallery-card"
            key={row.id}
            data-color={statusColor(row[group])}
            onClick={() => openRow(row)}
          >
            <span className="db-gallery-title">{cellText(row[primary]) || "Untitled"}</span>
            <CardMeta dataTable={dataTable} row={row} skip={group} />
            {row[group] ? <span className="db-gallery-group">{cellText(row[group])}</span> : null}
          </button>
        ))}
      </div>
      <div className="db-footer">
        <button className="btn btn-ghost btn-sm" onClick={() => addRow()}>
          + New row
        </button>
      </div>
    </>
  );
}

/* ============================================================
   Row dialog
   ============================================================ */
function RowDialog({
  dataTable,
  row,
  setCell,
  dependencies,
  onDependenciesChange,
  onDelete,
  onClose,
}) {
  const [depTarget, setDepTarget] = useState("");
  const [depType, setDepType] = useState("finish-to-start");
  const cols = columns(dataTable);
  const title = cellText(row[titleColumn(dataTable)]) || "Row";
  const rows = dataTable.rows || [];
  const links = dependencies || [];
  const incoming = links.filter((dep) => String(dep.to) === String(row.id));
  const outgoing = links.filter((dep) => String(dep.from) === String(row.id));
  const startCol = startDateColumn(dataTable);
  const endCol = endDateColumn(dataTable, startCol);
  const rowById = (id) => rows.find((r) => String(r.id) === String(id)) || null;
  const rowPending = !!row.__pending;

  const addDependency = (from, to) => {
    if (rowPending) {
      showToast("Wait for this row to finish saving before adding dependencies", "info");
      return;
    }
    if (!from || !to) return;
    if (String(from) === String(to)) {
      showToast("A task cannot depend on itself", "error");
      return;
    }
    if (dependencyExists(links, from, to)) {
      showToast("Those tasks are already linked", "info");
      return;
    }
    if (wouldCreateCycle(links, from, to)) {
      showToast("That link would create a dependency cycle", "error");
      return;
    }

    const predecessor = rowById(from);
    const successor = rowById(to);
    const before = predecessor && startCol ? rowDates(dataTable, predecessor, startCol, endCol) : null;
    const after = successor && startCol ? rowDates(dataTable, successor, startCol, endCol) : null;
    const scheduleError = dependencyScheduleError(depType, before, after);
    if (scheduleError) {
      showToast(scheduleError, "error");
      return;
    }

    onDependenciesChange(links.concat(makeDependency(from, to, depType))).then((ok) => {
      if (ok) setDepTarget("");
    });
  };

  const removeDependency = (dep) => {
    onDependenciesChange(
      links.filter(
        (item) =>
          !(String(item.from) === String(dep.from) && String(item.to) === String(dep.to))
      )
    );
  };

  const linkLabel = (dep, direction) => {
    const otherId = direction === "in" ? dep.from : dep.to;
    const other = rowById(otherId);
    return other ? cellText(other[titleColumn(dataTable)]) || "Untitled" : "Deleted task";
  };

  return (
    <Dialog
      open
      title={title}
      size="modal-sm"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-danger" onClick={onDelete}>
            Delete
          </button>
          <button className="btn btn-primary" onClick={onClose}>
            Done
          </button>
        </>
      }
    >
      <div className="db-dialog">
        {cols.map((c) => {
          const spec = dataTable.properties[c] || { type: "text" };
          const value = row[c];
          let input;
          if (spec.type === "checkbox") {
            input = (
              <input
                type="checkbox"
                checked={!!value}
                onChange={(e) => setCell(row.id, c, e.target.checked)}
              />
            );
          } else if (spec.type === "select" || spec.type === "multi_select") {
            const options = spec.options || [];
            input = (
              <select
                className="select"
                value={cellText(value)}
                onChange={(e) => setCell(row.id, c, e.target.value || null)}
              >
                <option value=""></option>
                {options.map((o) => (
                  <option value={o} key={o}>
                    {o}
                  </option>
                ))}
              </select>
            );
          } else if (spec.type === "date") {
            const d = toDate(value);
            input = (
              <input
                type="date"
                defaultValue={d ? dayKey(d) : ""}
                onChange={(e) => setCell(row.id, c, e.target.value || null)}
              />
            );
          } else {
            input = (
              <input
                type={spec.type === "number" ? "number" : "text"}
                defaultValue={cellText(value)}
                onBlur={(e) => {
                  if (spec.type === "number") {
                    setCell(
                      row.id,
                      c,
                      e.currentTarget.value === ""
                        ? null
                        : Number(e.currentTarget.value)
                    );
                  } else {
                    setCell(row.id, c, e.currentTarget.value);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                }}
              />
            );
          }
          return (
            <div className="field" key={c}>
              <label>{c}</label>
              {input}
            </div>
          );
        })}

        <div className="db-dialog-deps">
          <div className="db-settings-section-title">Dependencies</div>
          <div className="field">
            <label htmlFor="db-dep-type">Relationship</label>
            <select
              id="db-dep-type"
              className="select"
              value={depType}
              disabled={rowPending}
              onChange={(e) => setDepType(e.target.value)}
            >
              {Object.entries(DEPENDENCY_TYPES).map(([id, label]) => (
                <option value={id} key={id}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="db-dep-target">Depends on</label>
            <select
              id="db-dep-target"
              className="select"
              value={depTarget}
              disabled={rowPending}
              onChange={(e) => {
                const value = e.target.value;
                setDepTarget("");
                if (value) addDependency(value, row.id);
              }}
            >
              <option value="">Choose a task…</option>
              {rows
                .filter(
                  (other) =>
                    String(other.id) !== String(row.id) && !other.__pending
                )
                .map((other) => (
                  <option value={other.id} key={other.id}>
                    {cellText(other[titleColumn(dataTable)]) || "Untitled"}
                  </option>
                ))}
            </select>
          </div>

          {incoming.length ? (
            <div className="db-dep-list">
              <span className="db-dep-heading">Blocked by</span>
              {incoming.map((dep) => (
                <div className="db-dep-row" key={dep.id || dep.from + dep.to}>
                  <span className="db-dep-main">
                    <span>{linkLabel(dep, "in")}</span>
                    <span className="db-dep-type">
                      {DEPENDENCY_TYPES[dep.type] || DEPENDENCY_TYPES["finish-to-start"]}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="db-dep-remove"
                    aria-label="Remove dependency"
                    onClick={() => removeDependency(dep)}
                  >
                    <Icon name="close" />
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          {outgoing.length ? (
            <div className="db-dep-list">
              <span className="db-dep-heading">Blocks</span>
              {outgoing.map((dep) => (
                <div className="db-dep-row" key={dep.id || dep.from + dep.to}>
                  <span className="db-dep-main">
                    <span>{linkLabel(dep, "out")}</span>
                    <span className="db-dep-type">
                      {DEPENDENCY_TYPES[dep.type] || DEPENDENCY_TYPES["finish-to-start"]}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="db-dep-remove"
                    aria-label="Remove dependency"
                    onClick={() => removeDependency(dep)}
                  >
                    <Icon name="close" />
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          <p className="db-dialog-hint">
            {rowPending
              ? "This row is still saving. Dependencies unlock when it has a server id."
              : dependencyDescription(depType)}
          </p>
        </div>
      </div>
    </Dialog>
  );
}

/* ============================================================
   Database settings
   ============================================================ */
function DatabaseSettings({ open, dataTable, onClose, onSaved, onDatabaseDeleted }) {
  const [nameDraft, setNameDraft] = useState("");
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("text");
  const [newOptions, setNewOptions] = useState("");
  const saveChain = useRef(Promise.resolve());

  useEffect(() => {
    if (!open) return;
    setNameDraft(dataTable ? dataTable.name || "" : "");
    setNewName("");
    setNewType("text");
    setNewOptions("");
    // Only reset the drafts when the dialog is opened or the name changes
    // because of a save; typing must not be overwritten.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open || !dataTable) return;
    setNameDraft(dataTable.name || "");
  }, [open, dataTable && dataTable.name, dataTable]);

  if (!dataTable) return null;

  const props = dataTable.properties || {};
  const names = Object.keys(props);
  const dtId = dataTable._id;

  const save = (patch) => {
    // Settings edits (name, properties) are separate PATCHes. Send them in
    // order so a slower response cannot overwrite a newer edit, and so the
    // last onSaved() carries every change.
    saveChain.current = saveChain.current
      .catch(() => null)
      .then(() => store.updateDataTable(dtId, patch))
      .then((saved) => {
        if (onSaved) onSaved(saved);
        showToast("Database updated", "success");
      })
      .catch((err) => showToast(err.message, "error"));
  };

  const saveName = () => {
    const name = nameDraft.trim();
    if (!name || name === dataTable.name) {
      setNameDraft(dataTable.name || "");
      return;
    }
    save({ name });
  };

  const addProperty = () => {
    const name = newName.trim();
    if (!name) {
      showToast("Enter a property name", "error");
      return;
    }
    if (props[name] || (dataTable.properties || {})[name]) {
      showToast("A property with that name already exists", "error");
      return;
    }
    const def = { type: newType };
    if (newType === "select" || newType === "multi_select") {
      const opts = newOptions
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      def.options = opts.length ? opts : ["Option 1", "Option 2", "Option 3"];
    }
    const next = Object.assign({}, dataTable.properties);
    next[name] = def;
    save({ properties: next });
    setNewName("");
    setNewOptions("");
  };

  const deleteProperty = async (key) => {
    const ok = await confirmDialog({
      title: "Delete property?",
      message: (
        <>
          Delete <span className="confirm-name">{key}</span> and its values in every
          row? This cannot be undone.
        </>
      ),
      confirmLabel: "Delete property",
      danger: true,
    });
    if (!ok) return;
    const next = Object.assign({}, dataTable.properties);
    delete next[key];
    const rows = (dataTable.rows || []).map((r) => {
      const copy = Object.assign({}, r);
      delete copy[key];
      return copy;
    });
    save({ properties: next, rows });
  };

  const deleteDatabase = async () => {
    const ok = await confirmDialog({
      title: "Delete database?",
      message: (
        <>
          This removes <span className="confirm-name">{dataTable.name || "this database"}</span> and
          all of its rows from the page. This cannot be undone.
        </>
      ),
      confirmLabel: "Delete database",
      danger: true,
    });
    if (!ok) return;
    const id = dataTable._id;
    store
      .deleteDataTable(id)
      .then(() => {
        if (onDatabaseDeleted) onDatabaseDeleted(id);
      })
      .catch((err) => showToast(err.message, "error"));
  };

  return (
    <Dialog
      open={open}
      title="Database settings"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-danger" onClick={deleteDatabase}>
            <Icon name="trash" /> Delete database
          </button>
          <span className="spacer"></span>
          <button className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </>
      }
    >
      <div className="db-settings">
        <div className="field">
          <label htmlFor="db-name-input">Name</label>
          <input
            id="db-name-input"
            type="text"
            maxLength={200}
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
          />
        </div>

        <div className="db-settings-section-title">Properties</div>
        <div className="db-props">
          {names.map((n) => {
            const p = props[n];
            return (
              <div className="db-prop-row" key={n}>
                <span className="db-prop-name">{n}</span>
                <span className="db-prop-type">
                  {PROPERTY_TYPE_LABELS[p.type] || p.type}
                </span>
                {names.length > 1 ? (
                  <button
                    className="db-icon-btn db-prop-delete"
                    data-prop={n}
                    aria-label="Delete property"
                    onClick={() => deleteProperty(n)}
                  >
                    <Icon name="trash" />
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>

        <div className="db-add-prop">
          <input
            id="new-prop-name"
            type="text"
            placeholder="New property name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <select
            id="new-prop-type"
            className="select"
            value={newType}
            onChange={(e) => setNewType(e.target.value)}
          >
            {Object.keys(PROPERTY_TYPE_LABELS).map((t) => (
              <option value={t} key={t}>
                {PROPERTY_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
          {newType === "select" || newType === "multi_select" ? (
            <input
              id="new-prop-options"
              type="text"
              placeholder="Options, comma separated"
              value={newOptions}
              onChange={(e) => setNewOptions(e.target.value)}
            />
          ) : null}
          <button className="btn btn-primary" id="add-prop-btn" onClick={addProperty}>
            Add
          </button>
        </div>
      </div>
    </Dialog>
  );
}
