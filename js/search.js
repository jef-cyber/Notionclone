/* ============================================================
   Lumen — search: global search modal (Ctrl/Cmd + K).
   Searches page titles and block content; shows recents first.
   ============================================================ */

(function () {
  "use strict";

  const { store, ui } = window.Lumen;

  let modal = null;
  let input = null;
  let resultsEl = null;
  let items = [];
  let selected = 0;
  let searchTimer = null;
  // Monotonic token: a slow response for an old query must never overwrite the
  // results of a newer one.
  let queryToken = 0;

  function open() {
    if (modal) close();
    modal = ui.openModal({
      title: "Search",
      size: "modal-lg",
      body:
        '<div class="search-box">' +
        ui.icon("search") +
        '<input id="search-input" type="text" placeholder="Search anything\u2026" aria-label="Search" autocomplete="off" />' +
        "</div>" +
        '<div id="search-results" class="search-results"></div>',
    });

    input = modal.querySelector("#search-input");
    resultsEl = modal.querySelector("#search-results");

    input.addEventListener("input", onInput);
    input.addEventListener("keydown", onKeydown);

    renderRecent();
    requestAnimationFrame(() => input.focus());
  }

  function close() {
    clearTimeout(searchTimer);
    queryToken += 1; // drop any in-flight search
    if (modal) {
      ui.closeModal();
      modal = null;
      input = null;
      resultsEl = null;
    }
  }

  /* ---------- rendering ---------- */
  function renderRecent() {
    const state = store.getState();
    const recents = state.recent.map((id) => store.getPage(id)).filter(Boolean);
    items = [];
    selected = 0;

    if (!recents.length) {
      resultsEl.innerHTML =
        '<div class="search-group-label">Search</div>' +
        '<div class="search-empty">Type to search your pages\u2026</div>';
      return;
    }

    resultsEl.innerHTML =
      '<div class="search-group-label">Recent</div>' +
      recents
        .map((p, i) => resultItemHtml(p, i, p.title || "Untitled", ""))
        .join("") +
      '<div class="search-empty" style="padding:16px 10px;text-align:left;color:var(--text-muted);font-size:12.5px">Search all pages by typing above</div>';

    items = recents;
    wireResultEvents();
    highlight();
  }

  function onInput() {
    const q = input.value.trim();
    clearTimeout(searchTimer);
    if (!q) {
      queryToken += 1;
      renderRecent();
      return;
    }

    resultsEl.innerHTML = '<div class="search-group-label">Search results</div>' + loadingHtml();
    // The API needs a round trip, so debounce rather than firing per keystroke.
    searchTimer = setTimeout(() => runSearch(q), 180);
  }

  async function runSearch(q) {
    const token = ++queryToken;
    let results = [];
    try {
      results = await store.searchPages(q);
    } catch (err) {
      if (token !== queryToken) return;
      results = [];
    }
    if (token !== queryToken) return; // a newer query already won
    if (!input || !input.value.trim()) return;

    items = results;
    selected = 0;

    if (!results.length) {
      resultsEl.innerHTML =
        '<div class="search-group-label">Search results</div>' +
        '<div class="search-empty">' +
        ui.icon("search") +
        "<br/><br/>No pages match \u201C" +
        ui.escapeHtml(q) +
        "\u201D</div>";
      return;
    }

    const ql = q.toLowerCase();
    resultsEl.innerHTML =
      '<div class="search-group-label">Search results</div>' +
      results
        .map((r, i) => {
          const title = r.page.title || "Untitled";
          const snippet = r.snippet && r.snippet !== r.page.title ? r.snippet : "";
          return resultItemHtml(r.page, i, title, snippet, ql);
        })
        .join("");

    wireResultEvents();
    highlight();
  }

  function loadingHtml() {
    return (
      '<div class="search-empty">' + ui.icon("search") + "<br/><br/>Searching\u2026</div>"
    );
  }

  function resultItemHtml(page, i, title, snippet, ql) {
    const path = store
      .getPath(page.id)
      .map((p) => p.title || "Untitled")
      .join(" / ");
    const hl = (text) =>
      ql ? ui.escapeHtml(text).replace(new RegExp("(" + escapeRegExp(ql) + ")", "ig"), "<mark>$1</mark>") : ui.escapeHtml(text);
    return (
      '<button class="search-result" data-id="' +
      page.id +
      '" data-index="' +
      i +
      '" role="option">' +
      '<span class="search-result-icon">' +
      ui.escapeHtml(page.icon || "\uD83D\uDCDD") +
      "</span>" +
      '<span class="search-result-body">' +
      '<span class="search-result-title">' +
      hl(title) +
      "</span>" +
      (snippet ? '<span class="search-result-snippet">' + hl(snippet) + "</span>" : "") +
      "</span>" +
      '<span class="search-result-path">' +
      ui.escapeHtml(path) +
      "</span>" +
      "</button>"
    );
  }

  function escapeRegExp(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function wireResultEvents() {
    resultsEl.querySelectorAll(".search-result").forEach((btn) => {
      btn.addEventListener("mousemove", () => {
        selected = parseInt(btn.dataset.index, 10);
        highlight();
      });
      btn.addEventListener("click", () => go(btn.dataset.id));
    });
  }

  function highlight() {
    resultsEl.querySelectorAll(".search-result").forEach((btn) => {
      btn.dataset.selected = String(parseInt(btn.dataset.index, 10) === selected);
    });
  }

  function go(id) {
    const page = store.getPage(id);
    if (!page) return;
    close();
    window.Lumen.app && window.Lumen.app.openPage(id);
  }

  /* ---------- keyboard ---------- */
  function onKeydown(e) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      selected = Math.min(items.length - 1, selected + 1);
      highlight();
      scrollSelectedIntoView();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      selected = Math.max(0, selected - 1);
      highlight();
      scrollSelectedIntoView();
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = items[selected];
      if (item) go(item.page ? item.page.id : item.id);
    } else if (e.key === "Escape") {
      close();
    }
  }

  function scrollSelectedIntoView() {
    const el = resultsEl.querySelector('[data-index="' + selected + '"]');
    if (el) el.scrollIntoView({ block: "nearest" });
  }

  window.Lumen.search = { open, close, isOpen: () => !!modal };
})();
