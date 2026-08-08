/* ============================================================
   Lumen — editor: page header, block rendering, block editing,
   slash command menu, block drag & drop, and the floating
   formatting toolbar.
   ============================================================ */

(function () {
  "use strict";

  const { store, ui } = window.Lumen;

  let pageId = null;
  let pageEl = null;
  let blocksEl = null;
  let titleEl = null;
  let iconBtn = null;
  let metaEl = null;
  let phantom = null;
  let slashMenuEl = null;
  let slashBlockId = null;
  let slashQuery = "";
  let slashIndex = 0;
  let draggingBlockId = null;

  const SLASH_ITEMS = [
    { type: "text", glyph: "T", label: "Text", desc: "Start writing with plain text" },
    { type: "heading1", glyph: "H1", label: "Heading 1", desc: "Big section heading" },
    { type: "heading2", glyph: "H2", label: "Heading 2", desc: "Medium section heading" },
    { type: "heading3", glyph: "H3", label: "Heading 3", desc: "Small section heading" },
    { type: "bulleted", glyph: "\u2022", label: "Bulleted list", desc: "Create a simple bulleted list" },
    { type: "numbered", glyph: "1.", label: "Numbered list", desc: "Create a list with numbering" },
    { type: "todo", glyph: "\u2611", label: "To-do list", desc: "Track tasks with checkboxes" },
    { type: "quote", glyph: "\u275D", label: "Quote", desc: "Capture a quote or highlight" },
    { type: "code", glyph: "</>", label: "Code", desc: "Capture a code snippet" },
    { type: "divider", glyph: "\u2014", label: "Divider", desc: "Visually divide blocks" },
    { type: "callout", glyph: "\uD83D\uDCA1", label: "Callout", desc: "Make writing stand out" },
    { type: "image", glyph: "\uD83D\uDDBC\uFE0F", label: "Image", desc: "Upload or embed an image" },
    { type: "table", glyph: "\u229E", label: "Table", desc: "Create a simple table" },
    { type: "toggle", glyph: "\u25B8", label: "Toggle", desc: "Collapsible content" },
  ];

  /* ============================================================
     Rendering
     ============================================================ */
  function render(page, opts) {
    pageId = page.id;
    opts = opts || {};

    pageEl = document.createElement("div");
    pageEl.className = "editor-page";
    pageEl.innerHTML =
      '<div class="page-header">' +
      '<button class="page-header-icon" data-page-icon aria-label="Change page icon">' +
      ui.escapeHtml(page.icon || "\uD83D\uDCDD") +
      "</button>" +
      '<div class="page-header-title" contenteditable="true" data-page-title role="textbox" aria-multiline="true"></div>' +
      '<div class="page-meta" data-page-meta></div>' +
      "</div>" +
      '<div class="editor-blocks" data-blocks></div>';

    iconBtn = pageEl.querySelector("[data-page-icon]");
    titleEl = pageEl.querySelector("[data-page-title]");
    metaEl = pageEl.querySelector("[data-page-meta]");
    blocksEl = pageEl.querySelector("[data-blocks]");

    // title
    titleEl.textContent = page.title || "";
    titleEl.dataset.placeholder = String(!page.title);
    titleEl.addEventListener("input", () => {
      const val = titleEl.textContent.replace(/\n/g, " ").trim();
      titleEl.dataset.placeholder = String(!val);
      store.updatePage(pageId, { title: val }, "rename");
    });

    // icon
    iconBtn.addEventListener("click", () => openIconPicker(iconBtn));

    renderBlocks();
    syncMeta(page);

    // click on the empty area below blocks → start a new block
    blocksEl.addEventListener("click", (e) => {
      if (e.target === blocksEl) {
        const b = store.addBlock(pageId, "text", "");
        renderBlocks();
        focusBlock(b.id, true);
      }
    });

    if (opts.focusTitle) {
      requestAnimationFrame(() => {
        titleEl.focus();
        placeCaretAtEnd(titleEl);
      });
    }

    return pageEl;
  }

  function syncMeta(page) {
    if (!metaEl || !page) return;
    const path = store
      .getPath(page.id)
      .map((p) => p.title || "Untitled")
      .join(" / ");
    metaEl.innerHTML =
      ui.escapeHtml(page.updatedAt || "") +
      '<span class="page-meta-sep">\u00B7</span>' +
      ui.escapeHtml(path);
    if (titleEl && document.activeElement !== titleEl) {
      titleEl.textContent = page.title || "";
      titleEl.dataset.placeholder = String(!page.title);
    }
    if (iconBtn && document.activeElement !== iconBtn) {
      iconBtn.textContent = page.icon || "\uD83D\uDCDD";
    }
  }

  /* ============================================================
     Blocks
     ============================================================ */
  function renderBlocks() {
    if (!blocksEl) return;
    const blocks = store.getPageBlocks(pageId);
    blocksEl.textContent = "";

    if (!blocks.length) {
      const hint = document.createElement("div");
      hint.className = "editor-empty-hint";
      hint.textContent = "Click to start writing \u2014 or type / for commands";
      hint.addEventListener("click", () => {
        const b = store.addBlock(pageId, "text", "");
        renderBlocks();
        focusBlock(b.id, true);
      });
      blocksEl.appendChild(hint);
      return;
    }

    let numberSeq = 0;
    blocks.forEach((block, i) => {
      const prev = blocks[i - 1];
      if (block.type === "numbered" && prev && prev.type === "numbered") {
        numberSeq++;
      } else {
        numberSeq = block.type === "numbered" ? 1 : 0;
      }
      blocksEl.appendChild(renderBlock(block, numberSeq));
    });

    ensureEndBlock();
  }

  function renderBlock(block, numberSeq) {
    const wrap = document.createElement("div");
    wrap.className = "block";
    wrap.dataset.blockId = block.id;
    wrap.dataset.type = block.type;

    wrap.innerHTML =
      '<div class="block-controls">' +
      '<button class="block-handle" draggable="true" aria-label="Drag to reorder">' +
      ui.icon("grip") +
      "</button>" +
      '<button class="block-type-btn" aria-label="Change block type">' +
      ui.icon("more") +
      "</button>" +
      "</div>";

    let content;
    switch (block.type) {
      case "heading1":
      case "heading2":
      case "heading3":
        content = makeEditable(block, "block-content block-" + block.type);
        break;
      case "bulleted":
      case "numbered": {
        const row = document.createElement("div");
        row.className = "block-" + block.type;
        const marker = document.createElement("span");
        marker.className = "list-marker";
        marker.textContent = block.type === "bulleted" ? "\u2022" : numberSeq + ".";
        const editable = makeEditable(block, "block-content");
        row.append(marker, editable);
        content = row;
        break;
      }
      case "todo": {
        const row = document.createElement("div");
        row.className = "block-todo";
        row.dataset.checked = String(!!block.checked);
        const box = document.createElement("button");
        box.className = "todo-checkbox";
        box.dataset.checked = String(!!block.checked);
        box.setAttribute("aria-label", block.checked ? "Mark as not done" : "Mark as done");
        box.innerHTML = ui.icon("check");
        box.addEventListener("click", () => {
          const next = !block.checked;
          store.updateBlock(pageId, block.id, { checked: next });
          row.dataset.checked = String(next);
          box.dataset.checked = String(next);
          box.setAttribute("aria-label", next ? "Mark as not done" : "Mark as done");
        });
        const editable = makeEditable(block, "block-content");
        row.append(box, editable);
        content = row;
        break;
      }
      case "quote":
        content = makeEditable(block, "block-content block-quote");
        break;
      case "code":
        content = makeEditable(block, "block-content block-code");
        break;
      case "callout": {
        const row = document.createElement("div");
        row.className = "block-callout";
        const glyph = document.createElement("span");
        glyph.className = "callout-icon";
        glyph.textContent = block.icon || "\uD83D\uDCA1";
        const editable = makeEditable(block, "block-content");
        row.append(glyph, editable);
        content = row;
        break;
      }
      case "divider": {
        const div = document.createElement("div");
        div.className = "block-divider";
        div.textContent = "\u2022 \u2022 \u2022";
        content = div;
        break;
      }
      case "image": {
        const img = document.createElement("div");
        img.className = "block-image";
        const el = document.createElement("img");
        el.src = block.content || "";
        el.alt = "Embedded image";
        el.addEventListener("error", () => {
          el.style.display = "none";
        });
        const cap = makeEditable(block, "block-image-caption", true);
        cap.textContent = block.caption || "";
        img.append(el, cap);
        content = img;
        break;
      }
      case "table":
        content = makeTable(block);
        break;
      case "toggle": {
        const row = document.createElement("div");
        row.className = "block-toggle";
        row.dataset.open = "true";
        const caret = document.createElement("button");
        caret.className = "toggle-caret";
        caret.setAttribute("aria-label", "Collapse");
        caret.innerHTML = ui.icon("chevron-right");
        caret.addEventListener("click", () => {
          const open = row.dataset.open === "true";
          row.dataset.open = String(!open);
          caret.setAttribute("aria-label", open ? "Expand" : "Collapse");
        });
        const editable = makeEditable(block, "block-content");
        row.append(caret, editable);
        content = row;
        break;
      }
      default:
        content = makeEditable(block, "block-content block-text", true);
    }

    wrap.appendChild(content);
    attachBlockEvents(wrap, block);
    return wrap;
  }

  function makeEditable(block, className, placeholder) {
    const el = document.createElement("div");
    el.className = className;
    el.contentEditable = "true";
    el.textContent = block.content || "";
    el.setAttribute("role", "textbox");
    el.setAttribute("aria-multiline", "true");
    if (placeholder) el.dataset.placeholder = String(!block.content);
    el.addEventListener("input", () => {
      const val = el.innerText.replace(/\u200B/g, "");
      store.updateBlock(pageId, block.id, { content: val });
      if (placeholder) el.dataset.placeholder = String(!val);
    });
    return el;
  }

  function makeTable(block) {
    const t = block.table || { cols: 3, rows: [["", "", ""]] };
    const wrap = document.createElement("div");
    wrap.className = "block-table";
    const table = document.createElement("table");
    const tbody = document.createElement("tbody");
    t.rows.forEach((row, r) => {
      const tr = document.createElement("tr");
      row.forEach((cell, c) => {
        const isHeader = r === 0;
        const cellEl = document.createElement(isHeader ? "th" : "td");
        cellEl.contentEditable = "true";
        cellEl.textContent = cell || "";
        cellEl.addEventListener("input", () => {
          const tb = store.getPage(pageId).blocks.find((b) => b.id === block.id);
          if (tb && tb.table && tb.table.rows[r] && tb.table.rows[r][c] !== undefined) {
            tb.table.rows[r][c] = cellEl.innerText;
            store.save();
          }
        });
        tr.appendChild(cellEl);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    return wrap;
  }

  /* ---------- block events ---------- */
  function attachBlockEvents(wrap, block) {
    const editable = wrap.querySelector("[contenteditable]");
    wrap.querySelector(".block-type-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      const r = e.currentTarget.getBoundingClientRect();
      openTypeMenu(block, r.left, r.bottom + 4);
    });

    // drag handle
    const handle = wrap.querySelector(".block-handle");
    handle.addEventListener("dragstart", (e) => {
      draggingBlockId = block.id;
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", block.id);
      wrap.classList.add("is-dragging");
      const preview = document.createElement("div");
      preview.className = "drag-preview";
      preview.textContent = block.content || block.type;
      document.body.appendChild(preview);
      e.dataTransfer.setDragImage(preview, 10, 10);
      setTimeout(() => preview.remove(), 0);
    });
    handle.addEventListener("dragend", () => {
      draggingBlockId = null;
      wrap.classList.remove("is-dragging");
    });

    wrap.addEventListener("dragover", (e) => {
      if (!draggingBlockId || draggingBlockId === block.id) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    });
    wrap.addEventListener("drop", (e) => {
      if (!draggingBlockId || draggingBlockId === block.id) return;
      e.preventDefault();
      e.stopPropagation();
      const blocks = store.getPageBlocks(pageId);
      const fromIdx = blocks.findIndex((b) => b.id === draggingBlockId);
      const toIdx = blocks.findIndex((b) => b.id === block.id);
      if (fromIdx < 0 || toIdx < 0) return;
      const rect = wrap.getBoundingClientRect();
      const above = e.clientY < rect.top + rect.height / 2;
      store.moveBlockIndex(pageId, fromIdx, above ? toIdx : toIdx + 1);
      renderBlocks();
      focusBlock(draggingBlockId, true);
    });

    // selected state + caret handling
    wrap.addEventListener("focusin", () => {
      wrap.classList.add("selected");
    });
    wrap.addEventListener("focusout", (e) => {
      if (!wrap.contains(e.relatedTarget)) wrap.classList.remove("selected");
    });

    if (editable) {
      editable.addEventListener("keydown", (e) => onBlockKeydown(wrap, block, editable, e));
      // slash command detection on input
      editable.addEventListener("input", () => {
        const text = editable.innerText.replace(/\u200B/g, "");
        if (text.startsWith("/")) {
          const query = text.slice(1);
          if (slashMenuEl) {
            slashBlockId = block.id;
            slashQuery = query;
            renderSlashMenu();
            repositionSlashMenu(editable);
          } else {
            openSlashMenu(wrap, query);
          }
        } else {
          closeSlashMenu();
        }
      });
    }
  }

  /* ============================================================
     Keyboard editing
     ============================================================ */
  function onBlockKeydown(wrap, block, editable, e) {
    const blocks = store.getPageBlocks(pageId);
    const index = blocks.findIndex((b) => b.id === block.id);

    // Enter
    if (e.key === "Enter" && !e.shiftKey) {
      if (block.type === "code") return; // allow newline in code
      e.preventDefault();
      if (slashMenuEl) {
        applySlashSelection();
        return;
      }
      const offset = getCaretOffset(editable);
      const text = editable.innerText;
      const before = text.slice(0, offset);
      const after = text.slice(offset);
      let newType = "text";
      if (["bulleted", "numbered", "todo", "quote", "callout", "toggle"].includes(block.type)) {
        newType = block.type;
      }
      store.updateBlock(pageId, block.id, { content: before });
      const nb = store.addBlock(pageId, newType, after, index + 1);
      renderBlocks();
      focusBlock(nb.id, true);
      return;
    }

    // Backspace
    if (e.key === "Backspace") {
      if (slashMenuEl) {
        // if menu is open, closing it takes priority
        e.preventDefault();
        closeSlashMenu();
        return;
      }
      const offset = getCaretOffset(editable);
      if (offset === 0) {
        if (!editable.innerText && index > 0) {
          e.preventDefault();
          const prev = blocks[index - 1];
          store.removeBlock(pageId, block.id);
          renderBlocks();
          focusBlock(prev.id, false);
          return;
        }
        if (!editable.innerText && index === 0) {
          e.preventDefault();
          return;
        }
        if (offset === 0 && index > 0) {
          e.preventDefault();
          const prev = blocks[index - 1];
          const merged = prev.content + editable.innerText;
          store.updateBlock(pageId, prev.id, { content: merged });
          store.removeBlock(pageId, block.id);
          renderBlocks();
          focusBlock(prev.id, false);
          return;
        }
      }
      // empty at first position
      if (!editable.innerText && index === 0) e.preventDefault();
    }

    // Arrow keys navigate the slash menu
    if (slashMenuEl && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      const items = getSlashItems(slashQuery);
      const max = items.length - 1;
      if (e.key === "ArrowDown") slashIndex = Math.min(max, slashIndex + 1);
      else slashIndex = Math.max(0, slashIndex - 1);
      renderSlashMenu();
      return;
    }

    // Escape handled globally; "/" handled on input.
    if (e.key === "Escape") {
      closeSlashMenu();
    }
  }

  function applySlashSelection() {
    const items = getSlashItems(slashQuery);
    const item = items[Math.min(slashIndex, items.length - 1)];
    if (item) applySlashItem(item.type);
  }

  function getCaretOffset(el) {
    const sel = window.getSelection();
    if (!sel.rangeCount) return el.innerText.length;
    const range = sel.getRangeAt(0);
    if (!el.contains(range.commonAncestorContainer)) return el.innerText.length;
    const pre = range.cloneRange();
    pre.selectNodeContents(el);
    pre.setEnd(range.endContainer, range.endOffset);
    return pre.toString().length;
  }

  function focusBlock(blockId, atEnd) {
    const wrap = blocksEl.querySelector('.block[data-block-id="' + blockId + '"]');
    if (!wrap) return;
    const editable = wrap.querySelector("[contenteditable]");
    if (!editable) return;
    editable.focus();
    if (atEnd) placeCaretAtEnd(editable);
  }

  function placeCaretAtEnd(el) {
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  /* ============================================================
     Phantom end block
     ============================================================ */
  function ensureEndBlock() {
    const blocks = store.getPageBlocks(pageId);
    const last = blocks[blocks.length - 1];
    if (last && last.type === "text" && last.content === "") return;
    if (phantom) return;

    phantom = document.createElement("div");
    phantom.className = "block block-text";
    phantom.dataset.phantom = "true";
    const editable = document.createElement("div");
    editable.className = "block-content block-text";
    editable.contentEditable = "true";
    editable.dataset.placeholder = "true";
    editable.setAttribute("role", "textbox");
    phantom.appendChild(editable);
    blocksEl.appendChild(phantom);

    const convert = () => {
      if (!phantom) return;
      const content = editable.innerText.replace(/\u200B/g, "");
      const el = phantom;
      phantom = null;
      const b = store.addBlock(pageId, "text", content);
      renderBlocks();
      focusBlock(b.id, true);
      void el;
    };

    editable.addEventListener("focus", () => {
      if (!editable.innerText) convert();
    });
    editable.addEventListener("input", () => {
      if (editable.innerText) convert();
    });
    editable.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        convert();
      }
      if (e.key === "Backspace" && !editable.innerText) {
        e.preventDefault();
        // focus last real block
        const blocks = store.getPageBlocks(pageId);
        if (blocks.length) focusBlock(blocks[blocks.length - 1].id, false);
      }
    });
  }

  /* ============================================================
     Slash command menu
     ============================================================ */
  function getSlashItems(query) {
    if (!query) return SLASH_ITEMS;
    const q = query.toLowerCase();
    return SLASH_ITEMS.filter(
      (it) =>
        it.label.toLowerCase().includes(q) ||
        it.type.toLowerCase().includes(q) ||
        it.desc.toLowerCase().includes(q)
    );
  }

  function openSlashMenu(blockEl, query) {
    closeSlashMenu();
    slashBlockId = blockEl.dataset.blockId;
    slashQuery = query;
    slashIndex = 0;

    const root = document.getElementById("slash-menu-root");
    slashMenuEl = document.createElement("div");
    slashMenuEl.className = "slash-menu";
    slashMenuEl.setAttribute("role", "listbox");
    renderSlashMenu();
    root.appendChild(slashMenuEl);

    repositionSlashMenu(blockEl.querySelector("[contenteditable]") || blockEl);
  }

  function renderSlashMenu() {
    if (!slashMenuEl) return;
    const items = getSlashItems(slashQuery);
    slashMenuEl.textContent = "";
    const header = document.createElement("div");
    header.className = "slash-menu-header";
    header.textContent = "Add a block";
    slashMenuEl.appendChild(header);

    if (!items.length) {
      const empty = document.createElement("div");
      empty.className = "slash-empty";
      empty.textContent = "No results for \u201C" + slashQuery + "\u201D";
      slashMenuEl.appendChild(empty);
      return;
    }

    slashIndex = Math.max(0, Math.min(slashIndex, items.length - 1));
    items.forEach((item, i) => {
      const btn = document.createElement("button");
      btn.className = "slash-item";
      btn.dataset.selected = String(i === slashIndex);
      btn.setAttribute("role", "option");
      btn.innerHTML =
        '<span class="slash-item-icon">' +
        ui.escapeHtml(item.glyph) +
        '</span><span class="slash-item-body"><div class="slash-item-label">' +
        ui.escapeHtml(item.label) +
        '</div><div class="slash-item-desc">' +
        ui.escapeHtml(item.desc) +
        "</div></span>";
      btn.addEventListener("mousemove", () => {
        slashIndex = i;
        highlightSlash();
      });
      btn.addEventListener("click", () => applySlashItem(item.type));
      slashMenuEl.appendChild(btn);
    });
  }

  function highlightSlash() {
    if (!slashMenuEl) return;
    slashMenuEl.querySelectorAll(".slash-item").forEach((el, i) => {
      el.dataset.selected = String(i === slashIndex);
    });
  }

  function applySlashItem(type) {
    if (!slashBlockId) return;
    const blockId = slashBlockId;
    closeSlashMenu();

    // clear the "/" command text that triggered the menu
    store.updateBlock(pageId, blockId, { content: "" });

    if (type === "divider") {
      store.setBlockType(pageId, blockId, "divider");
      renderBlocks();
      focusBlock(blockId, false);
      return;
    }
    if (type === "image") {
      promptImage(blockId);
      return;
    }
    store.setBlockType(pageId, blockId, type);
    renderBlocks();
    focusBlock(blockId, true);
  }

  function promptImage(blockId) {
    const modal = ui.openModal({
      title: "Insert image",
      body:
        "<p>Paste an image URL below, or choose a file from your device.</p>" +
        '<input type="text" class="field-input" id="image-url" placeholder="https://example.com/image.png" style="width:100%;padding:8px 12px;border:1px solid var(--border-strong);border-radius:6px;background:var(--bg-secondary);margin-top:10px" />' +
        '<input type="file" id="image-file" accept="image/*" style="display:none" />',
      footer:
        '<button class="btn btn-secondary" id="image-file-btn">Choose file</button>' +
        '<button class="btn btn-primary" id="image-ok">Insert</button>',
      size: "modal-sm",
    });

    const urlInput = modal.querySelector("#image-url");
    const fileInput = modal.querySelector("#image-file");
    modal.querySelector("#image-file-btn").addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", () => {
      const f = fileInput.files[0];
      if (f) {
        urlInput.value = URL.createObjectURL(f);
      }
    });
    const done = () => {
      const val = urlInput.value.trim();
      if (val) {
        store.updateBlock(pageId, blockId, { content: val });
        store.setBlockType(pageId, blockId, "image");
        ui.closeModal();
        renderBlocks();
        focusBlock(blockId, false);
      }
    };
    modal.querySelector("#image-ok").addEventListener("click", done);
    urlInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") done();
    });
  }

  function closeSlashMenu() {
    if (slashMenuEl) {
      slashMenuEl.remove();
      slashMenuEl = null;
    }
    slashBlockId = null;
  }

  function repositionSlashMenu(anchor) {
    if (!slashMenuEl) return;
    const sel = window.getSelection();
    const rect = sel.rangeCount
      ? sel.getRangeAt(0).getBoundingClientRect()
      : anchor.getBoundingClientRect();
    let left = rect.left;
    let top = rect.bottom + 6;
    slashMenuEl.style.visibility = "hidden";
    requestAnimationFrame(() => {
      const r = slashMenuEl.getBoundingClientRect();
      if (left + r.width > window.innerWidth - 8) {
        left = Math.max(8, window.innerWidth - r.width - 8);
      }
      if (top + r.height > window.innerHeight - 8) {
        top = Math.max(8, rect.top - r.height - 6);
      }
      slashMenuEl.style.left = left + "px";
      slashMenuEl.style.top = top + "px";
      slashMenuEl.style.visibility = "visible";
    });
  }

  /* ---------- block type menu (⋮ button) ---------- */
  function openTypeMenu(block, x, y) {
    const items = SLASH_ITEMS.map((it) => ({
      label: it.label,
      icon: "file-text",
      checked: block.type === it.type,
      action: () => {
        if (it.type === "image") {
          promptImage(block.id);
          return;
        }
        if (it.type === "divider") {
          store.setBlockType(pageId, block.id, "divider");
          renderBlocks();
          return;
        }
        store.setBlockType(pageId, block.id, it.type);
        renderBlocks();
        focusBlock(block.id, true);
      },
    }));
    ui.openMenu({
      x,
      y,
      header: { name: "Change type", sub: "Transform this block" },
      items,
    });
  }

  /* ---------- icon picker ---------- */
  function openIconPicker(btn) {
    const r = btn.getBoundingClientRect();
    const common = [
      "\uD83D\uDCDD", "\u2728", "\uD83D\uDCC6", "\uD83D\uDE80", "\uD83C\uDFAF", "\uD83D\uDCC5",
      "\uD83C\uDF93", "\uD83D\uDDA5\uFE0F", "\uD83D\uDCBE", "\uD83D\uDCC1", "\uD83D\uDCDA",
      "\uD83C\uDF10", "\uD83D\uDCA1", "\uD83D\uDD25", "\u2705", "\u23F0", "\uD83C\uDF89",
      "\uD83C\uDF38", "\uD83D\uDCE0", "\uD83D\uDCC8", "\uD83D\uDCC9", "\uD83E\uDD16",
    ];
    const items = common.map((glyph) => ({
      label: glyph,
      icon: "dot",
      action: () => {
        store.updatePageIcon(pageId, glyph);
        ui.showToast("Icon updated", "success");
      },
    }));
    ui.openMenu({ x: r.left, y: r.bottom + 4, header: { name: "Choose an icon" }, items });
  }

  /* ============================================================
     Floating formatting toolbar
     ============================================================ */
  const toolbar = document.getElementById("format-toolbar");

  function buildToolbar() {
    const btn = (cmd, iconName, title, extra) => {
      const b = document.createElement("button");
      b.className = "fmt-btn";
      b.title = title;
      b.setAttribute("aria-label", title);
      b.dataset.cmd = cmd;
      if (extra) b.dataset.extra = extra;
      b.innerHTML = ui.icon(iconName);
      b.addEventListener("mousedown", (e) => e.preventDefault());
      b.addEventListener("click", () => {
        document.execCommand(cmd, false, b.dataset.extra || null);
        updateFormatState();
      });
      return b;
    };
    const sep = () => {
      const s = document.createElement("span");
      s.className = "fmt-sep";
      return s;
    };

    toolbar.appendChild(btn("bold", "bold", "Bold (Ctrl+B)"));
    toolbar.appendChild(btn("italic", "italic", "Italic (Ctrl+I)"));
    toolbar.appendChild(btn("underline", "underline", "Underline"));
    toolbar.appendChild(btn("strikeThrough", "strike", "Strikethrough"));
    toolbar.appendChild(btn("formatBlock", "code", "Inline code", "<code>"));
    toolbar.appendChild(sep());
    toolbar.appendChild(btn("createLink", "link", "Link"));
    toolbar.appendChild(sep());
    toolbar.appendChild(btn("justifyLeft", "align-left", "Align left"));
    toolbar.appendChild(btn("justifyCenter", "align-center", "Align center"));
    toolbar.appendChild(btn("justifyRight", "align-right", "Align right"));

    const arrow = document.createElement("div");
    arrow.className = "format-arrow";
    toolbar.appendChild(arrow);
  }

  function updateFormatState() {
    toolbar.querySelectorAll(".fmt-btn").forEach((b) => {
      let active = false;
      try {
        if (b.dataset.cmd === "createLink") {
          active = document.queryCommandValue("createLink") !== "";
        } else if (b.dataset.cmd === "formatBlock") {
          active = document.queryCommandValue("formatBlock") === "code";
        } else {
          active = document.queryCommandState(b.dataset.cmd);
        }
      } catch (e) {
        /* ignore */
      }
      b.dataset.active = String(active);
    });
  }

  function onSelectionChange() {
    const sel = window.getSelection();
    if (!toolbar || toolbar.hidden) {
      if (sel && !sel.isCollapsed && withinEditor(sel)) {
        showToolbar(sel);
      }
      return;
    }
    if (!sel || sel.isCollapsed || !withinEditor(sel)) {
      hideToolbar();
      return;
    }
    positionToolbar(sel);
    updateFormatState();
  }

  function withinEditor(sel) {
    if (!pageEl) return false;
    return pageEl.contains(sel.anchorNode) || pageEl.contains(sel.focusNode);
  }

  function showToolbar(sel) {
    toolbar.hidden = false;
    toolbar.style.opacity = "0";
    positionToolbar(sel);
    updateFormatState();
    requestAnimationFrame(() => {
      toolbar.style.opacity = "1";
      toolbar.style.transition = "opacity 0.1s ease";
    });
  }

  function hideToolbar() {
    toolbar.hidden = true;
  }

  function positionToolbar(sel) {
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    let left = rect.left + rect.width / 2 - toolbar.offsetWidth / 2;
    let top = rect.top - toolbar.offsetHeight - 10;
    left = Math.max(8, Math.min(left, window.innerWidth - toolbar.offsetWidth - 8));
    if (top < 8) top = rect.bottom + 10;
    toolbar.style.left = left + "px";
    toolbar.style.top = top + "px";
  }

  /* ============================================================
     Global wiring
     ============================================================ */
  function init() {
    buildToolbar();

    // hide toolbar when clicking elsewhere
    document.addEventListener("pointerdown", (e) => {
      if (toolbar && !toolbar.contains(e.target)) {
        // let selection events decide
      }
    });

    document.addEventListener("selectionchange", () => onSelectionChange());

    // close slash menu on outside click
    document.addEventListener("pointerdown", (e) => {
      if (slashMenuEl && !slashMenuEl.contains(e.target)) {
        closeSlashMenu();
      }
    });

    // window scroll hides toolbar
    document.addEventListener("scroll", () => hideToolbar(), true);
  }

  function closeAll() {
    closeSlashMenu();
    hideToolbar();
  }

  window.Lumen.editor = {
    render,
    syncMeta,
    renderBlocks,
    closeAll,
    init,
    getPageId: () => pageId,
    getTitleEl: () => titleEl,
  };
})();
