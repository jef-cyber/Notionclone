/* ============================================================
   Lumen — block renderer.

   Turns one block into its content element. The editor owns the block
   wrapper, the drag handle and the type menu; this module only decides
   what the inside of a block looks like.

   Every block type is a row in the one `blocks` collection, distinguished
   only by `type` — adding a type here needs no schema change.
   ============================================================ */

(function () {
  "use strict";

  const { store, ui } = window.Lumen;

  /**
   * Build the content element for a block.
   * @param {object} block  normalized block from the store
   * @param {object} ctx    { pageId, numberSeq, onImageRequest }
   * @returns {Element}
   */
  function render(block, ctx) {
    const pageId = ctx.pageId;

    switch (block.type) {
      case "heading1":
      case "heading2":
      case "heading3":
        return editable(block, "block-content block-" + block.type, pageId);

      case "bulleted":
      case "numbered": {
        const row = document.createElement("div");
        row.className = "block-" + block.type;
        const marker = document.createElement("span");
        marker.className = "list-marker";
        marker.textContent = block.type === "bulleted" ? "\u2022" : (ctx.numberSeq || 1) + ".";
        row.append(marker, editable(block, "block-content", pageId));
        return row;
      }

      case "todo": {
        const row = document.createElement("div");
        row.className = "block-todo";
        const done = !!block.checked;
        row.dataset.checked = String(done);

        const box = document.createElement("button");
        box.className = "todo-checkbox";
        box.dataset.checked = String(done);
        box.setAttribute("aria-label", done ? "Mark as not done" : "Mark as done");
        box.innerHTML = ui.icon("check");
        box.addEventListener("click", () => {
          const next = !block.checked;
          store.updateBlock(pageId, block.id, { checked: next });
          row.dataset.checked = String(next);
          box.dataset.checked = String(next);
          box.setAttribute("aria-label", next ? "Mark as not done" : "Mark as done");
        });

        row.append(box, editable(block, "block-content", pageId));
        return row;
      }

      case "quote":
        return editable(block, "block-content block-quote", pageId);

      case "code": {
        const wrap = document.createElement("div");
        wrap.className = "block-code-wrap";
        const lang = document.createElement("span");
        lang.className = "block-code-lang";
        lang.textContent = block.language || "code";
        lang.addEventListener("click", () => {
          const value = window.prompt("Language", block.language || "");
          if (value === null) return;
          store.updateBlock(pageId, block.id, { language: value.trim() });
          lang.textContent = value.trim() || "code";
        });
        const code = editable(block, "block-content block-code", pageId);
        wrap.append(lang, code);
        return wrap;
      }

      case "callout": {
        const row = document.createElement("div");
        row.className = "block-callout";
        const glyph = document.createElement("button");
        glyph.className = "callout-icon";
        glyph.textContent = block.icon || "\uD83D\uDCA1";
        glyph.setAttribute("aria-label", "Change icon");
        glyph.addEventListener("click", () => {
          const next = window.prompt("Emoji", block.icon || "\uD83D\uDCA1");
          if (!next) return;
          store.updateBlock(pageId, block.id, { icon: next });
          glyph.textContent = next;
        });
        row.append(glyph, editable(block, "block-content", pageId));
        return row;
      }

      case "divider": {
        const div = document.createElement("div");
        div.className = "block-divider";
        div.textContent = "\u2022 \u2022 \u2022";
        return div;
      }

      case "image":
        return image(block, ctx);

      case "video": {
        const box = document.createElement("div");
        box.className = "block-video";
        const url = block.url || block.content || "";
        if (url) {
          const frame = document.createElement("iframe");
          frame.src = url;
          frame.setAttribute("allowfullscreen", "");
          frame.setAttribute("loading", "lazy");
          frame.title = "Embedded video";
          box.appendChild(frame);
        } else {
          box.textContent = "No video URL set.";
        }
        return box;
      }

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
        row.append(caret, editable(block, "block-content", pageId));
        return row;
      }

      case "database":
        return database(block, pageId);

      default:
        return editable(block, "block-content block-text", pageId, true);
    }
  }

  /* ---------- helpers ---------- */

  /** A contenteditable div bound to one block's text. */
  function editable(block, className, pageId, placeholder) {
    const el = document.createElement("div");
    el.className = className;
    el.contentEditable = "true";
    el.textContent = block.content || "";
    el.setAttribute("role", "textbox");
    el.setAttribute("aria-multiline", "true");
    el.setAttribute("spellcheck", "true");
    if (placeholder) el.dataset.placeholder = String(!block.content);
    el.addEventListener("input", () => {
      const value = el.innerText.replace(/\u200B/g, "");
      store.updateBlock(pageId, block.id, { content: value });
      if (placeholder) el.dataset.placeholder = String(!value);
    });
    return el;
  }

  function image(block, ctx) {
    const wrap = document.createElement("div");
    wrap.className = "block-image";

    const source = block.content || block.url || "";
    if (source) {
      const el = document.createElement("img");
      el.src = source;
      el.alt = block.caption || "Embedded image";
      el.loading = "lazy";
      el.addEventListener("error", () => {
        el.replaceWith(Object.assign(document.createElement("div"), {
          className: "block-image-error",
          textContent: "Image could not be loaded",
        }));
      });
      wrap.appendChild(el);
    } else {
      const placeholder = document.createElement("button");
      placeholder.className = "block-image-placeholder";
      placeholder.textContent = "Add an image";
      placeholder.addEventListener("click", () => ctx.onImageRequest(block.id));
      wrap.appendChild(placeholder);
    }

    const caption = document.createElement("div");
    caption.className = "block-image-caption";
    caption.contentEditable = "true";
    caption.textContent = block.caption || "";
    caption.dataset.placeholder = String(!block.caption);
    caption.setAttribute("role", "textbox");
    caption.addEventListener("input", () => {
      const value = caption.innerText.replace(/\u200B/g, "");
      store.updateBlock(ctx.pageId, block.id, { caption: value });
      caption.dataset.placeholder = String(!value);
    });
    wrap.appendChild(caption);
    return wrap;
  }

  /**
   * A database block is a pointer to a `dataTable` document; the table, board,
   * calendar and roadmap views all live in database.js.
   */
  function database(block, pageId) {
    const host = document.createElement("div");
    host.className = "block-database";
    const database = window.Lumen.database;
    if (!database || typeof database.mount !== "function") {
      host.textContent = "Database views are unavailable.";
      return host;
    }
    database.mount(host, { block, pageId });
    return host;
  }

  window.Lumen = window.Lumen || {};
  window.Lumen.blockRenderer = { render };
})();
