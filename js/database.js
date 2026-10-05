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
     Status colours

     A select value is mapped to one of a fixed set of palette tokens so the
     same status ("Done", "In Progress", ...) always gets the same colour on
     every view, board column, card, chip and roadmap bar. Unknown values fall
     back to a stable hash, so colours never change between renders.
     ============================================================ */
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

  /** The select column a board/roadmap groups by, if there is one. */
  function statusColumnOf(dataTable) {
    const props = dataTable.properties || {};
    return columns(dataTable).find((c) => (props[c] || {}).type === "select") || null;
  }

  function setStatusColor(el, value) {
    if (!value) return;
    el.dataset.color = value;
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
        // Rebuild the block from the latest server copy. Used after the editor
        // panel changes properties/name or when the table is deleted.
        const remount = () => {
          if (!block.dataTableId) return Promise.resolve();
          invalidate(block.dataTableId);
          return cached(block.dataTableId)
            .then((fresh) => {
              frame.textContent = "";
              renderFrame(frame, fresh, block, pageId, remount);
            })
            .catch((err) => ui.showToast(err.message, "error"));
        };
        frame.textContent = "";
        renderFrame(frame, dataTable, block, pageId, remount);
      })
      .catch((err) => {
        frame.textContent = "";
        frame.innerHTML =
          '<div class="db-empty"><p>' + ui.escapeHtml(err.message) + "</p></div>";
      });
  }

  function renderFrame(frame, dataTable, block, pageId, remount) {
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

    // The calendar/roadmap empty states and the toolbar both need a way back
    // into the editor panel.
    state.openSettings = () => openSettings(state, render, remount);

    render();
  }

  /* ---------- toolbar ---------- */
  function renderToolbar(toolbar, state, rerender) {
    const name = document.createElement("div");
    name.className = "db-name";
    name.textContent = state.dataTable.name || "Database";
    name.title = "Double-click to edit database";

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

    // Double-click anywhere on the toolbar (but not on a control) opens the
    // database's edit mode.
    toolbar.ondblclick = (e) => {
      if (e.target.closest("button, input, select, a, [contenteditable]")) return;
      state.openSettings();
    };
  }

  /* ============================================================
     Database edit mode (double-click)
     ============================================================ */
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

  function openSettings(state, rerender, remount) {
    const modal = ui.openModal({
      title: "Database settings",
      body: "",
      footer:
        '<button class="btn btn-danger" data-db-delete>' +
        ui.icon("trash") +
        " Delete database</button>" +
        '<span class="spacer"></span>' +
        '<button class="btn btn-secondary" data-modal-close>Close</button>',
    });
    const body = modal.querySelector(".modal-body");

    const save = (patch) => {
      store
        .updateDataTable(state.dataTable._id, patch)
        .then((saved) => {
          state.dataTable = saved;
          invalidate(saved._id);
          ui.showToast("Database updated", "success");
          refresh();
          if (remount) remount();
        })
        .catch((err) => ui.showToast(err.message, "error"));
    };

    const refresh = () => {
      const props = state.dataTable.properties || {};
      const names = Object.keys(props);

      body.innerHTML =
        '<div class="db-settings">' +
        '<div class="field"><label for="db-name-input">Name</label>' +
        '<input id="db-name-input" type="text" maxlength="200" value="' +
        ui.escapeHtml(state.dataTable.name || "") +
        '" /></div>' +
        '<div class="db-settings-section-title">Properties</div>' +
        '<div class="db-props">' +
        names
          .map((n) => {
            const p = props[n];
            const deletable = names.length > 1;
            return (
              '<div class="db-prop-row"><span class="db-prop-name">' +
              ui.escapeHtml(n) +
              '</span><span class="db-prop-type">' +
              ui.escapeHtml(PROPERTY_TYPE_LABELS[p.type] || p.type) +
              "</span>" +
              (deletable
                ? '<button class="db-icon-btn db-prop-delete" data-prop="' +
                  ui.escapeHtml(n) +
                  '" aria-label="Delete property">' +
                  ui.icon("trash") +
                  "</button>"
                : "") +
              "</div>"
            );
          })
          .join("") +
        "</div>" +
        '<div class="db-add-prop">' +
        '<input id="new-prop-name" type="text" placeholder="New property name" />' +
        '<select id="new-prop-type" class="select">' +
        Object.keys(PROPERTY_TYPE_LABELS)
          .map(
            (t) =>
              '<option value="' +
              t +
              '"' +
              (t === "text" ? " selected" : "") +
              ">" +
              PROPERTY_TYPE_LABELS[t] +
              "</option>"
          )
          .join("") +
        "</select>" +
        '<input id="new-prop-options" type="text" placeholder="Options, comma separated" style="display:none" />' +
        '<button class="btn btn-primary" id="add-prop-btn">Add</button>' +
        "</div></div>";

      const nameInput = body.querySelector("#db-name-input");
      nameInput.addEventListener("change", () => {
        const name = nameInput.value.trim();
        if (!name || name === state.dataTable.name) {
          nameInput.value = state.dataTable.name || "";
          return;
        }
        save({ name: name });
      });

      const typeSelect = body.querySelector("#new-prop-type");
      const optionsInput = body.querySelector("#new-prop-options");
      typeSelect.addEventListener("change", () => {
        const needs =
          typeSelect.value === "select" || typeSelect.value === "multi_select";
        optionsInput.style.display = needs ? "" : "none";
      });

      body.querySelector("#add-prop-btn").addEventListener("click", () => {
        const name = body.querySelector("#new-prop-name").value.trim();
        if (!name) {
          ui.showToast("Enter a property name", "error");
          return;
        }
        if (
          props[name] ||
          (state.dataTable.properties || {})[name]
        ) {
          ui.showToast("A property with that name already exists", "error");
          return;
        }
        const type = typeSelect.value;
        const def = { type: type };
        if (type === "select" || type === "multi_select") {
          const opts = optionsInput.value
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          def.options = opts.length ? opts : ["Option 1", "Option 2", "Option 3"];
        }
        const next = Object.assign({}, state.dataTable.properties);
        next[name] = def;
        save({ properties: next });
      });

      body.querySelectorAll(".db-prop-delete").forEach((b) => {
        b.addEventListener("click", () => {
          const key = b.dataset.prop;
          ui.confirmDialog({
            title: "Delete property?",
            message:
              'Delete <span class="confirm-name">' +
              ui.escapeHtml(key) +
              "</span> and its values in every row? This cannot be undone.",
            confirmLabel: "Delete property",
            danger: true,
          }).then((ok) => {
            if (!ok) return;
            const next = Object.assign({}, state.dataTable.properties);
            delete next[key];
            const rows = (state.dataTable.rows || []).map((r) => {
              const copy = Object.assign({}, r);
              delete copy[key];
              return copy;
            });
            save({ properties: next, rows: rows });
          });
        });
      });
    };

    modal.querySelector("[data-db-delete]").addEventListener("click", () => {
      ui.confirmDialog({
        title: "Delete database?",
        message:
          'This removes <span class="confirm-name">' +
          ui.escapeHtml(state.dataTable.name || "this database") +
          "</span> and all of its rows from the page. This cannot be undone.",
        confirmLabel: "Delete database",
        danger: true,
      }).then((ok) => {
        if (!ok) return;
        const id = state.dataTable._id;
        store
          .deleteDataTable(id)
          .then(() => {
            // Remove the block too, otherwise the empty editor would instantly
            // create a brand-new table in its place.
            store.removeBlock(state.pageId, state.block.id);
            invalidate(id);
            ui.closeModal();
            ui.showToast("Database deleted", "info");
            if (window.Lumen.editor && window.Lumen.editor.renderBlocks) {
              window.Lumen.editor.renderBlocks();
            }
          })
          .catch((err) => ui.showToast(err.message, "error"));
      });
    });

    refresh();
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
    return store
      .addDataTableRow(state.dataTable._id, values)
      .then((row) => {
        state.dataTable.rows.push(row);
        rerender();
        return row;
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
      setStatusColor(column, statusColor(option));

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
        setStatusColor(card, statusColor(option));
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
        "<p>This database has no date property, so there is nothing to lay out on a calendar.</p>" +
        '<button class="btn btn-secondary btn-sm" data-db-settings>Add a date property</button></div>';
      body
        .querySelector("[data-db-settings]")
        .addEventListener("click", () => state.openSettings());
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
    const todayKey = dayKey(new Date());

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
      if (key === todayKey) cell.classList.add("is-today");
      cell.dataset.date = key;
      const number = document.createElement("div");
      number.className = "db-cal-num";
      number.textContent = day;
      cell.appendChild(number);

      // Notion-style per-day "+" that appears on hover, so a plain click on the
      // cell never creates a row by accident.
      const addDay = document.createElement("button");
      addDay.className = "db-cal-add-day";
      addDay.type = "button";
      addDay.setAttribute("aria-label", "Add row on this day");
      addDay.innerHTML = ui.icon("plus");
      addDay.addEventListener("click", (e) => {
        e.stopPropagation();
        addRow(state, rerender, { [dateCol]: key }).then((row) => {
          if (row) openRowDialog(state, row, rerender);
        });
      });
      cell.appendChild(addDay);

      // Dropping a chip here reschedules the row to this day.
      cell.addEventListener("dragover", (e) => {
        if (!e.dataTransfer.types.includes("text/plain")) return;
        e.preventDefault();
        cell.classList.add("is-over");
      });
      cell.addEventListener("dragleave", () => cell.classList.remove("is-over"));
      cell.addEventListener("drop", (e) => {
        e.preventDefault();
        cell.classList.remove("is-over");
        const rowId = e.dataTransfer.getData("text/plain");
        if (rowId) setCell(state, rowId, dateCol, key, rerender);
      });

      (state.dataTable.rows || [])
        .filter((r) => {
          const d = toDate(r[dateCol]);
          return d && dayKey(d) === key;
        })
        .forEach((row) => {
          const chip = document.createElement("div");
          chip.className = "db-cal-chip";
          chip.textContent = cellText(row[primary]) || "Untitled";
          chip.title = "Click to edit \u00b7 drag to reschedule";
          chip.draggable = true;
          chip.dataset.id = row.id;
          setStatusColor(chip, statusColor(row[groupCol]));
          chip.addEventListener("dragstart", (e) => {
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", row.id);
            chip.classList.add("is-dragging");
          });
          chip.addEventListener("dragend", () => chip.classList.remove("is-dragging"));
          chip.addEventListener("click", () => openRowDialog(state, row, rerender));
          cell.appendChild(chip);
        });

      grid.appendChild(cell);
    }

    body.appendChild(grid);

    const add = document.createElement("button");
    add.className = "btn btn-ghost btn-sm db-cal-add";
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
  /** Whole months between two dates (positive when to > from). */
  function monthDiff(from, to) {
    return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  }

  function renderRoadmap(body, state, rerender) {
    const props = state.dataTable.properties || {};
    const dateCols = columns(state.dataTable).filter((c) => (props[c] || {}).type === "date");

    if (!dateCols.length) {
      body.innerHTML =
        '<div class="db-empty">' +
        ui.icon("zap") +
        "<p>This database has no date property, so there is nothing to lay out on a roadmap.</p>" +
        '<button class="btn btn-secondary btn-sm" data-db-settings>Add a date property</button></div>';
      body
        .querySelector("[data-db-settings]")
        .addEventListener("click", () => state.openSettings());
      return;
    }

    // Prefer a start-ish column, and pair it with an end-ish column so an item
    // can span a date range like it does in Notion.
    const dateCol =
      dateCols.find((c) => /start|begin|from/i.test(c)) || dateCols[0];
    const endCol =
      dateCols.find((c) => c !== dateCol && /end|due|finish|until|complete|to$/i.test(c)) ||
      dateCols.find((c) => c !== dateCol) ||
      null;

    const groupCol = groupColumn(state.dataTable);
    const statusCol = statusColumnOf(state.dataTable);
    const primary = titleColumn(state.dataTable);
    const options = optionsFor(state.dataTable, groupCol);

    const dated = (state.dataTable.rows || []).filter((r) => toDate(r[dateCol]));
    if (!dated.length) {
      body.innerHTML =
        '<div class="db-empty">' +
        ui.icon("zap") +
        "<p>Add a date to at least one row and the roadmap will lay them out on a timeline.</p>" +
        '<button class="btn btn-secondary btn-sm" data-db-settings>Add a date property</button></div>';
      body
        .querySelector("[data-db-settings]")
        .addEventListener("click", () => state.openSettings());
      return;
    }

    const times = [];
    dated.forEach((r) => {
      times.push(toDate(r[dateCol]).getTime());
      if (endCol && toDate(r[endCol])) times.push(toDate(r[endCol]).getTime());
    });
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
    const monthWidth = 132; // must match grid-auto-columns in database.css

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
      // One slot per month. (`months` above is a DOM element, not the array —
      // iterate `buckets` here.)
      buckets.forEach(() => {
        const slot = document.createElement("div");
        slot.className = "db-roadmap-slot";
        track.appendChild(slot);
      });

      rows.forEach((r) => {
        const start = toDate(r[dateCol]);
        const end = endCol ? toDate(r[endCol]) : null;
        const offset = Math.max(0, monthDiff(spanStart, start));
        let span = 1;
        if (end && end > start) span = Math.max(1, monthDiff(start, end) + 1);

        const bar = document.createElement("div");
        bar.className = "db-roadmap-bar";
        bar.draggable = true;
        bar.dataset.id = r.id;
        setStatusColor(bar, statusColor(r[statusCol]));
        bar.style.gridColumn = Math.max(1, offset + 1) + " / span " + span;
        bar.textContent = cellText(r[primary]) || "Untitled";
        bar.title =
          cellText(r[primary]) +
          " \u2014 " +
          dayKey(start) +
          (end && end > start ? " \u2192 " + dayKey(end) : "");
        bar.addEventListener("dragstart", (e) => {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", r.id);
          bar.classList.add("is-dragging");
        });
        bar.addEventListener("dragend", () => bar.classList.remove("is-dragging"));
        bar.addEventListener("click", () => openRowDialog(state, r, rerender));
        track.appendChild(bar);
      });

      // Dropping a bar onto a month moves its start date to that month.
      track.addEventListener("dragover", (e) => {
        if (!e.dataTransfer.types.includes("text/plain")) return;
        e.preventDefault();
        track.classList.add("is-over");
      });
      track.addEventListener("dragleave", () => track.classList.remove("is-over"));
      track.addEventListener("drop", (e) => {
        e.preventDefault();
        track.classList.remove("is-over");
        const rowId = e.dataTransfer.getData("text/plain");
        const item = (state.dataTable.rows || []).find((x) => String(x.id) === String(rowId));
        if (!item) return;
        const rect = track.getBoundingClientRect();
        const width = monthWidth * buckets.length || rect.width;
        const col = Math.max(0, Math.min(buckets.length - 1, Math.floor((e.clientX - rect.left) / (width / buckets.length))));
        const original = toDate(item[dateCol]);
        const targetDay = original ? original.getDate() : 1;
        const targetMonth = new Date(spanStart.getFullYear(), spanStart.getMonth() + col, 1);
        const lastDay = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0).getDate();
        const next = new Date(targetMonth.getFullYear(), targetMonth.getMonth(), Math.min(targetDay, lastDay));
        setCell(state, rowId, dateCol, dayKey(next), rerender);
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
        (endCol ? " \u00b7 bars span " + ui.escapeHtml(dateCol) + " to " + ui.escapeHtml(endCol) : "") +
        " \u00b7 drag a bar to reschedule it.</p>"
    );
  }

  window.Lumen = window.Lumen || {};
  window.Lumen.database = { mount, invalidate, VIEWS };
})();
