/* ============================================================
   Lumen — database block.

   A block of type "database" is a thin pointer to a document in the
   `dataTable` collection. The table, board, calendar and roadmap below are
   four renderings of the same rows — switching view never moves or copies
   anything, because there is only one copy.
   ============================================================ */

(function () {
  "use strict";

  const { store, ui } = window.Lumen;

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

  /* Re-rendering the editor re-mounts every database block, so without a cache
     that becomes one GET per table per re-render. Writes below invalidate the
     entry straight away, and the TTL bounds staleness from a second tab. */
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

  /** The select column a board groups by. */
  function groupColumn(dataTable) {
    const props = dataTable.properties || {};
    const names = columns(dataTable);
    const named = names.find((c) => props[c].type === "select" && /status|stage|state/i.test(c));
    return named || columnOfType(dataTable, "select") || titleColumn(dataTable);
  }

  function optionsFor(dataTable, column) {
    const spec = (dataTable.properties || {})[column];
    if (spec && Array.isArray(spec.options) && spec.options.length) return spec.options;
    // No declared options: derive them from the rows that exist.
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

  /* ============================================================
     Mount
     ============================================================ */
  /**
   * Render a database block into `host`.
   * @param {HTMLElement} host
   * @param {object} opts { block, pageId }
   */
  function mount(host, opts) {
    const block = opts.block;
    const pageId = opts.pageId;
    const spec = block.database || { name: "New database" };

    host.textContent = "";

    const frame = document.createElement("div");
    frame.className = "db";
    const status = document.createElement("div");
    status.className = "db-status";
    status.textContent = "Loading\u2026";
    frame.appendChild(status);
    host.appendChild(frame);

    // A block created from a template carries its definition but has no server
    // document yet. Create it on first view, then remember the id.
    const existingId = block.dataTableId;

    const ensureDataTable = existingId
      ? cached(existingId)
      : store
          .createDataTable(pageId, {
            name: spec.name || "New database",
            description: spec.description || "",
            properties: spec.properties,
            rows: spec.rows,
            defaultView: spec.defaultView || "table",
          })
          .then((created) => {
            // Point the block at the table so a reload doesn't create a second one.
            store.updateBlock(pageId, block.id, { dataTableId: created._id });
            return created;
          });

    ensureDataTable
      .then((dataTable) => {
        frame.textContent = "";
        renderFrame(frame, dataTable, block, pageId);
      })
      .catch((err) => {
        frame.textContent = "";
        frame.innerHTML =
          '<div class="db-empty"><p>' + ui.escapeHtml(err.message) + "</p></div>";
      });
  }

  function renderFrame(frame, dataTable, block, pageId) {
    const state = {
      dataTable: dataTable,
      block: block,
      pageId: pageId,
      view: VIEWS.some((v) => v.id === dataTable.defaultView) ? dataTable.defaultView : "table",
      // calendar / roadmap cursor
      cursor: new Date(),
      monthCursor: new Date(),
    };

    const toolbar = document.createElement("div");
    toolbar.className = "db-toolbar";
    const body = document.createElement("div");
    body.className = "db-body";
    frame.append(toolbar, body);

    const render = () => {
      renderToolbar(toolbar, state, render);
      body.textContent = "";
      if (state.view === "table") renderTable(body, state, render);
      else if (state.view === "board") renderBoard(body, state, render);
      else if (state.view === "calendar") renderCalendar(body, state, render);
      else renderRoadmap(body, state, render);
    };

    render();
  }

  /* ---------- toolbar ---------- */
  function renderToolbar(toolbar, state, rerender) {
    const name = document.createElement("div");
    name.className = "db-name";
    name.textContent = state.dataTable.name || "Database";

    const count = document.createElement("span");
    count.className = "db-count";
    count.textContent = (state.dataTable.rows || []).length + " rows";

    const tabs = document.createElement("div");
    tabs.className = "db-tabs";
    VIEWS.forEach((v) => {
      const btn = document.createElement("button");
      btn.className = "db-tab";
      btn.dataset.active = String(state.view === v.id);
      btn.textContent = v.label;
      btn.addEventListener("click", () => {
        state.view = v.id;
        // Remember the choice on the document so it is there next time.
        state.dataTable.defaultView = v.id;
        rerender();
        store
          .updateDataTable(state.dataTable._id, { defaultView: v.id })
          .then((saved) => {
            state.dataTable = saved;
          })
          .catch((err) => ui.showToast(err.message, "error"));
      });
      tabs.appendChild(btn);
    });

    toolbar.textContent = "";
    toolbar.append(name, count, tabs);
  }

  /* ---------- shared write helper ---------- */
  function setCell(state, rowId, column, value, rerender) {
    const row = (state.dataTable.rows || []).find((r) => r.id === rowId);
    if (!row) return;
    row[column] = value; // optimistic
    rerender();
    store
      .updateDataTableRow(state.dataTable._id, rowId, { [column]: value })
      .then((saved) => Object.assign(row, saved))
      .catch((err) => {
        // The optimistic write is wrong and the cached copy is wrong with it,
        // so drop the entry and let the next mount read the real row back.
        invalidate(state.dataTable._id);
        ui.showToast(err.message, "error");
        rerender();
      });
  }

  function addRow(state, rerender, extra) {
    const values = Object.assign({}, extra || {});
    columns(state.dataTable).forEach((c) => {
      const type = state.dataTable.properties[c].type;
      if (type === "checkbox" && values[c] === undefined) values[c] = false;
    });
    store
      .addDataTableRow(state.dataTable._id, values)
      .then((row) => {
        state.dataTable.rows.push(row);
        rerender();
      })
      .catch((err) => {
        invalidate(state.dataTable._id);
        ui.showToast(err.message, "error");
      });
  }

  function deleteRow(state, rowId, rerender) {
    state.dataTable.rows = state.dataTable.rows.filter((r) => r.id !== rowId);
    rerender();
    store.deleteDataTableRow(state.dataTable._id, rowId).catch((err) => {
      invalidate(state.dataTable._id);
      ui.showToast(err.message, "error");
      rerender();
    });
  }

  /* ---------- cell editors ---------- */
  function makeCell(state, rerender, row, column) {
    const spec = state.dataTable.properties[column] || { type: "text" };
    const wrap = document.createElement("div");
    wrap.className = "db-cell";

    if (spec.type === "checkbox") {
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = !!row[column];
      input.addEventListener("change", () =>
        setCell(state, row.id, column, input.checked, rerender)
      );
      wrap.appendChild(input);
      return wrap;
    }

    if (spec.type === "select" || spec.type === "multi_select") {
      if (spec.type === "multi_select") {
        const sel = document.createElement("select");
        sel.className = "db-select";
        const options = spec.options || [];
        sel.innerHTML =
          '<option value=""></option>' +
          options.map((o) => '<option value="' + ui.escapeHtml(o) + '">' + ui.escapeHtml(o) + "</option>").join("");
        const current = Array.isArray(row[column]) ? row[column][0] || "" : cellText(row[column]);
        sel.value = current;
        sel.addEventListener("change", () => setCell(state, row.id, column, sel.value || null, rerender));
        wrap.appendChild(sel);
        return wrap;
      }
      const sel = document.createElement("select");
      sel.className = "db-select";
      const options = spec.options || [];
      sel.innerHTML =
        '<option value=""></option>' +
        options
          .map((o) => '<option value="' + ui.escapeHtml(o) + '">' + ui.escapeHtml(o) + "</option>")
          .join("");
      sel.value = cellText(row[column]);
      sel.addEventListener("change", () => setCell(state, row.id, column, sel.value || null, rerender));
      wrap.appendChild(sel);
      return wrap;
    }

    if (spec.type === "date") {
      const input = document.createElement("input");
      input.type = "date";
      input.className = "db-date";
      const d = toDate(row[column]);
      input.value = d ? dayKey(d) : "";
      input.addEventListener("change", () =>
        setCell(state, row.id, column, input.value || null, rerender)
      );
      wrap.appendChild(input);
      return wrap;
    }

    const input = document.createElement("input");
    input.className = "db-input";
    input.type = spec.type === "number" ? "number" : spec.type === "url" || spec.type === "email" ? spec.type : "text";
    input.value = cellText(row[column]);
    input.placeholder = spec.type === "title" ? "Untitled" : "\u2014";
    if (spec.type === "number") input.addEventListener("change", () => setCell(state, row.id, column, input.value === "" ? null : Number(input.value), rerender));
    else input.addEventListener("change", () => setCell(state, row.id, column, input.value, rerender));
    wrap.appendChild(input);
    return wrap;
  }

  /* ============================================================
     Table view
     ============================================================ */
  function renderTable(body, state, rerender) {
    const cols = columns(state.dataTable);
    if (!cols.length) {
      body.innerHTML = '<div class="db-empty"><p>This database has no columns.</p></div>';
      return;
    }
    const primary = titleColumn(state.dataTable);

    const wrap = document.createElement("div");
    wrap.className = "db-table-wrap";
    const table = document.createElement("table");
    table.className = "db-table";

    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    cols.forEach((c) => {
      const th = document.createElement("th");
      th.textContent = c;
      if (c === primary) th.className = "db-col-primary";
      headRow.appendChild(th);
    });
    headRow.appendChild(document.createElement("th"));
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    (state.dataTable.rows || []).forEach((row) => {
      const tr = document.createElement("tr");
      tr.dataset.id = row.id;
      cols.forEach((c) => {
        const td = document.createElement("td");
        if (c === primary) td.className = "db-col-primary";
        td.appendChild(makeCell(state, rerender, row, c));
        tr.appendChild(td);
      });
      const actions = document.createElement("td");
      actions.className = "db-row-actions";
      actions.appendChild(deleteButton(state, row, rerender));
      tr.appendChild(actions);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    body.appendChild(wrap);

    const footer = document.createElement("div");
    footer.className = "db-footer";
    const addBtn = document.createElement("button");
    addBtn.className = "btn btn-ghost btn-sm";
    addBtn.textContent = "+ New row";
    addBtn.addEventListener("click", () => addRow(state, rerender));
    footer.appendChild(addBtn);
    body.appendChild(footer);
  }

  function deleteButton(state, row, rerender) {
    const btn = document.createElement("button");
    btn.className = "db-icon-btn";
    btn.setAttribute("aria-label", "Delete row");
    btn.innerHTML = ui.icon("trash");
    btn.addEventListener("click", () => {
      ui.confirmDialog({
        title: "Delete row?",
        message: "This removes the row from every view of this database.",
        confirmLabel: "Delete",
        danger: true,
      }).then((ok) => {
        if (ok) deleteRow(state, row.id, rerender);
      });
    });
    return btn;
  }

  /* ============================================================
     Board view
     ============================================================ */
  function renderBoard(body, state, rerender) {
    const group = groupColumn(state.dataTable);
    const options = optionsFor(state.dataTable, group);
    const primary = titleColumn(state.dataTable);

    const board = document.createElement("div");
    board.className = "db-board";

    options.forEach((option) => {
      const column = document.createElement("div");
      column.className = "db-board-col";
      column.dataset.group = option;

      const rows = (state.dataTable.rows || []).filter(
        (r) => cellText(r[group]) === option
      );

      const head = document.createElement("div");
      head.className = "db-board-head";
      head.innerHTML =
        '<span class="db-board-title">' + ui.escapeHtml(option) + "</span>" +
        '<span class="db-board-count">' + rows.length + "</span>";
      column.appendChild(head);

      const list = document.createElement("div");
      list.className = "db-board-list";
      rows.forEach((row) => {
        const card = document.createElement("div");
        card.className = "db-card";
        card.draggable = true;
        card.dataset.id = row.id;
        card.appendChild(makeCell(state, rerender, row, primary));
        card.appendChild(miniMeta(state, row, group));
        card.appendChild(deleteButton(state, row, rerender));

        card.addEventListener("dragstart", (e) => {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", row.id);
          card.classList.add("is-dragging");
        });
        card.addEventListener("dragend", () => card.classList.remove("is-dragging"));
        list.appendChild(card);
      });

      // Dropping a card here sets the group column to this option.
      column.addEventListener("dragover", (e) => {
        if (!e.dataTransfer.types.includes("text/plain")) return;
        e.preventDefault();
        column.classList.add("is-over");
      });
      column.addEventListener("dragleave", () => column.classList.remove("is-over"));
      column.addEventListener("drop", (e) => {
        e.preventDefault();
        column.classList.remove("is-over");
        const rowId = e.dataTransfer.getData("text/plain");
        if (rowId) setCell(state, rowId, group, option, rerender);
      });

      column.appendChild(list);

      const add = document.createElement("button");
      add.className = "db-board-add";
      add.textContent = "+ Add";
      add.addEventListener("click", () => {
        const values = {};
        values[group] = option;
        addRow(state, rerender, values);
      });
      column.appendChild(add);

      board.appendChild(column);
    });

    body.appendChild(board);
  }

  /** Two or three secondary fields shown on a card. */
  function miniMeta(state, row, skip) {
    const meta = document.createElement("div");
    meta.className = "db-card-meta";
    columns(state.dataTable)
      .filter((c) => c !== skip && c !== titleColumn(state.dataTable))
      .slice(0, 3)
      .forEach((c) => {
        const spec = state.dataTable.properties[c];
        const raw = row[c];
        if (raw === null || raw === undefined || raw === "") return;
        const pill = document.createElement("span");
        pill.className = "db-pill db-pill-" + (spec.type === "date" ? "date" : spec.type === "checkbox" ? "check" : "text");
        pill.textContent = spec.type === "checkbox" ? "\u2713" : cellText(raw);
        meta.appendChild(pill);
      });
    return meta;
  }

  /* ============================================================
     Calendar view
     ============================================================ */
  function renderCalendar(body, state, rerender) {
    const dateCol = columnOfType(state.dataTable, "date");
    if (!dateCol) {
      body.innerHTML =
        '<div class="db-empty">' +
        ui.icon("clock") +
        "<p>This database has no date column, so there is nothing to lay out on a calendar.</p>" +        "</div>";
      return;
    }

    const cursor = state.monthCursor;
    const year = cursor.getFullYear();
    const month = cursor.getMonth();

    const head = document.createElement("div");
    head.className = "db-cal-head";
    const prev = document.createElement("button");
    prev.className = "db-icon-btn";
    prev.innerHTML = ui.icon("chevron-left");
    prev.setAttribute("aria-label", "Previous month");
    prev.addEventListener("click", () => {
      state.monthCursor = new Date(year, month - 1, 1);
      rerender();
    });
    const label = document.createElement("span");
    label.className = "db-cal-label";
    label.textContent = MONTHS[month] + " " + year;
    const next = document.createElement("button");
    next.className = "db-icon-btn";
    next.innerHTML = ui.icon("chevron-right");
    next.setAttribute("aria-label", "Next month");
    next.addEventListener("click", () => {
      state.monthCursor = new Date(year, month + 1, 1);
      rerender();
    });
    head.append(prev, label, next);
    body.appendChild(head);

    const grid = document.createElement("div");
    grid.className = "db-cal";

    ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].forEach((d) => {
      const cell = document.createElement("div");
      cell.className = "db-cal-dow";
      cell.textContent = d;
      grid.appendChild(cell);
    });

    const first = new Date(year, month, 1);
    const lead = (first.getDay() + 6) % 7; // Monday-first
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const primary = titleColumn(state.dataTable);
    const groupCol = groupColumn(state.dataTable);

    for (let i = 0; i < lead; i += 1) {
      const blank = document.createElement("div");
      blank.className = "db-cal-day is-empty";
      grid.appendChild(blank);
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = new Date(year, month, day);
      const key = dayKey(date);
      const cell = document.createElement("div");
      cell.className = "db-cal-day";
      const number = document.createElement("div");
      number.className = "db-cal-num";
      number.textContent = day;
      cell.appendChild(number);

      (state.dataTable.rows || [])
        .filter((r) => {
          const d = toDate(r[dateCol]);
          return d && dayKey(d) === key;
        })
        .forEach((row) => {
          const chip = document.createElement("div");
          chip.className = "db-cal-chip";
          chip.textContent = cellText(row[primary]) || "Untitled";
          const group = cellText(row[groupCol]);
          if (group) {
            chip.dataset.group = group.toLowerCase().replace(/[^a-z0-9]+/g, "-");
          }
          chip.addEventListener("click", () => openRowDialog(state, row, rerender));
          cell.appendChild(chip);
        });

      grid.appendChild(cell);
    }

    body.appendChild(grid);

    const add = document.createElement("button");
    add.className = "btn btn-ghost btn-sm";
    add.textContent = "+ New row";
    add.addEventListener("click", () => addRow(state, rerender));
    body.appendChild(add);
  }

  /* ---------- row dialog (used by calendar) ---------- */
  function openRowDialog(state, row, rerender) {
    const cols = columns(state.dataTable);
    const modal = ui.openModal({
      title: cellText(row[titleColumn(state.dataTable)]) || "Row",
      size: "modal-sm",
      body:
        '<div class="db-dialog">' +
        cols
          .map((c) => '<div class="field"><label>' + ui.escapeHtml(c) + "</label>" + cellInputHtml(state, row, c) + "</div>")
          .join("") +
        "</div>",
      footer:
        '<button class="btn btn-danger" data-row-delete>Delete</button>' +
        '<button class="btn btn-primary" data-modal-close>Done</button>',
    });

    modal.querySelectorAll("[data-col]").forEach((input) => {
      const c = input.dataset.col;
      input.addEventListener("change", () => {
        const value =
          state.dataTable.properties[c].type === "checkbox"
            ? input.checked
            : state.dataTable.properties[c].type === "number"
              ? input.value === "" ? null : Number(input.value)
              : input.value === "" && state.dataTable.properties[c].type === "select"
                ? null
                : input.value;
        setCell(state, row.id, c, value, rerender);
      });
    });
    modal.querySelector("[data-row-delete]").addEventListener("click", () => {
      ui.closeModal();
      deleteRow(state, row.id, rerender);
    });
  }

  function cellInputHtml(state, row, column) {
    const spec = state.dataTable.properties[column] || { type: "text" };
    const value = row[column];
    if (spec.type === "checkbox") {
      return (
        '<input type="checkbox" data-col="' + ui.escapeHtml(column) + '" ' +
        (value ? "checked" : "") + " />"
      );
    }
    if (spec.type === "select" || spec.type === "multi_select") {
      const options = spec.options || [];
      return (
        '<select class="select" data-col="' + ui.escapeHtml(column) + '">' +
        '<option value=""></option>' +
        options
          .map(
            (o) =>
              '<option value="' + ui.escapeHtml(o) + '"' +
              (o === cellText(value) ? " selected" : "") + ">" + ui.escapeHtml(o) + "</option>"
          )
          .join("") +
        "</select>"
      );
    }
    if (spec.type === "date") {
      const d = toDate(value);
      return '<input type="date" data-col="' + ui.escapeHtml(column) + '" value="' + (d ? dayKey(d) : "") + '" />';
    }
    return (
      '<input type="' + (spec.type === "number" ? "number" : "text") + '" data-col="' +
      ui.escapeHtml(column) + '" value="' + ui.escapeHtml(cellText(value)) + '" />'
    );
  }

  /* ============================================================
     Roadmap view
     ============================================================ */
  function renderRoadmap(body, state, rerender) {
    const groupCol = groupColumn(state.dataTable);
    const dateCol = columnOfType(state.dataTable, "date");
    const primary = titleColumn(state.dataTable);
    const options = optionsFor(state.dataTable, groupCol);

    const dated = (state.dataTable.rows || []).filter((r) => dateCol && toDate(r[dateCol]));
    if (!dated.length) {
      body.innerHTML =
        '<div class="db-empty">' +
        ui.icon("zap") +
        "<p>Add a date to at least one row and the roadmap will lay them out on a timeline.</p>" +
        "</div>";
      return;
    }

    const times = dated.map((r) => toDate(r[dateCol]).getTime());
    const min = new Date(Math.min.apply(null, times));
    const max = new Date(Math.max.apply(null, times));

    // Bucket the timeline into months so the header reads like a real roadmap.
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

    const grid = document.createElement("div");
    grid.className = "db-roadmap";

    const head = document.createElement("div");
    head.className = "db-roadmap-head";
    const corner = document.createElement("div");
    corner.className = "db-roadmap-corner";
    head.appendChild(corner);
    const months = document.createElement("div");
    months.className = "db-roadmap-months";
    buckets.forEach((b) => {
      const cell = document.createElement("div");
      cell.className = "db-roadmap-month";
      cell.textContent = MONTHS[b.getMonth()].slice(0, 3) + " " + String(b.getFullYear()).slice(2);
      months.appendChild(cell);
    });
    head.appendChild(months);
    grid.appendChild(head);

    options.forEach((option) => {
      const rows = dated.filter((r) => cellText(r[groupCol]) === option);
      if (!rows.length) return;

      const row = document.createElement("div");
      row.className = "db-roadmap-row";

      const label = document.createElement("div");
      label.className = "db-roadmap-label";
      label.textContent = option;
      row.appendChild(label);

      const track = document.createElement("div");
      track.className = "db-roadmap-track";
      months.forEach(() => {
        const slot = document.createElement("div");
        slot.className = "db-roadmap-slot";
        track.appendChild(slot);
      });

      rows.forEach((r) => {
        const date = toDate(r[dateCol]);
        const offset = (date.getFullYear() - spanStart.getFullYear()) * 12 + (date.getMonth() - spanStart.getMonth());
        const bar = document.createElement("div");
        bar.className = "db-roadmap-bar";
        bar.style.gridColumn = Math.max(1, offset + 1) + " / span 1";
        bar.textContent = cellText(r[primary]) || "Untitled";
        bar.title = cellText(r[primary]) + " \u2014 " + dayKey(date);
        bar.addEventListener("click", () => openRowDialog(state, r, rerender));
        track.appendChild(bar);
      });

      row.appendChild(track);
      grid.appendChild(row);
    });

    body.appendChild(grid);
    body.insertAdjacentHTML(
      "beforeend",
      '<p class="db-note">Timeline spans ' +
        ui.escapeHtml(dayKey(spanStart)) +
        " \u2192 " +
        ui.escapeHtml(dayKey(spanEnd)) +
        ".</p>"
    );
  }

  window.Lumen = window.Lumen || {};
  window.Lumen.database = { mount, invalidate, VIEWS };
})();
