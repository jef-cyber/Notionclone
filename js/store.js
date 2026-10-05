/* ============================================================
   Lumen — store.

   The single source of truth for the UI. Pages, blocks, workspaces and the
   signed-in user now live in MongoDB behind the Express API, so this module
   is a cache in front of that API rather than the database itself.

   Two rules keep typing responsive:
     1. Mutations apply to the local cache immediately and re-render.
     2. The network write happens after, debounced, and the server's answer
        replaces the local copy.
   Reads that cannot be faked — creating a page (we need the server id to
   navigate) and search — return promises.
   ============================================================ */

(function () {
  "use strict";

  const api = window.Lumen.api;
  const PREFS_KEY = "lumen.prefs.v1";

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
    return obj === undefined ? obj : JSON.parse(JSON.stringify(obj));
  }

  function isObjectId(value) {
    return typeof value === "string" && /^[0-9a-fA-F]{24}$/.test(value);
  }

  function toast(message, kind) {
    const ui = window.Lumen.ui;
    if (ui && ui.showToast) ui.showToast(message, kind || "info");
  }

  /* ============================================================
     Block vocabulary

     The editor has always used short internal names ("text", "bulleted").
     The blocks collection stores the canonical names. These two maps are the
     only place the two vocabularies meet.
     ============================================================ */
  const UI_TO_API_TYPE = {
    text: "paragraph",
    heading1: "heading1",
    heading2: "heading2",
    heading3: "heading3",
    bulleted: "bulleted_list",
    numbered: "numbered_list",
    todo: "todo",
    quote: "quote",
    callout: "callout",
    code: "code",
    divider: "divider",
    image: "image",
    video: "video",
    toggle: "toggle",
    table: "database",
    database: "database",
  };

  const API_TO_UI_TYPE = {
    paragraph: "text",
    bulleted_list: "bulleted",
    numbered_list: "numbered",
    toggle: "toggle",
    table: "database",
  };

  function toApiType(uiType) {
    return UI_TO_API_TYPE[uiType] || uiType || "paragraph";
  }

  function toUiType(apiType) {
    return API_TO_UI_TYPE[apiType] || apiType || "text";
  }

  /** The id the API knows a block by, or null while it is still being created. */
  function apiId(block) {
    if (!block) return null;
    if (block.serverId) return block.serverId;
    return isObjectId(block.id) ? block.id : null;
  }

  /* ============================================================
     Normalization: server documents -> the shape the UI renders
     ============================================================ */
  function normalizePage(doc) {
    if (!doc) return null;
    const archived = !!doc.isArchived;
    return {
      id: doc._id,
      workspaceId: doc.workspaceId,
      parentId: doc.parentPageId || null,
      title: doc.title || "",
      icon: doc.icon || "\uD83D\uDCDD",
      cover: doc.cover || "",
      favorite: !!doc.isFavorite,
      isArchived: archived,
      // The pages collection has no separate trash timestamp, so the page's
      // last update is the best available "when this was trashed".
      archivedAt: archived ? doc.updatedAt : null,
      position: typeof doc.position === "number" ? doc.position : 0,
      createdAt: doc.createdAt || null,
      updatedAt: doc.updatedAt || null,
      createdBy: doc.createdBy ? { id: doc.createdBy._id, name: doc.createdBy.name } : null,
      blocks: [],
      blocksLoaded: false,
    };
  }

  function normalizeBlock(doc) {
    const content = doc.content || {};
    const properties = doc.properties || {};
    const block = {
      // Loaded blocks keep the server id as their local id; blocks created in
      // this session get a local id and fill in `serverId` when the POST lands.
      id: doc._id,
      serverId: doc._id,
      type: toUiType(doc.type),
      content: typeof content.text === "string" ? content.text : "",
      position: typeof doc.position === "number" ? doc.position : 0,
    };
    if (properties.checked !== undefined) block.checked = !!properties.checked;
    if (properties.icon !== undefined) block.icon = properties.icon;
    if (properties.caption !== undefined) block.caption = properties.caption;
    if (properties.language !== undefined) block.language = properties.language;
    // A database block is a pointer to a dataTable document, not the data
    // itself; the rows live in the `dataTable` collection.
    if (properties.dataTableId !== undefined) block.dataTableId = properties.dataTableId;
    if (content.url !== undefined) block.url = content.url;
    if (content.caption !== undefined) block.caption = content.caption;
    return block;
  }

  /** Turn a UI block into the body the blocks endpoint accepts. */
  function toApiPayload(block, position) {
    const payload = {
      type: toApiType(block.type),
      content: { text: block.content || "" },
    };
    if (position !== undefined) payload.position = position;

    const properties = {};
    if (block.checked !== undefined) properties.checked = !!block.checked;
    if (block.icon !== undefined) properties.icon = block.icon;
    if (block.caption !== undefined) properties.caption = block.caption;
    if (block.language !== undefined) properties.language = block.language;
    if (block.dataTableId !== undefined) properties.dataTableId = block.dataTableId;
    if (Object.keys(properties).length) payload.properties = properties;

    return payload;
  }

  /* ---------- state ---------- */
  let state = null;
  const listeners = [];
  let saveTimer = null;

  /* Debounced write-behind queues, one entry per page. */
  const pendingPages = new Map(); // pageId -> { title?, icon?, isFavorite? }
  const pagePatchTimers = new Map();
  const PAGE_PATCH_DELAY = 600;
  const pendingBlocks = new Map(); // pageId -> { patches: Map, order: bool, timer }
  const BLOCK_PATCH_DELAY = 600;

  const EMPTY_WORKSPACE = { _id: null, name: "Lumen", icon: "\u25C8", role: null };
  const EMPTY_USER = { _id: null, name: "", email: "", avatar: null, username: "" };

  function buildInitial() {
    const saved = loadPrefs();
    return {
      app: clone(window.LumenData.app),
      settings: Object.assign({}, clone(window.LumenData.defaultSettings), saved.settings),
      user: clone(EMPTY_USER),
      workspace: clone(EMPTY_WORKSPACE),
      workspaces: [],
      members: [],
      pages: [],
      recent: Array.isArray(saved.recent) ? saved.recent : [],
      recentSearches: Array.isArray(saved.recentSearches) ? saved.recentSearches : [],
      expanded: saved.expanded && typeof saved.expanded === "object" ? saved.expanded : {},
      currentWorkspaceId: saved.currentWorkspaceId || null,
      view: saved.view || "dashboard",
      currentPageId: null,
      loggedIn: false,
      loading: false,
    };
  }

  /* ---------- local preferences (never the user's content) ---------- */
  function loadPrefs() {
    try {
      const raw = localStorage.getItem(PREFS_KEY);
      return raw ? JSON.parse(raw) || {} : {};
    } catch (e) {
      return {};
    }
  }

  function savePrefs() {
    try {
      localStorage.setItem(
        PREFS_KEY,
        JSON.stringify({
          settings: state.settings,
          recent: state.recent,
          recentSearches: state.recentSearches,
          expanded: state.expanded,
          currentWorkspaceId: state.currentWorkspaceId,
          view: state.view,
        })
      );
    } catch (e) {
      /* storage unavailable — the app still works, it just forgets preferences */
    }
  }

  /** Kept for callers that just want preferences flushed (theme, prefs toggles). */
  function save() {
    savePrefs();
  }

  function saveDebounced() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(savePrefs, 300);
  }

  function commit(reason) {
    savePrefs();
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

  /* ============================================================
     Session
     ============================================================ */
  function currentWorkspaceId() {
    return state.currentWorkspaceId;
  }

  /**
   * Restore a session from the stored token. Called once on boot; resolves to
   * false (and clears the token) if the token is no longer valid.
   */
  async function loadSession() {
    if (!api.getToken()) {
      clearSession();
      return false;
    }

    state.loading = true;
    try {
      const data = await api.auth.me();
      state.user = Object.assign({}, EMPTY_USER, data.user);
      state.workspaces = data.workspaces || [];
      if (!state.workspaces.length) {
        clearSession();
        return false;
      }
      const chosen =
        state.workspaces.find((w) => w._id === state.currentWorkspaceId) || state.workspaces[0];
      state.currentWorkspaceId = chosen._id;
      state.workspace = chosen;
      state.loggedIn = true;
      await loadWorkspacePages();
      return true;
    } catch (err) {
      if (err.status === 401) {
        api.setToken(null);
        clearSession();
        return false;
      }
      // The server is unreachable or errored: keep the token, but show an
      // empty workspace rather than pretending the user is signed out.
      state.loggedIn = true;
      state.loading = false;
      toast(err.message, "error");
      return true;
    } finally {
      state.loading = false;
    }
  }

  function clearSession() {
    state.user = clone(EMPTY_USER);
    state.workspaces = [];
    state.workspace = clone(EMPTY_WORKSPACE);
    state.members = [];
    state.pages = [];
    state.currentWorkspaceId = null;
    state.loggedIn = false;
    state.view = "dashboard";
    state.currentPageId = null;
    state.recent = [];
  }

  /** Adopt the session returned by register/login. */
  function adoptSession(payload) {
    state.user = Object.assign({}, EMPTY_USER, payload.user);
    state.workspaces = payload.workspaces || [];
    const chosen = state.workspaces[0] || null;
    state.currentWorkspaceId = chosen ? chosen._id : null;
    state.workspace = chosen || clone(EMPTY_WORKSPACE);
    state.loggedIn = true;
    state.recent = [];
    state.currentPageId = null;
    // Pages are loaded by the caller via refreshPages() so login/register make
    // exactly one list request instead of two.
  }

  async function switchWorkspace(workspaceId) {
    if (state.currentWorkspaceId === workspaceId) return;
    state.currentWorkspaceId = workspaceId;
    state.recent = [];
    state.currentPageId = null;
    state.view = "dashboard";
    flushAll();
    await loadWorkspacePages();
    commit("pages");
  }

  async function loadWorkspacePages() {
    const workspaceId = state.currentWorkspaceId;
    if (!workspaceId) return;
    const data = await api.pages.list(workspaceId, { includeArchived: true });
    state.pages = (data.pages || []).map(normalizePage);
    state.recent = state.recent.filter((id) => state.pages.some((p) => p.id === id));
    loadMembers(workspaceId);
  }

  function loadMembers(workspaceId) {
    if (!workspaceId) return;
    api.workspaces
      .members(workspaceId)
      .then((data) => {
        if (state.currentWorkspaceId !== workspaceId) return;
        state.members = (data.members || []).map((m) => ({
          id: m._id,
          role: m.role,
          name: m.user ? m.user.name : "Unknown",
          email: m.user ? m.user.email : "",
          avatar: m.user ? m.user.avatar : null,
        }));
      })
      .catch(() => {
        /* members are decoration; a failure here shouldn't break the app */
      });
  }

  function renameWorkspace(name) {
    const workspaceId = state.currentWorkspaceId;
    if (!workspaceId) return Promise.resolve();
    return api.workspaces
      .update(workspaceId, { name: name })
      .then((data) => {
        state.workspace = data.workspace;
        state.workspaces = state.workspaces.map((w) => (w._id === workspaceId ? data.workspace : w));
        commit("workspace");
      })
      .catch((err) => toast(err.message, "error"));
  }

  /** Create a workspace and make it the active one. */
  async function createWorkspace(name) {
    const data = await api.workspaces.create({ name: name, icon: "\u25C8" });
    state.workspaces = [data.workspace].concat(state.workspaces || []);
    await switchWorkspace(data.workspace._id);
    return data.workspace;
  }

  /**
   * Delete a workspace (owner only). Falls back to another workspace, or clears
   * the session when it was the user's last one.
   */
  async function deleteWorkspace(workspaceId) {
    const id = workspaceId || state.currentWorkspaceId;
    if (!id) return;
    await api.workspaces.remove(id);
    state.workspaces = (state.workspaces || []).filter((w) => w._id !== id);
    if (state.currentWorkspaceId === id) {
      const next = state.workspaces[0];
      if (next) {
        state.currentWorkspaceId = null;
        await switchWorkspace(next._id);
      } else {
        clearSession();
        commit("workspace");
      }
    } else {
      commit("workspace");
    }
  }

  /* ---------- members ---------- */
  function reloadMembers() {
    const workspaceId = state.currentWorkspaceId;
    if (!workspaceId) return Promise.resolve([]);
    return api.workspaces
      .members(workspaceId)
      .then((data) => {
        state.members = (data.members || []).map((m) => ({
          id: m._id,
          role: m.role,
          name: m.user ? m.user.name : "Unknown",
          email: m.user ? m.user.email : "",
          avatar: m.user ? m.user.avatar : null,
        }));
        commit("members");
        return state.members;
      });
  }

  function addMember(email, role) {
    const workspaceId = state.currentWorkspaceId;
    if (!workspaceId) return Promise.reject(new Error("No workspace selected"));
    return api.workspaces.addMember(workspaceId, { email: email, role: role }).then(() => reloadMembers());
  }

  function updateMemberRole(memberId, role) {
    const workspaceId = state.currentWorkspaceId;
    if (!workspaceId) return Promise.reject(new Error("No workspace selected"));
    return api.workspaces
      .updateMember(workspaceId, memberId, role)
      .then(() => reloadMembers());
  }

  function removeMember(memberId) {
    const workspaceId = state.currentWorkspaceId;
    if (!workspaceId) return Promise.reject(new Error("No workspace selected"));
    return api.workspaces.removeMember(workspaceId, memberId).then(() => reloadMembers());
  }

  /* ============================================================
     Accessors (all synchronous — they read the local cache)
     ============================================================ */
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
    return state.pages.filter((p) => p.parentId === id && !p.isArchived);
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

  /** Path from the root page down to the given page (for breadcrumbs). */
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
    return state.pages.filter((p) => p.favorite && !p.isArchived);
  }

  function getTopLevelPages() {
    return state.pages.filter((p) => !p.parentId && !p.isArchived);
  }

  function getSiblings(id) {
    const page = getPage(id);
    if (!page) return [];
    return getChildren(page.parentId);
  }

  /* ============================================================
     Tree expansion is pure UI state, so it lives in preferences.
     ============================================================ */
  function isExpanded(id) {
    return !!state.expanded[id];
  }

  function setExpanded(id, open) {
    if (open) state.expanded[id] = true;
    else delete state.expanded[id];
    saveDebounced();
  }

  /* ============================================================
     Pages
     ============================================================ */
  function applyServerPage(doc) {
    const normalized = normalizePage(doc);
    const idx = state.pages.findIndex((p) => p.id === normalized.id);
    if (idx === -1) state.pages.push(normalized);
    else {
      // Keep the block cache: the page list endpoint does not return blocks.
      const existing = state.pages[idx];
      state.pages[idx] = Object.assign({}, normalized, {
        blocks: existing.blocks,
        blocksLoaded: existing.blocksLoaded,
      });
    }
    return getPage(normalized.id);
  }

  function defaultBlocksFor(type) {
    const block = { id: uid("blk"), type: type || "text", content: "" };
    if (type === "callout") block.icon = "\uD83D\uDCA1";
    if (type === "todo") block.checked = false;
    if (type === "image") block.caption = "";
    return block;
  }

  /**
   * Create a page. Resolves with the saved page so the caller can navigate to
   * it; the server id is only known after the round trip.
   */
  async function createPage(opts) {
    const o = opts || {};
    const workspaceId = state.currentWorkspaceId;
    if (!workspaceId) throw new Error("No workspace selected");

    const data = await api.pages.create(workspaceId, {
      title: o.title || "",
      icon: o.icon || "\uD83D\uDCDD",
      parentPageId: o.parentId || null,
      isFavorite: !!o.favorite,
    });
    const page = applyServerPage(data.page);

    if (o.parentId) setExpanded(o.parentId, true);

    // Seed content (templates, imports) is written block by block afterwards
    // so the page exists first and each block keeps its position.
    const seed = Array.isArray(o.blocks) ? o.blocks : [];
    if (seed.length) {
      page.blocks = seed.map((b) => Object.assign({}, b, { id: b.id || uid("blk") }));
      page.blocksLoaded = true;

      // A database block is only a pointer to a dataTable document, so a
      // template's table has to be created before the block that references it.
      // Sequential so the ordering of the page is the ordering of the writes.
      for (let i = 0; i < page.blocks.length; i += 1) {
        const block = page.blocks[i];
        if (block.type !== "database" && block.type !== "table") continue;
        if (block.dataTableId) continue;
        const spec = block.database;
        try {
          const dataTable = await createDataTable(page.id, {
            name: (spec && spec.name) || block.content || "New database",
            description: (spec && spec.description) || "",
            properties: spec && spec.properties,
            rows: spec && spec.rows,
            defaultView: (spec && spec.defaultView) || "table",
          });
          block.dataTableId = dataTable._id;
        } catch (err) {
          toast(err.message, "error");
        }
      }

      await Promise.all(
        page.blocks.map((block, i) =>
          createBlockRemote(page.id, block, i).catch(() => null)
        )
      );
    }

    mutate((s) => {
      s.view = "page";
      s.currentPageId = page.id;
      s.recent = touchRecent(s.recent, page.id);
    }, "pages");

    return page;
  }

  /** Optimistic local rename/icon/favorite change; the API is updated after. */
  function updatePage(id, patch, reason) {
    const page = getPage(id);
    if (!page) return;

    const remote = {};
    if (patch.title !== undefined) remote.title = patch.title;
    if (patch.icon !== undefined) remote.icon = patch.icon;
    if (patch.favorite !== undefined) remote.isFavorite = patch.favorite;
    if (patch.cover !== undefined) remote.cover = patch.cover;

    Object.assign(page, patch);
    page.updatedAt = new Date().toISOString();
    commit(reason || "rename");

    if (Object.keys(remote).length) queuePagePatch(id, remote);
  }

  function queuePagePatch(id, patch) {
    const entry = pendingPages.get(id) || Object.assign({}, pendingPages.get(id));
    Object.assign(entry, patch);
    pendingPages.set(id, entry);

    clearTimeout(pagePatchTimers.get(id));
    pagePatchTimers.set(
      id,
      setTimeout(() => flushPagePatch(id), PAGE_PATCH_DELAY)
    );
  }

  function flushPagePatch(id) {
    const patch = pendingPages.get(id);
    pendingPages.delete(id);
    clearTimeout(pagePatchTimers.get(id));
    if (!patch) return Promise.resolve();

    return api.pages
      .update(id, patch)
      .then((data) => {
        const page = getPage(id);
        if (!page) return;
        if (patch.title !== undefined) page.title = data.page.title;
        if (patch.icon !== undefined) page.icon = data.page.icon;
        page.favorite = !!data.page.isFavorite;
        page.updatedAt = data.page.updatedAt;
        commit("meta");
      })
      .catch((err) => toast(err.message, "error"));
  }

  function toggleFavorite(id) {
    const page = getPage(id);
    if (!page) return false;
    const next = !page.favorite;
    updatePage(id, { favorite: next }, "favorites");
    return next;
  }

  function updatePageIcon(id, icon) {
    updatePage(id, { icon: icon }, "icon");
  }

  /* ---------- trash lifecycle ---------- */

  /** Archive a page. The server archives the whole subtree. */
  function moveToTrash(id) {
    const page = getPage(id);
    if (!page || page.isArchived) return Promise.resolve();

    const ids = [id].concat(getDescendantIds(id));
    const stamp = new Date().toISOString();
    mutate((s) => {
      ids.forEach((pid) => {
        const p = s.pages.find((x) => x.id === pid);
        if (p) {
          p.isArchived = true;
          p.archivedAt = stamp;
        }
      });
      s.recent = s.recent.filter((r) => !ids.includes(r));
      if (ids.includes(s.currentPageId)) {
        s.view = "dashboard";
        s.currentPageId = null;
      }
    }, "trash");

    return api.pages
      .update(id, { isArchived: true })
      .then(() => api.pages.list(state.currentWorkspaceId, { includeArchived: true }))
      .then((data) => {
        state.pages = (data.pages || []).map(normalizePage);
        commit("trash");
      })
      .catch((err) => {
        toast(err.message, "error");
        return loadWorkspacePages().then(() => commit("trash"));
      });
  }

  function restorePage(id) {
    const page = getPage(id);
    if (!page || !page.isArchived) return Promise.resolve();

    const ids = [id].concat(getDescendantIds(id));
    mutate((s) => {
      ids.forEach((pid) => {
        const p = s.pages.find((x) => x.id === pid);
        if (p) {
          p.isArchived = false;
          p.archivedAt = null;
        }
      });
    }, "trash");

    return refreshPages().catch((err) => toast(err.message, "error"));
  }

  /** Hard delete: the server removes the subtree, its blocks and its tables. */
  function deletePage(id) {
    return api.pages
      .remove(id)
      .then(() => {
        const ids = [id].concat(getDescendantIds(id));
        mutate((s) => {
          s.pages = s.pages.filter((p) => !ids.includes(p.id));
          s.recent = s.recent.filter((r) => !ids.includes(r));
          if (ids.includes(s.currentPageId)) {
            s.view = "dashboard";
            s.currentPageId = null;
          }
        }, "pages");
      })
      .catch((err) => {
        toast(err.message, "error");
        throw err;
      });
  }

  function deletePagePermanently(id) {
    return deletePage(id);
  }

  function emptyTrash() {
    const roots = getTrashPages();
    if (!roots.length) return Promise.resolve();
    return Promise.all(roots.map((p) => deletePage(p.id).catch(() => null))).then(() => commit("trash"));
  }

  /** Trashed pages whose parent is not itself trashed. */
  function getTrashPages() {
    return state.pages.filter(
      (p) => p.isArchived && !(p.parentId && getPage(p.parentId) && getPage(p.parentId).isArchived)
    );
  }

  async function duplicatePage(id) {
    const data = await api.pages.duplicate(id);
    const copy = applyServerPage(data.page);
    mutate((s) => {
      s.view = "page";
      s.currentPageId = copy.id;
      s.recent = touchRecent(s.recent, copy.id);
    }, "pages");
    return copy;
  }

  /** Move a page to a new parent (null = top level), appended last. */
  function movePage(id, parentId, beforeId) {
    const page = getPage(id);
    if (!page) return Promise.resolve();
    if (parentId === id || (parentId && getDescendantIds(id).includes(parentId))) {
      return Promise.resolve(); // cannot nest a page inside itself
    }

    const siblingsBefore = getSiblings(id);
    const from = state.pages.indexOf(page);
    page.parentId = parentId || null;

    // Recompute the sibling order locally, then mirror it to the server as
    // explicit positions so both sides agree.
    const siblings = getChildren(page.parentId).filter((p) => p.id !== id);
    if (beforeId) {
      const at = siblings.findIndex((p) => p.id === beforeId);
      if (at !== -1) siblings.splice(at, 0, page);
      else siblings.push(page);
    } else {
      siblings.push(page);
    }
    siblings.forEach((p, i) => {
      p.position = i;
    });

    mutate((s) => {
      const idx = s.pages.findIndex((p) => p.id === id);
      if (idx !== -1) s.pages.splice(idx, 1);
      s.pages.push(page);
      if (parentId) setExpanded(parentId, true);
    }, "pages");

    const position = siblings.findIndex((p) => p.id === id);
    return api.pages
      .update(id, { parentPageId: page.parentId, position: position })
      .then(() => {
        siblings.forEach((p, i) => {
          if (p.id === id) return;
          if (siblingsBefore.some((b) => b.id === p.id)) return;
          queuePagePatch(p.id, { position: i });
        });
      })
      .catch((err) => {
        toast(err.message, "error");
        return refreshPages();
      });
  }

  function refreshPages() {
    const workspaceId = state.currentWorkspaceId;
    if (!workspaceId) return Promise.resolve();
    return api.pages
      .list(workspaceId, { includeArchived: true })
      .then((data) => {
        state.pages = (data.pages || []).map(normalizePage);
        loadMembers(workspaceId);
        commit("pages");
      })
      .catch((err) => {
        toast(err.message, "error");
      });
  }

  /* ============================================================
     Blocks

     Blocks live in their own collection, so they are fetched per page on
     demand. Edits are queued per page and flushed together: one PATCH per
     touched block, plus a single reorder when the order changed.
     ============================================================ */
  function queueFor(pageId) {
    let entry = pendingBlocks.get(pageId);
    if (!entry) {
      entry = { patches: new Map(), order: false, timer: null };
      pendingBlocks.set(pageId, entry);
    }
    return entry;
  }

  function scheduleFlush(pageId) {
    const entry = queueFor(pageId);
    clearTimeout(entry.timer);
    entry.timer = setTimeout(() => flushPage(pageId), BLOCK_PATCH_DELAY);
  }

  /** Send every queued change for a page. */
  async function flushPage(pageId) {
    const entry = pendingBlocks.get(pageId);
    if (!entry) return;
    clearTimeout(entry.timer);
    pendingBlocks.delete(pageId);

    const page = getPage(pageId);
    if (!page) return;

    const jobs = [];
    entry.patches.forEach((payload, localId) => {
      const block = page.blocks.find((b) => b.id === localId);
      if (!block) return;
      // Wait for the block's creation POST so a patch can never overtake it.
      const ready = block._creating ? block._creating.catch(() => null) : Promise.resolve();
      jobs.push(
        ready.then(() => {
          const id = apiId(block);
          return id ? api.blocks.update(id, payload) : null;
        })
      );
    });

    if (entry.order) {
      jobs.push(
        Promise.all(
          page.blocks.map((b) => (b._creating ? b._creating.catch(() => null) : Promise.resolve()))
        )
          .then(() => {
            const ids = page.blocks.map(apiId).filter(Boolean);
            return ids.length ? api.blocks.reorder(pageId, ids) : null;
          })
      );
    }

    try {
      await Promise.all(jobs);
    } catch (err) {
      toast(err.message, "error");
    }
  }

  function flushAll() {
    Array.from(pendingBlocks.keys()).forEach((id) => flushPage(id));
    Array.from(pendingPages.keys()).forEach((id) => flushPagePatch(id));
  }

  /** Create one block remotely and remember its server id. */
  function createBlockRemote(pageId, block, position) {
    const creating = api.blocks
      .create(pageId, toApiPayload(block, position))
      .then((data) => {
        block.serverId = data.block._id;
        if (data.block.position !== undefined) block.position = data.block.position;
        return data.block;
      })
      .catch((err) => {
        toast(err.message, "error");
        throw err;
      });
    block._creating = creating;
    return creating;
  }

  function getPageBlocks(id) {
    const page = getPage(id);
    return page ? page.blocks : [];
  }

  /** Load (or reload) a page's blocks. Safe to call repeatedly. */
  async function hydratePage(id) {
    const page = getPage(id);
    if (!page) return null;
    if (page.blocksLoaded && !page._stale) return page;
    try {
      const data = await api.blocks.list(id);
      page.blocks = (data.blocks || []).map(normalizeBlock);
      page.blocksLoaded = true;
      page._stale = false;
    } catch (err) {
      page.blocksLoaded = true; // don't retry forever on a dead page
      toast(err.message, "error");
    }
    return page;
  }

  function markPageStale(id) {
    const page = getPage(id);
    if (page) page._stale = true;
  }

  /** Optimistic text/flag change on one block. */
  function updateBlock(id, blockId, patch) {
    const page = getPage(id);
    if (!page) return;
    const block = page.blocks.find((b) => b.id === blockId);
    if (!block) return;

    Object.assign(block, patch);
    page.updatedAt = new Date().toISOString();

    const payload = {};
    if (patch.content !== undefined) payload.content = { text: patch.content };

    // Per-type extras travel in `properties`, which is what the server merges
    // into the block and what normalizeBlock reads back.
    const properties = {};
    if (patch.checked !== undefined) properties.checked = !!patch.checked;
    if (patch.icon !== undefined) properties.icon = patch.icon;
    if (patch.caption !== undefined) properties.caption = patch.caption;
    if (patch.language !== undefined) properties.language = patch.language;
    if (patch.dataTableId !== undefined) properties.dataTableId = patch.dataTableId;
    if (Object.keys(properties).length) payload.properties = properties;

    if (Object.keys(payload).length) {
      queueFor(id).patches.set(blockId, payload);
      scheduleFlush(id);
    }
    saveDebounced();
  }

  /**
   * Add a block locally at `index`, then create it remotely. The local block is
   * returned synchronously so the editor can keep the DOM it already rendered.
   */
  function addBlock(pageId, type, content, index) {
    const page = getPage(pageId);
    if (!page) return null;

    const block = defaultBlocksFor(type);
    block.content = content || "";
    const i = index === undefined || index === null ? page.blocks.length : index;
    page.blocks.splice(i, 0, block);
    page.updatedAt = new Date().toISOString();

    createBlockRemote(pageId, block, i).catch(() => {
      page.blocks = page.blocks.filter((b) => b.id !== block.id);
    });
    saveDebounced();
    return block;
  }

  function removeBlock(pageId, blockId) {
    const page = getPage(pageId);
    if (!page) return;
    const block = page.blocks.find((b) => b.id === blockId);
    page.blocks = page.blocks.filter((b) => b.id !== blockId);
    queueFor(pageId).patches.delete(blockId);
    scheduleFlush(pageId);
    saveDebounced();

    const id = block ? apiId(block) : null;
    if (id) {
      const ready = block._creating ? block._creating.catch(() => null) : Promise.resolve();
      ready.then(() => api.blocks.remove(id)).catch((err) => toast(err.message, "error"));
    }
  }

  function setBlockType(pageId, blockId, type) {
    const page = getPage(pageId);
    if (!page) return;
    const block = page.blocks.find((b) => b.id === blockId);
    if (!block) return;

    block.type = type;
    if (type === "todo" && block.checked === undefined) block.checked = false;
    if (type === "callout" && !block.icon) block.icon = "\uD83D\uDCA1";

    queueFor(pageId).patches.set(blockId, { type: toApiType(type) });
    scheduleFlush(pageId);
    saveDebounced();
  }

  function moveBlockIndex(pageId, fromIdx, toIdx) {
    const page = getPage(pageId);
    if (!page || fromIdx === toIdx) return;
    const blocks = page.blocks;
    if (fromIdx < 0 || fromIdx >= blocks.length || toIdx < 0 || toIdx > blocks.length) return;
    const [moved] = blocks.splice(fromIdx, 1);
    blocks.splice(toIdx, 0, moved);
    queueFor(pageId).order = true;
    scheduleFlush(pageId);
    saveDebounced();
  }

  /* ============================================================
     Data tables

     A kanban board, calendar, roadmap and table are four views over one
     dataTable document, so this is a single set of helpers.
     ============================================================ */
  function listDataTables(pageId) {
    return api.dataTables
      .listForPage(pageId)
      .then((data) => data.dataTables || [])
      .catch((err) => {
        toast(err.message, "error");
        return [];
      });
  }

  function getDataTable(id) {
    // Unwrap the envelope like every other data-table helper. Returning the raw
    // { dataTable } payload here left callers reading `._id` off the envelope,
    // which produced /data-tables/undefined and wiped property saves.
    return api.dataTables.get(id).then((data) => data.dataTable);
  }

  function updateDataTable(id, patch) {
    return api.dataTables.update(id, patch).then((data) => data.dataTable);
  }

  function createDataTable(pageId, payload) {
    return api.dataTables.create(pageId, payload).then((data) => data.dataTable);
  }

  function deleteDataTable(id) {
    return api.dataTables.remove(id);
  }

  function addDataTableRow(id, values) {
    return api.dataTables.addRow(id, values).then((data) => data.row);
  }

  function updateDataTableRow(id, rowId, values) {
    return api.dataTables.updateRow(id, rowId, values).then((data) => data.row);
  }

  function deleteDataTableRow(id, rowId) {
    return api.dataTables.deleteRow(id, rowId);
  }

  /* ============================================================
     Navigation
     ============================================================ */
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
  }

  /* ---------- recents & activity ---------- */
  function touchRecent(list, id) {
    return [id].concat(list.filter((x) => x !== id)).slice(0, 6);
  }

  function setRecent(id) {
    mutate((s) => {
      s.recent = touchRecent(s.recent, id);
    }, "recent");
  }

  /**
   * The inbox is derived from the pages collection — there is no notifications
   * collection, so "activity" is simply what changed most recently.
   */
  function getActivity() {
    return state.pages
      .filter((p) => !p.isArchived)
      .slice()
      .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))
      .slice(0, 25)
      .map((p) => ({
        id: p.id,
        pageId: p.id,
        icon: p.icon,
        title: p.title || "Untitled",
        group: p.parentId ? "Nested pages" : "Top level",
        time: p.updatedAt,
      }));
  }

  /* ============================================================
     Search

     Titles and block text live in two collections, so a search is two
     parallel requests merged by page.
     ============================================================ */
  async function searchPages(query) {
    const q = String(query || "").trim();
    const workspaceId = state.currentWorkspaceId;
    if (!q || !workspaceId) return [];

    const [pageHits, blockHits] = await Promise.all([
      api.pages.search(workspaceId, q).catch(() => ({ pages: [] })),
      api.blocks.search(workspaceId, q).catch(() => ({ results: [] })),
    ]);

    // Make sure anything the server knows about is in the local tree.
    (pageHits.pages || []).forEach((doc) => {
      if (!getPage(doc._id)) applyServerPage(doc);
    });

    const byPage = new Map();
    (pageHits.pages || []).forEach((doc) => {
      byPage.set(String(doc._id), { page: getPage(doc._id), snippet: doc.title || "" });
    });
    (blockHits.results || []).forEach((hit) => {
      const key = String(hit.pageId);
      if (byPage.has(key)) {
        if (hit.snippet) byPage.get(key).snippet = hit.snippet;
        return;
      }
      let page = getPage(hit.pageId);
      if (!page) {
        const docs = (pageHits.pages || []).filter((d) => String(d._id) === key);
        if (docs.length) page = applyServerPage(docs[0]);
      }
      if (page) byPage.set(key, { page: page, snippet: hit.snippet || "" });
    });

    return Array.from(byPage.values()).filter((r) => r.page);
  }

  function addRecentSearch(query) {
    const q = String(query || "").trim();
    if (!q) return;
    mutate((s) => {
      s.recentSearches = [q].concat(
        (s.recentSearches || []).filter((x) => x.toLowerCase() !== q.toLowerCase())
      ).slice(0, 8);
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

  /* ============================================================
     Events
     ============================================================ */
  function onChange(fn) {
    listeners.push(fn);
    return () => {
      const i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    };
  }

  /* ============================================================
     Init
     ============================================================ */
  state = buildInitial();

  // Flush anything still queued when the tab goes away, so a quick close
  // after typing doesn't lose the last few characters.
  window.addEventListener("beforeunload", flushAll);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushAll();
  });

  window.Lumen = window.Lumen || {};
  window.Lumen.store = {
    // session
    loadSession,
    adoptSession,
    clearSession,
    switchWorkspace,
    renameWorkspace,
    createWorkspace,
    deleteWorkspace,
    reloadMembers,
    addMember,
    updateMemberRole,
    removeMember,
    currentWorkspaceId,
    // accessors
    getState,
    getPage,
    getChildren,
    getDescendantIds,
    getPath,
    getFavorites,
    getTopLevelPages,
    getSiblings,
    pagesById,
    isExpanded,
    setExpanded,
    // pages
    getPageBlocks,
    hydratePage,
    markPageStale,
    createPage,
    updatePage,
    updatePageIcon,
    toggleFavorite,
    moveToTrash,
    restorePage,
    deletePage,
    deletePagePermanently,
    emptyTrash,
    getTrashPages,
    duplicatePage,
    movePage,
    refreshPages,
    // blocks
    updateBlock,
    addBlock,
    removeBlock,
    setBlockType,
    moveBlockIndex,
    flushPage,
    flushAll,
    // data tables
    listDataTables,
    getDataTable,
    updateDataTable,
    createDataTable,
    deleteDataTable,
    addDataTableRow,
    updateDataTableRow,
    deleteDataTableRow,
    // navigation
    navigate,
    setView,
    setLoggedIn,
    // activity, recents, search
    getActivity,
    setRecent,
    searchPages,
    addRecentSearch,
    clearRecentSearches,
    getRecentSearches,
    updateUser,
    onChange,
    save,
    uid,
    clone,
  };
})();
