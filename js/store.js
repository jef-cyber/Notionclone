/* ============================================================
   Lumen — store: state, persistence, and page CRUD.
   All state lives here; other modules read/write through it.
   ============================================================ */

(function () {
  "use strict";

  const STORAGE_KEY = "lumen.state.v1";

  /* ---------- tiny helpers ---------- */
  function uid(prefix) {
    return (
      (prefix || "id") +
      "-" +
      Date.now().toString(36) +
      "-" +
      Math.random().toString(36).slice(2, 8)
    );
  }

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  /* ---------- state ---------- */
  let state = null;
  const listeners = [];
  let saveTimer = null;

  function buildInitial() {
    return {
      app: clone(window.LumenData.app),
      workspace: clone(window.LumenData.workspace),
      user: clone(window.LumenData.user),
      settings: clone(window.LumenData.defaultSettings),
      pages: clone(window.LumenData.pages),
      notifications: clone(window.LumenData.notifications),
      recent: [
        "weekly-sync",
        "project-alpha",
        "learning-plan",
        "getting-started",
      ],
      recentSearches: [],
      view: "dashboard",
      currentPageId: null,
      loggedIn: false,
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.pages)) return null;
      return parsed;
    } catch (e) {
      console.warn("Could not load saved state:", e);
      return null;
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn("Could not save state:", e);
    }
  }

  function saveDebounced() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 300);
  }

  function commit(reason) {
    save();
    listeners.forEach((fn) => {
      try {
        fn(reason);
      } catch (e) {
        console.error(e);
      }
    });
  }

  function mutate(fn, reason) {
    const result = fn(state);
    commit(reason || "change");
    return result;
  }

  /* ---------- accessors ---------- */
  function getState() {
    return state;
  }

  function pagesById() {
    const map = {};
    state.pages.forEach((p) => (map[p.id] = p));
    return map;
  }

  function getPage(id) {
    return state.pages.find((p) => p.id === id) || null;
  }

  function getChildren(id) {
    return state.pages.filter((p) => p.parentId === id && !p.deletedAt);
  }

  function getChildrenRaw(id) {
    return state.pages.filter((p) => p.parentId === id);
  }

  function getDescendantIds(id) {
    const out = [];
    const walk = (pid) => {
      getChildrenRaw(pid).forEach((c) => {
        out.push(c.id);
        walk(c.id);
      });
    };
    walk(id);
    return out;
  }

  /** Path from root page down to the given page (for breadcrumbs). */
  function getPath(id) {
    const path = [];
    let cur = getPage(id);
    let guard = 0;
    while (cur && guard < 50) {
      path.unshift(cur);
      cur = cur.parentId ? getPage(cur.parentId) : null;
      guard++;
    }
    return path;
  }

  function getFavorites() {
    return state.pages.filter((p) => p.favorite && !p.deletedAt);
  }

  function getTopLevelPages() {
    return state.pages.filter((p) => !p.parentId && !p.deletedAt);
  }

  function getSiblings(id) {
    const page = getPage(id);
    if (!page) return [];
    return getChildren(page.parentId);
  }

  /* ---------- page CRUD ---------- */
  function createPage(opts) {
    const o = opts || {};
    const page = {
      id: o.id || uid("page"),
      title: o.title || "",
      icon: o.icon || "\uD83D\uDCDD", // 📝
      parentId: o.parentId || null,
      favorite: !!o.favorite,
      createdAt: o.createdAt || new Date().toISOString().slice(0, 10),
      updatedAt: o.updatedAt || new Date().toISOString().slice(0, 10),
      blocks: o.blocks ? clone(o.blocks).map(ensureBlockIds) : [],
    };
    mutate((s) => {
      s.pages.push(page);
      if (o.parentId) {
        // make sure the parent's caret opens
        const parent = s.pages.find((p) => p.id === o.parentId);
        if (parent) parent.expanded = true;
      }
      s.view = "page";
      s.currentPageId = page.id;
      s.recent = touchRecent(s.recent, page.id);
    }, "pages");
    return page;
  }

  function ensureBlockIds(block, i) {
    return { ...block, id: block.id || uid("blk") };
  }

  function updatePage(id, patch, reason) {
    mutate((s) => {
      const page = s.pages.find((p) => p.id === id);
      if (page) {
        Object.assign(page, patch);
        page.updatedAt = new Date().toISOString().slice(0, 10);
      }
    }, reason || "rename");
  }

  function toggleFavorite(id) {
    const page = getPage(id);
    if (!page) return false;
    mutate((s) => {
      const p = s.pages.find((x) => x.id === id);
      p.favorite = !p.favorite;
    }, "favorites");
    return page.favorite;
  }

  function deletePage(id) {
    const page = getPage(id);
    if (!page) return;
    const ids = [id, ...getDescendantIds(id)];
    mutate((s) => {
      s.pages = s.pages.filter((p) => !ids.includes(p.id));
      s.recent = s.recent.filter((r) => !ids.includes(r));
      if (ids.includes(s.currentPageId)) {
        s.view = "dashboard";
        s.currentPageId = null;
      }
      if (ids.includes(s.currentPageId)) s.currentPageId = null;
    }, "pages");
  }

  /* ---------- trash lifecycle ---------- */
  function moveToTrash(id) {
    const page = getPage(id);
    if (!page || page.deletedAt) return;
    const ids = [id, ...getDescendantIds(id)];
    const stamp = new Date().toISOString();
    mutate((s) => {
      ids.forEach((pid) => {
        const p = s.pages.find((x) => x.id === pid);
        if (p) {
          p.deletedAt = stamp;
          p.expanded = false;
        }
      });
      s.recent = s.recent.filter((r) => !ids.includes(r));
      if (ids.includes(s.currentPageId)) {
        s.view = "dashboard";
        s.currentPageId = null;
      }
    }, "trash");
  }

  function restorePage(id) {
    const page = getPage(id);
    if (!page || !page.deletedAt) return;
    const ids = [id, ...getDescendantIds(id)];
    mutate((s) => {
      ids.forEach((pid) => {
        const p = s.pages.find((x) => x.id === pid);
        if (p) p.deletedAt = null;
      });
    }, "trash");
  }

  function deletePagePermanently(id) {
    deletePage(id);
  }

  function emptyTrash() {
    const roots = getTrashPages();
    if (!roots.length) return;
    const ids = [];
    roots.forEach((p) => ids.push(p.id, ...getDescendantIds(p.id)));
    mutate((s) => {
      s.pages = s.pages.filter((p) => !ids.includes(p.id));
      s.recent = s.recent.filter((r) => !ids.includes(r));
      if (ids.includes(s.currentPageId)) {
        s.view = "dashboard";
        s.currentPageId = null;
      }
    }, "trash");
  }

  /** Root trashed pages (a trashed page whose parent is not itself trashed). */
  function getTrashPages() {
    return state.pages.filter(
      (p) =>
        p.deletedAt &&
        !(p.parentId && state.pages.some((x) => x.id === p.parentId && x.deletedAt))
    );
  }

  function duplicatePage(id) {
    const page = getPage(id);
    if (!page) return null;
    const copy = clone(page);
    copy.id = uid("page");
    copy.title = page.title ? page.title + " (copy)" : "";
    copy.createdAt = new Date().toISOString().slice(0, 10);
    copy.updatedAt = new Date().toISOString().slice(0, 10);
    copy.favorite = false;
    copy.expanded = false;
    copy.blocks = copy.blocks.map(ensureBlockIds);
    mutate((s) => {
      const idx = s.pages.indexOf(page);
      s.pages.splice(idx + 1, 0, copy);
      s.view = "page";
      s.currentPageId = copy.id;
      s.recent = touchRecent(s.recent, copy.id);
    }, "pages");
    return copy;
  }

  /** Move a page: parentId may be a page id or null (top level). beforeId is optional. */
  function movePage(id, parentId, beforeId) {
    const page = getPage(id);
    if (!page) return;
    if (parentId === id || (parentId && getDescendantIds(id).includes(parentId))) {
      return; // cannot nest a page inside itself
    }
    mutate((s) => {
      const from = s.pages.indexOf(page);
      s.pages.splice(from, 1);
      page.parentId = parentId || null;

      let insertAt;
      if (beforeId) {
        const before = s.pages.find((p) => p.id === beforeId);
        insertAt = before ? s.pages.indexOf(before) : s.pages.length;
      } else {
        // append after the last sibling of the new parent (or at the end)
        const siblings = s.pages.filter((p) => p.parentId === page.parentId);
        const lastSib = siblings[siblings.length - 1];
        insertAt = lastSib ? s.pages.indexOf(lastSib) + 1 : s.pages.length;
      }
      insertAt = Math.max(0, Math.min(insertAt, s.pages.length));
      s.pages.splice(insertAt, 0, page);
      if (parentId) {
        const parent = s.pages.find((p) => p.id === parentId);
        if (parent) parent.expanded = true;
      }
    }, "pages");
  }

  /* ---------- blocks ---------- */
  function getPageBlocks(id) {
    const page = getPage(id);
    return page ? page.blocks : [];
  }

  function updateBlock(id, blockId, patch) {
    const page = getPage(id);
    if (!page) return;
    const block = page.blocks.find((b) => b.id === blockId);
    if (!block) return;
    Object.assign(block, patch);
    page.updatedAt = new Date().toISOString().slice(0, 10);
    saveDebounced(); // frequent while typing — don't re-render everything
  }

  function updatePageIcon(id, icon) {
    updatePage(id, { icon }, "icon");
  }

  /* ---------- blocks ---------- */
  /** Add a block. Returns the created block. No global re-render (editor owns DOM). */
  function addBlock(pageId, type, content, index) {
    const page = getPage(pageId);
    if (!page) return null;
    const block = {
      id: uid("blk"),
      type: type || "text",
      content: content || "",
    };
    if (type === "callout") block.icon = "\uD83D\uDCA1";
    if (type === "todo") block.checked = false;
    if (type === "image") block.caption = "";
    if (type === "table") {
      block.table = {
        cols: 3,
        rows: [
          ["Header 1", "Header 2", "Header 3"],
          ["", "", ""],
          ["", "", ""],
        ],
      };
    }
    const i = index === undefined || index === null ? page.blocks.length : index;
    page.blocks.splice(i, 0, block);
    saveDebounced();
    return block;
  }

  function removeBlock(pageId, blockId) {
    const page = getPage(pageId);
    if (!page) return;
    page.blocks = page.blocks.filter((b) => b.id !== blockId);
    saveDebounced();
  }

  function setBlockType(pageId, blockId, type) {
    const page = getPage(pageId);
    if (!page) return;
    const b = page.blocks.find((x) => x.id === blockId);
    if (!b) return;
    b.type = type;
    if (type === "todo") b.checked = !!b.checked;
    if (type === "callout" && !b.icon) b.icon = "\uD83D\uDCA1";
    if (type === "table" && !b.table) {
      b.table = {
        cols: 3,
        rows: [
          ["Header 1", "Header 2", "Header 3"],
          ["", "", ""],
          ["", "", ""],
        ],
      };
    }
    saveDebounced();
  }

  function moveBlockIndex(pageId, fromIdx, toIdx) {
    const page = getPage(pageId);
    if (!page || fromIdx === toIdx) return;
    const blocks = page.blocks;
    if (fromIdx < 0 || fromIdx >= blocks.length || toIdx < 0 || toIdx > blocks.length) return;
    const [moved] = blocks.splice(fromIdx, 1);
    blocks.splice(toIdx, 0, moved);
    saveDebounced();
  }

  /* ---------- navigation ---------- */
  function navigate(pageId) {
    mutate((s) => {
      s.view = "page";
      s.currentPageId = pageId;
      s.recent = touchRecent(s.recent, pageId);
    }, "nav");
  }

  function setView(view) {
    mutate((s) => {
      s.view = view;
      if (view !== "page") s.currentPageId = null;
    }, "nav");
  }

  function setLoggedIn(v) {
    state.loggedIn = !!v;
    save();
  }

  /* ---------- recents & notifications ---------- */
  function touchRecent(list, id) {
    const next = [id, ...list.filter((x) => x !== id)];
    return next.slice(0, 6);
  }

  function setRecent(id) {
    mutate((s) => {
      s.recent = touchRecent(s.recent, id);
    }, "recent");
  }

  function markNotificationsRead() {
    mutate((s) => {
      s.notifications.forEach((n) => (n.read = true));
    }, "notifications");
  }

  /* ---------- search ---------- */
  function searchPages(query) {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const results = [];
    state.pages.forEach((page) => {
      if (page.deletedAt) return;
      const haystack = [page.title, page.icon, ...page.blocks.map((b) => b.content || "")];
      const found = haystack.find((h) => h && h.toLowerCase().includes(q));
      if (found) {
        results.push({ page, snippet: found });
      }
    });
    return results;
  }

  function addRecentSearch(query) {
    const q = String(query || "").trim();
    if (!q) return;
    mutate((s) => {
      s.recentSearches = [
        q,
        ...(s.recentSearches || []).filter((x) => x.toLowerCase() !== q.toLowerCase()),
      ].slice(0, 8);
    }, "recent-search");
  }

  function clearRecentSearches() {
    mutate((s) => {
      s.recentSearches = [];
    }, "recent-search");
  }

  function getRecentSearches() {
    return state.recentSearches || [];
  }

  /* ---------- user ---------- */
  function updateUser(patch) {
    mutate((s) => {
      Object.assign(s.user, patch || {});
    }, "user");
  }

  /* ---------- events ---------- */
  function onChange(fn) {
    listeners.push(fn);
    return () => {
      const i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    };
  }

  /* ---------- init ---------- */
  state = load() || buildInitial();
  // merge in any keys that were added in later builds
  state.settings = Object.assign({}, window.LumenData.defaultSettings, state.settings);
  state.user = Object.assign({}, window.LumenData.user, state.user);
  state.recentSearches = Array.isArray(state.recentSearches) ? state.recentSearches : [];

  window.Lumen = window.Lumen || {};
  window.Lumen.store = {
    getState,
    getPage,
    getChildren,
    getDescendantIds,
    getPath,
    getFavorites,
    getTopLevelPages,
    getSiblings,
    pagesById,
    getPageBlocks,
    createPage,
    updatePage,
    updatePageIcon,
    toggleFavorite,
    deletePage,
    moveToTrash,
    restorePage,
    deletePagePermanently,
    emptyTrash,
    getTrashPages,
    duplicatePage,
    movePage,
    updateBlock,
    addBlock,
    removeBlock,
    setBlockType,
    moveBlockIndex,
    navigate,
    setView,
    setLoggedIn,
    searchPages,
    addRecentSearch,
    clearRecentSearches,
    getRecentSearches,
    updateUser,
    setRecent,
    markNotificationsRead,
    onChange,
    save,
    uid,
    clone,
  };
})();
