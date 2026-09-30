/* ============================================================
   Lumen — sidebar: workspace header, nav, favorites, and the
   hierarchical page tree with expand/collapse, rename, drag,
   hover actions, and a context menu.
   ============================================================ */

(function () {
  "use strict";

  const { store, ui } = window.Lumen;

  let sidebarEl, treeEl, favEl, scrollEl, workspaceBtn, navEl, addFooterBtn;

  /* ---------- open helpers (delegated to app) ---------- */
  function openPage(id) {
    window.Lumen.app && window.Lumen.app.openPage(id);
  }
  function navigate(view) {
    window.Lumen.app && window.Lumen.app.navigate(view);
  }

  /* ---------- render nav ---------- */
  function renderNav() {
    const state = store.getState();
    navEl.innerHTML =
      '<button class="sidebar-nav-item" data-nav="home">' +
      ui.icon("home") +
      '<span class="sidebar-nav-item-label">Home</span></button>' +
      '<button class="sidebar-nav-item" data-nav="search" aria-label="Search">' +
      ui.icon("search") +
      '<span class="sidebar-nav-item-label">Search</span></button>' +
      '<button class="sidebar-nav-item" data-nav="inbox">' +
      ui.icon("inbox") +
      '<span class="sidebar-nav-item-label">Activity</span></button>' +
      '<button class="sidebar-nav-item" data-nav="trash">' +
      ui.icon("trash") +
      '<span class="sidebar-nav-item-label">Trash</span></button>' +
      '<button class="sidebar-nav-item" data-nav="settings">' +
      ui.icon("settings") +
      '<span class="sidebar-nav-item-label">Settings</span></button>';

    const activeNav =
      state.view === "dashboard"
        ? "home"
        : state.view === "inbox"
          ? "inbox"
          : state.view === "trash"
            ? "trash"
            : state.view === "settings"
              ? "settings"
              : state.view === "search"
                ? "search"
                : null;
    navEl.querySelectorAll("[data-nav]").forEach((b) => {
      if (b.dataset.nav === activeNav) b.dataset.active = "true";
    });
  }

  /* ---------- page tree ---------- */
  function renderTree(container, parentId, depth) {
    const children = store.getChildren(parentId);
    const state = store.getState();
    container.textContent = "";

    if (!children.length) {
      if (parentId === null) {
        const empty = document.createElement("div");
        empty.className = "sidebar-empty";
        empty.textContent = "No pages yet. Add one below.";
        container.appendChild(empty);
      }
      return;
    }

    children.forEach((page) => {
      const hasChildren = store.getChildren(page.id).length > 0;
      const isOpen = store.isExpanded(page.id);
      const isActive = state.view === "page" && state.currentPageId === page.id;

      const wrap = document.createElement("div");
      wrap.className = "page-row-wrap";
      wrap.dataset.id = page.id;

      wrap.innerHTML =
        '<div class="page-row" data-page-row data-id="' +
        page.id +
        '" style="padding-left:' +
        (depth * 14 + 4) +
        'px" draggable="true">' +
        (hasChildren
          ? '<button class="page-caret ' +
            (isOpen ? "is-open" : "") +
            '" data-caret aria-label="' +
            (isOpen ? "Collapse" : "Expand") +
            '">' +
            ui.icon("chevron-right") +
            "</button>"
          : '<span class="page-chevron-spacer"></span>') +
        '<span class="page-icon">' +
        ui.escapeHtml(page.icon || "\uD83D\uDCDD") +
        "</span>" +
        '<span class="page-title" data-title>' +
        ui.escapeHtml(page.title || "Untitled") +
        "</span>" +
        '<div class="page-actions">' +
        '<button class="page-action page-star" data-star data-active="' +
        (page.favorite ? "true" : "false") +
        '" aria-label="Toggle favorite">' +
        ui.icon(page.favorite ? "starFilled" : "star") +
        "</button>" +
        '<button class="page-action" data-add aria-label="Add subpage">' +
        ui.icon("plus") +
        "</button>" +
        '<button class="page-action" data-more aria-label="More actions">' +
        ui.icon("more") +
        "</button>" +
        "</div></div>";

      const row = wrap.querySelector(".page-row");
      row.dataset.active = isActive ? "true" : "false";
      container.appendChild(wrap);

      if (hasChildren) {
        const childrenEl = document.createElement("div");
        childrenEl.className = "page-children" + (isOpen ? "" : " is-collapsed");
        wrap.appendChild(childrenEl);
        renderTree(childrenEl, page.id, depth + 1);
      }

      attachRowEvents(wrap, page);
      attachDrag(row);
    });
  }

  function attachRowEvents(wrap, page) {
    const row = wrap.querySelector(".page-row");
    const id = page.id;

    // open page (single click); ignore the 2nd click of a double-click so rename works
    row.addEventListener("click", (e) => {
      if (e.target.closest("button") || e.target.closest("input")) return;
      const now = Date.now();
      if (row._lastClick && now - row._lastClick < 320) {
        row._lastClick = now;
        return;
      }
      row._lastClick = now;
      openPage(id);
    });

    // caret: expand/collapse
    const caret = wrap.querySelector("[data-caret]");
    if (caret) {
      caret.addEventListener("click", (e) => {
        e.stopPropagation();
        store.setExpanded(id, !store.isExpanded(id));
        renderAll();
      });
    }

    // favorite
    wrap.querySelector("[data-star]").addEventListener("click", (e) => {
      e.stopPropagation();
      const now = store.toggleFavorite(id);
      ui.showToast(now ? "Added to favorites" : "Removed from favorites", "success");
    });

    // add subpage
    wrap.querySelector("[data-add]").addEventListener("click", async (e) => {
      e.stopPropagation();
      const p = await store.createPage({ parentId: id });
      ui.showToast("Page created", "success");
      openPage(p.id);
    });

    // context menu
    wrap.querySelector("[data-more]").addEventListener("click", (e) => {
      e.stopPropagation();
      const r = e.currentTarget.getBoundingClientRect();
      openPageMenu(id, page, r.left, r.bottom + 4);
    });

    // double click → rename
    row.addEventListener("dblclick", (e) => {
      if (e.target.closest("button")) return;
      startRename(wrap, page);
    });
  }

  function openPageMenu(id, page, x, y) {
    const fav = page.favorite;
    const items = [
      { label: "Open", icon: "external", action: () => openPage(id) },
      {
        label: fav ? "Remove from Favorites" : "Add to Favorites",
        icon: "star",
        action: () => {
          const now = store.toggleFavorite(id);
          ui.showToast(now ? "Added to favorites" : "Removed from favorites");
        },
      },
      { label: "Rename", icon: "pencil", action: () => startRenameOnMenu(id) },
      {
        label: "Duplicate",
        icon: "copy",
        action: async () => {
          const c = await store.duplicatePage(id);
          ui.showToast("Page duplicated", "success");
          openPage(c.id);
        },
      },
      {
        label: "Move to",
        icon: "folder-plus",
        caret: true,
        items: buildMoveItems(id),
      },
      { sep: true },
      {
        label: "Move to trash",
        icon: "trash",
        danger: true,
        action: () => {
          const confirmFirst = store.getState().settings.confirmDelete;
          const doDelete = () => {
            store.moveToTrash(id);
            ui.showToast("Page moved to trash", "info");
          };
          if (!confirmFirst) {
            doDelete();
            return;
          }
          ui.confirmDialog({
            title: "Move to trash?",
            message:
              'This will move "<span class="confirm-name">' +
              ui.escapeHtml(page.title || "Untitled") +
              '</span>" and any nested pages to trash.',
            confirmLabel: "Move to trash",
            danger: true,
          }).then((ok) => {
            if (ok) doDelete();
          });
        },
      },
    ];
    ui.openMenu({ x, y, items });
  }

  function buildMoveItems(id) {
    const page = store.getPage(id);
    if (!page) return [];
    const state = store.getState();
    const blocked = new Set([id].concat(store.getDescendantIds(id)));
    const items = [
      {
        label: "Top level",
        icon: "folder",
        checked: !page.parentId,
        action: () => {
          store.movePage(id, null, null);
          ui.showToast("Page moved", "success");
        },
      },
    ];
    state.pages
      .filter((p) => !blocked.has(p.id) && !p.isArchived)
      .forEach((p) => {
        items.push({
          label: p.title || "Untitled",
          icon: "folder",
          checked: p.id === page.parentId,
          action: () => {
            store.movePage(id, p.id, null);
            ui.showToast('Moved to "' + (p.title || "Untitled") + '"', "success");
          },
        });
      });
    return items;
  }

  /* ---------- inline rename ---------- */
  function startRename(wrap, page) {
    const row = wrap.querySelector(".page-row");
    const titleEl = wrap.querySelector("[data-title]");
    const input = document.createElement("input");
    input.className = "page-title-input";
    input.value = page.title || "";
    input.setAttribute("aria-label", "Page name");
    titleEl.replaceWith(input);
    input.focus();
    input.select();
    row.style.cursor = "text";

    let done = false;
    const finish = (save) => {
      if (done) return;
      done = true;
      const value = input.value.trim();
      if (save && value && value !== page.title) {
        store.updatePage(page.id, { title: value });
        ui.showToast("Page renamed", "success");
      }
      renderAll();
    };

    input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") finish(true);
      if (e.key === "Escape") finish(false);
    });
    input.addEventListener("blur", () => finish(true));
  }

  function startRenameOnMenu(id) {
    const wrap = treeEl.querySelector('[data-page-row][data-id="' + id + '"]');
    if (wrap) startRename(wrap.parentElement, store.getPage(id));
  }

  /* ---------- drag & drop reordering / nesting ---------- */
  let draggingId = null;
  let dragPreview = null;

  function attachDrag(row) {
    row.addEventListener("dragstart", (e) => {
      draggingId = row.dataset.id;
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", draggingId);
      row.classList.add("dragging");
      const page = store.getPage(draggingId);
      dragPreview = document.createElement("div");
      dragPreview.className = "drag-preview";
      dragPreview.textContent = page ? page.title || "Untitled" : "";
      document.body.appendChild(dragPreview);
      e.dataTransfer.setDragImage(row, 20, 20);
    });

    row.addEventListener("dragend", () => {
      row.classList.remove("dragging");
      draggingId = null;
      if (dragPreview) {
        dragPreview.remove();
        dragPreview = null;
      }
      clearDropTargets();
    });
  }

  function clearDropTargets() {
    treeEl.querySelectorAll("[data-drop-target]").forEach((el) => {
      delete el.dataset.dropTarget;
    });
  }

  function onTreeDragover(e) {
    if (!draggingId) return;
    const wrap = e.target.closest(".page-row-wrap");
    if (!wrap) {
      clearDropTargets();
      return;
    }
    if (wrap.dataset.id === draggingId) {
      clearDropTargets();
      return;
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const rect = wrap.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const h = rect.height;
    let mode;
    if (y < h * 0.33) mode = "before";
    else if (y > h * 0.66) mode = "after";
    else mode = "inside";

    clearDropTargets();
    wrap.dataset.dropTarget = mode;
  }

  function onTreeDrop(e) {
    if (!draggingId) return;
    e.preventDefault();
    const wrap = e.target.closest(".page-row-wrap");
    if (!wrap) return;
    const targetId = wrap.dataset.id;
    if (targetId === draggingId) return;

    const mode = wrap.dataset.dropTarget || "inside";
    const target = store.getPage(targetId);
    let parentId = null;
    let beforeId = null;

    if (mode === "inside") {
      parentId = targetId;
    } else if (target) {
      parentId = target.parentId;
      if (mode === "after") {
        const sibs = store.getChildren(target.parentId);
        const idx = sibs.findIndex((p) => p.id === targetId);
        const next = sibs[idx + 1];
        beforeId = next ? next.id : null;
      } else {
        beforeId = targetId;
      }
    }

    const moved = store.movePage(draggingId, parentId, beforeId);
    if (moved !== false) ui.showToast("Page moved", "success");
  }

  async function createTopLevelPage() {
    const p = await store.createPage({});
    ui.showToast("Page created", "success");
    openPage(p.id);
  }

  /* ---------- favorites quick list ---------- */
  function renderFavorites() {
    const favs = store.getFavorites();
    if (!favs.length) {
      favEl.textContent = "";
      return;
    }
    favEl.innerHTML = favs
      .map(
        (p) =>
          '<button class="sidebar-fav-item" data-id="' +
          p.id +
          '">' +
          '<span class="page-icon">' +
          ui.escapeHtml(p.icon || "\uD83D\uDCDD") +
          "</span>" +
          '<span class="page-title">' +
          ui.escapeHtml(p.title || "Untitled") +
          "</span>" +
          '<span class="sidebar-fav-star">' +
          ui.icon("starFilled") +
          "</span></button>"
      )
      .join("");
    favEl.querySelectorAll(".sidebar-fav-item").forEach((b) => {
      b.addEventListener("click", () => openPage(b.dataset.id));
      b.querySelector(".sidebar-fav-star").addEventListener("click", (e) => {
        e.stopPropagation();
        store.toggleFavorite(b.dataset.id);
        ui.showToast("Removed from favorites");
      });
    });
  }

  /* ---------- workspace dropdown ---------- */
  function openWorkspaceMenu(btn) {
    const r = btn.getBoundingClientRect();
    const state = store.getState();

    const switcher = state.workspaces
      .filter((w) => w._id !== state.currentWorkspaceId)
      .map((w) => ({
        label: w.name || "Untitled workspace",
        icon: w.icon || "\u25C8",
        action: () => {
          store.switchWorkspace(w._id);
          ui.showToast("Switched to " + (w.name || "workspace"), "success");
        },
      }));

    const items = [];
    if (switcher.length) {
      items.push(
        { label: "Your workspaces", icon: "layers", caret: true, items: switcher },
        { sep: true }
      );
    }
    items.push(
      { label: "Rename workspace", icon: "pencil", action: renameWorkspace },
      { label: "Settings", icon: "settings", action: () => navigate("settings") },
      {
        label: "Theme",
        icon: state.settings.theme === "dark" ? "moon" : "sun",
        caret: true,
        items: [
          { label: "Light", icon: "sun", checked: state.settings.theme === "light", action: () => window.Lumen.theme.setTheme("light") },
          { label: "Dark", icon: "moon", checked: state.settings.theme === "dark", action: () => window.Lumen.theme.setTheme("dark") },
          { label: "System", icon: "monitor", checked: state.settings.theme === "system", action: () => window.Lumen.theme.setTheme("system") },
        ],
      },
      { sep: true },
      { label: "Log out", icon: "logout", danger: true, action: () => window.Lumen.app.logout() }
    );

    ui.openMenu({
      x: r.left,
      y: r.bottom + 4,
      header: { name: state.workspace.name, sub: roleLabel(state.workspace.role) },
      items: items,
    });
  }

  function roleLabel(role) {
    return role ? "You are the " + role : "";
  }

  function renameWorkspace() {
    const state = store.getState();
    const modal = ui.openModal({
      title: "Rename workspace",
      size: "modal-sm",
      body:
        '<div class="field" style="margin:0"><label for="ws-name">Workspace name</label>' +
        '<input id="ws-name" type="text" value="' +
        ui.escapeHtml(state.workspace.name || "") +
        '" /></div>',
      footer:
        '<button class="btn btn-secondary" data-modal-close>Cancel</button>' +
        '<button class="btn btn-primary" data-ws-save>Save</button>',
    });
    const input = modal.querySelector("#ws-name");
    const save = () => {
      const name = input.value.trim();
      if (name && name !== state.workspace.name) store.renameWorkspace(name);
      ui.closeModal();
    };
    modal.querySelector("[data-ws-save]").addEventListener("click", save);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") save();
    });
    requestAnimationFrame(() => {
      input.focus();
      input.select();
    });
  }

  /* ---------- render everything ---------- */
  function renderAll() {
    const state = store.getState();

    // workspace button
    workspaceBtn.innerHTML =
      '<span class="sidebar-ws-icon">' +
      ui.escapeHtml(state.workspace.icon || "\u25C8") +
      "</span>" +
      '<span class="sidebar-ws-name">' +
      ui.escapeHtml(state.workspace.name || "Workspace") +
      "</span>" +
      '<span class="sidebar-ws-caret">' +
      ui.icon("chevron-down") +
      "</span>";

    // profile row
    const profileName = sidebarEl.querySelector("[data-profile-name]");
    const profileAvatar = sidebarEl.querySelector("[data-profile-avatar]");
    if (profileName) profileName.textContent = state.user.name || "";
    if (profileAvatar) profileAvatar.textContent = ui.initials(state.user.name || "");

    renderNav();
    renderFavorites();
    renderTree(treeEl, null, 0);

    // keep scroll position stable
    scrollEl.scrollTop = scrollEl._prevScroll || 0;
  }

  function init() {
    sidebarEl = document.getElementById("sidebar");
    if (!sidebarEl) return;

    // markup lives here so init() can run before app boot
    sidebarEl.innerHTML =
      '<div class="sidebar-inner">' +
      '<button id="sidebar-workspace" class="sidebar-workspace" aria-haspopup="menu"></button>' +
      '<div class="sidebar-scroll">' +
      '<div id="sidebar-nav" class="sidebar-nav"></div>' +
      '<div class="sidebar-section-label">Favorites</div>' +
      '<div id="sidebar-favorites"></div>' +
      '<div class="sidebar-tree-title">' +
      '<span class="sidebar-tree-title-label">Pages</span>' +
      '<button class="sidebar-tree-add" data-add-top aria-label="Add page">' +
      ui.icon("plus") +
      "</button></div>" +
      '<div id="sidebar-tree" class="sidebar-tree"></div>' +
      "</div>" +
      '<div class="sidebar-footer">' +
      '<button id="sidebar-add-page" class="sidebar-add-page">' +
      ui.icon("plus") +
      "<span>New page</span></button>" +
      '<button class="sidebar-profile" data-profile aria-haspopup="menu">' +
      '<span class="avatar" data-profile-avatar></span>' +
      '<span class="sidebar-profile-info">' +
      '<span class="sidebar-profile-name" data-profile-name></span>' +
      '<span class="sidebar-profile-sub">My Profile</span>' +
      "</span>" +
      '<span class="sidebar-profile-caret">' +
      ui.icon("chevron-down") +
      "</span>" +
      "</button>" +
      "</div></div>";

    scrollEl = sidebarEl.querySelector(".sidebar-scroll");
    navEl = sidebarEl.querySelector("#sidebar-nav");
    favEl = sidebarEl.querySelector("#sidebar-favorites");
    treeEl = sidebarEl.querySelector("#sidebar-tree");
    workspaceBtn = sidebarEl.querySelector("#sidebar-workspace");
    addFooterBtn = sidebarEl.querySelector("#sidebar-add-page");

    workspaceBtn.addEventListener("click", () => openWorkspaceMenu(workspaceBtn));

    // nav items
    navEl.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-nav]");
      if (!btn) return;
      const view = btn.dataset.nav;
      navigate(view === "home" ? "dashboard" : view);
    });

    // top-level add
    sidebarEl.querySelector("[data-add-top]").addEventListener("click", createTopLevelPage);
    addFooterBtn.addEventListener("click", createTopLevelPage);

    // profile row → opens the app profile menu
    sidebarEl.querySelector("[data-profile]").addEventListener("click", (e) => {
      const r = e.currentTarget.getBoundingClientRect();
      if (window.Lumen.app && window.Lumen.app.openProfileMenu) {
        window.Lumen.app.openProfileMenu(r.left, r.top - 4);
      }
    });

    // drag & drop on the tree
    treeEl.addEventListener("dragover", onTreeDragover);
    treeEl.addEventListener("drop", onTreeDrop);
    treeEl.addEventListener("dragleave", (e) => {
      if (!treeEl.contains(e.relatedTarget)) clearDropTargets();
    });

    // keep scroll position across re-renders
    scrollEl.addEventListener("scroll", () => {
      scrollEl._prevScroll = scrollEl.scrollTop;
    });

    // re-render on store changes
    store.onChange((reason) => {
      if (
        reason === "pages" ||
        reason === "favorites" ||
        reason === "rename" ||
        reason === "trash" ||
        reason === "workspace" ||
        reason === "user" ||
        reason === "change"
      ) {
        renderAll();
      }
    });

    renderAll();
  }

  /* ---------- collapse / mobile ---------- */
  function setCollapsed(collapsed) {
    sidebarEl.classList.toggle("is-collapsed", collapsed);
    store.getState().settings.sidebarOpen = !collapsed;
    store.save();
  }
  function toggleCollapsed() {
    setCollapsed(!sidebarEl.classList.contains("is-collapsed"));
  }

  function setMobileOpen(open) {
    const overlay = document.getElementById("sidebar-overlay");
    sidebarEl.classList.toggle("is-open", open);
    overlay.hidden = !open;
  }

  window.Lumen.sidebar = {
    init,
    render: renderAll,
    setCollapsed,
    toggleCollapsed,
    setMobileOpen,
  };
})();
