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

const VIEWS = [
  { id: "table", label: "Table" },
  { id: "board", label: "Board" },
  { id: "calendar", label: "Calendar" },
  { id: "roadmap", label: "Roadmap" },
];

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

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

/* ---------- column helpers ---------- */
function columns(dataTable) {
  return Object.keys(dataTable.properties || {});
}

function titleColumn(dataTable) {
  const props = dataTable.properties || {};
  const found = columns(dataTable).find((c) => props[c].type === "title");
  return found || columns(dataTable)[0] || "Name";
}

function columnOfType(dataTable, type) {
  const props = dataTable.properties || {};
  return columns(dataTable).find((c) => props[c].type === type) || null;
}

function groupColumn(dataTable) {
  const props = dataTable.properties || {};
  const names = columns(dataTable);
  const named = names.find(
    (c) => props[c].type === "select" && /status|stage|state/i.test(c)
  );
  return named || columnOfType(dataTable, "select") || titleColumn(dataTable);
}

function optionsFor(dataTable, column) {
  const spec = (dataTable.properties || {})[column];
  if (spec && Array.isArray(spec.options) && spec.options.length) {
    return spec.options;
  }
  const seen = [];
  (dataTable.rows || []).forEach((row) => {
    const value = row[column];
    if (value && seen.indexOf(value) === -1) seen.push(value);
  });
  return seen.length ? seen : ["None"];
}

function toDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

/** yyyy-mm-dd in local time (toISOString would shift the day). */
function dayKey(date) {
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return date.getFullYear() + "-" + m + "-" + d;
}

function cellText(value) {
  if (value === null || value === undefined || value === "") return "";
  if (Array.isArray(value)) return value.join(", ");
  if (value instanceof Date) return dayKey(value);
  return String(value);
}

/* ---------- status colours ---------- */
const STATUS_COLORS = ["", "blue", "green", "yellow", "red", "purple", "pink", "orange", "gray"];

const STATUS_KEYWORDS = [
  { re: /done|complete|shipped|finished|closed|resolved|success/i, color: "green" },
  { re: /in.?progress|doing|active|started|ongoing|current|review/i, color: "yellow" },
  { re: /todo|to.?do|backlog|not.?started|pending|open|new|plan/i, color: "gray" },
  { re: /block|stuck|hold|paused|fail|error|cancel|reject|overdue|urgent|critical/i, color: "red" },
  { re: /high|important/i, color: "orange" },
  { re: /medium|normal/i, color: "blue" },
  { re: /low|minor/i, color: "purple" },
];

function statusColor(value) {
  const v = cellText(value).trim();
  if (!v) return "";
  for (let i = 0; i < STATUS_KEYWORDS.length; i += 1) {
    if (STATUS_KEYWORDS[i].re.test(v)) return STATUS_KEYWORDS[i].color;
  }
  let hash = 0;
  for (let i = 0; i < v.length; i += 1) hash = (hash * 31 + v.charCodeAt(i)) >>> 0;
  return STATUS_COLORS[(hash % (STATUS_COLORS.length - 1)) + 1];
}

function statusColumnOf(dataTable) {
  const props = dataTable.properties || {};
  return columns(dataTable).find((c) => (props[c] || {}).type === "select") || null;
}

/* ---------- settings labels ---------- */
const PROPERTY_TYPE_LABELS = {
  title: "Title",
  text: "Text",
  number: "Number",
  select: "Select",
  multi_select: "Multi-select",
  checkbox: "Checkbox",
  date: "Date",
  url: "URL",
  email: "Email",
  person: "Person",
  relation: "Relation",
};

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
export default function Database({ block, pageId }) {
  const [, bump] = useReducer((v) => v + 1, 0);
  const dtRef = useRef(null);
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
        cache.set(dt._id, { dt, at: Date.now() });
        setView(VIEWS.some((v) => v.id === dt.defaultView) ? dt.defaultView : "table");
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

  /* ---------- row writes ---------- */
  const setCell = (id, column, value) => {
    const dt = dtRef.current;
    if (!dt) return;
    const row = (dt.rows || []).find((r) => r.id === id);
    if (!row) return;
    row[column] = value; // optimistic
    bump();
    store
      .updateDataTableRow(dt._id, id, { [column]: value })
      .then((saved) => Object.assign(row, saved))
      .catch((err) => {
        invalidate(dt._id);
        showToast(err.message, "error");
        bump();
      });
  };

  const addRow = (extra) => {
    const dt = dtRef.current;
    if (!dt) return Promise.resolve(null);
    const values = Object.assign({}, extra || {});
    columns(dt).forEach((c) => {
      const type = dt.properties[c].type;
      if (type === "checkbox" && values[c] === undefined) values[c] = false;
    });
    return store
      .addDataTableRow(dt._id, values)
      .then((row) => {
        dt.rows.push(row);
        cache.set(dt._id, { dt, at: Date.now() });
        bump();
        return row;
      })
      .catch((err) => {
        invalidate(dt._id);
        showToast(err.message, "error");
        return null;
      });
  };

  const deleteRow = (id) => {
    const dt = dtRef.current;
    if (!dt) return;
    dt.rows = dt.rows.filter((r) => r.id !== id);
    bump();
    store.deleteDataTableRow(dt._id, id).catch((err) => {
      invalidate(dt._id);
      showToast(err.message, "error");
      bump();
    });
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
            <RoadmapView
              dataTable={dataTable}
              setCell={setCell}
              openSettings={() => setSettingsOpen(true)}
              openRow={(row) => setRowId(row.id)}
            />
          )}
        </div>
      </>
    );
  }

  const dialogRow =
    dataTable && rowId
      ? (dataTable.rows || []).find((r) => r.id === rowId) || null
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
   Roadmap
   ============================================================ */
function monthDiff(from, to) {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
}

function RoadmapView({ dataTable, setCell, openSettings, openRow }) {
  const props = dataTable.properties || {};
  const dateCols = columns(dataTable).filter((c) => (props[c] || {}).type === "date");

  if (!dateCols.length) {
    return (
      <div className="db-empty">
        <Icon name="zap" />
        <p>This database has no date property, so there is nothing to lay out on a roadmap.</p>
        <button className="btn btn-secondary btn-sm" onClick={openSettings}>
          Add a date property
        </button>
      </div>
    );
  }

  const dateCol = dateCols.find((c) => /start|begin|from/i.test(c)) || dateCols[0];
  const endCol =
    dateCols.find(
      (c) => c !== dateCol && /end|due|finish|until|complete|to$/i.test(c)
    ) ||
    dateCols.find((c) => c !== dateCol) ||
    null;

  const groupCol = groupColumn(dataTable);
  const statusCol = statusColumnOf(dataTable);
  const primary = titleColumn(dataTable);
  const options = optionsFor(dataTable, groupCol);

  const dated = (dataTable.rows || []).filter((r) => toDate(r[dateCol]));
  if (!dated.length) {
    return (
      <div className="db-empty">
        <Icon name="zap" />
        <p>Add a date to at least one row and the roadmap will lay them out on a timeline.</p>
        <button className="btn btn-secondary btn-sm" onClick={openSettings}>
          Add a date property
        </button>
      </div>
    );
  }

  const times = [];
  dated.forEach((r) => {
    times.push(toDate(r[dateCol]).getTime());
    if (endCol && toDate(r[endCol])) times.push(toDate(r[endCol]).getTime());
  });
  const min = new Date(Math.min.apply(null, times));
  const max = new Date(Math.max.apply(null, times));

  const buckets = [];
  const cursor = new Date(min.getFullYear(), min.getMonth(), 1);
  const guard = 36;
  while (cursor <= max && buckets.length < guard) {
    buckets.push(new Date(cursor.getTime()));
    cursor.setMonth(cursor.getMonth() + 1);
  }
  const spanStart = buckets[0];
  const spanEnd = new Date(
    buckets[buckets.length - 1].getFullYear(),
    buckets[buckets.length - 1].getMonth() + 1,
    1
  );
  const monthWidth = 132; // keep in sync with database.css

  return (
    <>
      <div className="db-roadmap">
        <div className="db-roadmap-head">
          <div className="db-roadmap-corner"></div>
          <div className="db-roadmap-months">
            {buckets.map((b, i) => (
              <div className="db-roadmap-month" key={i}>
                {MONTHS[b.getMonth()].slice(0, 3) + " " + String(b.getFullYear()).slice(2)}
              </div>
            ))}
          </div>
        </div>

        {options.map((option) => {
          const rows = dated.filter((r) => cellText(r[groupCol]) === option);
          if (!rows.length) return null;
          return (
            <div className="db-roadmap-row" key={option}>
              <div className="db-roadmap-label">{option}</div>
              <div
                className="db-roadmap-track"
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
                  const item = (dataTable.rows || []).find(
                    (x) => String(x.id) === String(id)
                  );
                  if (!item) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const width = monthWidth * buckets.length || rect.width;
                  const col = Math.max(
                    0,
                    Math.min(
                      buckets.length - 1,
                      Math.floor(
                        (e.clientX - rect.left) / (width / buckets.length)
                      )
                    )
                  );
                  const original = toDate(item[dateCol]);
                  const targetDay = original ? original.getDate() : 1;
                  const targetMonth = new Date(
                    spanStart.getFullYear(),
                    spanStart.getMonth() + col,
                    1
                  );
                  const lastDay = new Date(
                    targetMonth.getFullYear(),
                    targetMonth.getMonth() + 1,
                    0
                  ).getDate();
                  const next = new Date(
                    targetMonth.getFullYear(),
                    targetMonth.getMonth(),
                    Math.min(targetDay, lastDay)
                  );
                  setCell(item.id, dateCol, dayKey(next));
                }}
              >
                {buckets.map((_, i) => (
                  <div className="db-roadmap-slot" key={"slot" + i} />
                ))}
                {rows.map((row) => {
                  const start = toDate(row[dateCol]);
                  const end = endCol ? toDate(row[endCol]) : null;
                  const offset = Math.max(0, monthDiff(spanStart, start));
                  let span = 1;
                  if (end && end > start) {
                    span = Math.max(1, monthDiff(start, end) + 1);
                  }
                  return (
                    <div
                      className="db-roadmap-bar"
                      key={row.id}
                      draggable="true"
                      data-id={row.id}
                      data-color={statusColor(row[statusCol])}
                      style={{ gridColumn: Math.max(1, offset + 1) + " / span " + span }}
                      title={
                        cellText(row[primary]) +
                        " \u2014 " +
                        dayKey(start) +
                        (end && end > start ? " \u2192 " + dayKey(end) : "")
                      }
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
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <p className="db-note">
        {"Timeline spans " + dayKey(spanStart) + " \u2192 " + dayKey(spanEnd)}
        {endCol ? " \u00b7 bars span " + dateCol + " to " + endCol : ""}
        {" \u00b7 drag a bar to reschedule it."}
      </p>
    </>
  );
}

/* ============================================================
   Row dialog
   ============================================================ */
function RowDialog({ dataTable, row, setCell, onDelete, onClose }) {
  const cols = columns(dataTable);
  const title = cellText(row[titleColumn(dataTable)]) || "Row";

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
