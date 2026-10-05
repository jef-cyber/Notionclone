/* ============================================================
   Lumen — app: boot, auth flow, landing, workspace chrome
   (topbar, mobile nav), view rendering (dashboard, page, activity,
   settings, templates, favorites, search, trash), command
   palette, and keyboard shortcuts.
   ============================================================ */

(function () {
  "use strict";

  const { store, ui } = window.Lumen;

  const landingEl = document.getElementById("view-landing");
  const loginEl = document.getElementById("view-login");
  const registerEl = document.getElementById("view-register");
  const workspaceEl = document.getElementById("workspace");
  const contentEl = document.getElementById("content");
  const topbarEl = document.getElementById("topbar");
  const mobileNavEl = document.getElementById("mobile-nav");
  const overlayEl = document.getElementById("sidebar-overlay");

  /* ============================================================
     Boot
     ============================================================ */
  async function boot() {
    window.Lumen.theme.apply();
    window.Lumen.sidebar.init();
    window.Lumen.editor.init();
    wireLanding();
    wireAuthForms();
    wireGlobalShortcuts();
    wireImport();
    store.onChange(onStoreChange);
    window.addEventListener("hashchange", onHashChange);

    applyPreferenceClasses();

    // A stored token only means anything once the API confirms it.
    await store.loadSession();
    routeFromHash();
  }

  function parseHash() {
    const h = (location.hash || "").replace(/^#/, "");
    if (h.indexOf("page/") === 0) return { route: "page", id: h.slice(5) };
    const map = {
      login: "login",
      register: "register",
      search: "search",
      trash: "trash",
      settings: "settings",
      templates: "templates",
      favorites: "favorites",
      inbox: "inbox",
    };
    return { route: map[h] || "dashboard" };
  }

  function routeFromHash() {
    const parsed = parseHash();
    if (!window.Lumen.auth.isLoggedIn()) {
      if (parsed.route === "login") showLogin();
      else if (parsed.route === "register") showRegister();
      else showLanding();
      return;
    }
    if (parsed.route === "login" || parsed.route === "register") {
      clearHash();
      navigate("dashboard");
      return;
    }
    applyLoggedInRoute(parsed);
  }

  function applyLoggedInRoute(parsed) {
    if (parsed.route === "page") {
      const page = store.getPage(parsed.id);
      showWorkspace();
      if (!page) {
        renderMissingPage();
        return;
      }
      const state = store.getState();
      if (state.view === "page" && state.currentPageId === page.id) return;
      openPage(page.id);
      return;
    }
    const state = store.getState();
    if (parsed.route !== state.view) store.setView(parsed.route);
    showWorkspace();
  }

  /** Let the store react to session loss no matter where the request failed. */
  window.addEventListener("lumen:unauthorized", () => {
    store.clearSession();
    ui.closeMenus();
    ui.closeModal();
    clearHash();
    showLanding();
  });

  function onHashChange() {
    routeFromHash();
  }

  function setHash(h) {
    h = h || "";
    if (location.hash === h) return;
    if (h) location.hash = h;
    else clearHash();
  }

  function clearHash() {
    if (!location.hash) return;
    try {
      history.replaceState(null, "", location.pathname + location.search);
    } catch (e) {
      /* ignore */
    }
  }

  function showLanding() {
    workspaceEl.hidden = true;
    loginEl.hidden = true;
    registerEl.hidden = true;
    landingEl.hidden = false;
    clearHash();
  }

  function showLogin() {
    showAuthView("login");
  }

  function showRegister() {
    showAuthView("register");
  }

  function showAuthView(which) {
    if (window.Lumen.auth.isLoggedIn()) {
      showWorkspace();
      return;
    }
    ui.closeMenus();
    ui.closeModal();
    workspaceEl.hidden = true;
    landingEl.hidden = true;
    loginEl.hidden = which !== "login";
    registerEl.hidden = which !== "register";
    setHash(which === "register" ? "#register" : "#login");
  }

  function showWorkspace() {
    landingEl.hidden = true;
    loginEl.hidden = true;
    registerEl.hidden = true;
    workspaceEl.hidden = false;
    const settings = store.getState().settings;
    window.Lumen.sidebar.setCollapsed(!settings.sidebarOpen);
    window.Lumen.sidebar.setMobileOpen(false);
    overlayEl.hidden = true;
    renderTopbar();
    renderMobileNav();
    renderContent();
  }

  function applyPreferenceClasses() {
    const s = store.getState().settings;
    document.body.classList.toggle("no-anim", !s.animations);
    document.body.classList.toggle("compact", !!s.compactMode);
  }

  /* ============================================================
     Landing
     ============================================================ */
  function wireLanding() {
    const themeBtn = document.getElementById("landing-theme");
    themeBtn.innerHTML = ui.icon("sun");
    themeBtn.setAttribute("data-theme-toggle-icon", "");
    themeBtn.addEventListener("click", () => window.Lumen.theme.toggleTheme());

    document.getElementById("landing-login").addEventListener("click", showLogin);
    document.getElementById("landing-signup").addEventListener("click", showRegister);
    document.getElementById("landing-login-2").addEventListener("click", showLogin);
    document.getElementById("landing-signup-2").addEventListener("click", showRegister);
  }

  /* ============================================================
     Auth forms (Login / Register)
     ============================================================ */
  function wireAuthForms() {
    const setError = (errorEl, message) => {
      errorEl.textContent = message;
      errorEl.closest(".auth-field").classList.toggle("has-error", !!message);
    };
    const clearForm = (els) => {
      els.forEach((el) => {
        el.textContent = "";
        el.closest(".auth-field").classList.remove("has-error");
      });
    };
    // A failure that isn't tied to one field (bad credentials, server down) is
    // shown in a banner above the button.
    const showFormError = (message) => {
      let banner = document.querySelector("#auth-form-error");
      if (!banner) {
        banner = document.createElement("p");
        banner.id = "auth-form-error";
        banner.className = "auth-error-banner";
        const host = document.querySelector(".auth-view:not([hidden]) .auth-form");
        if (!host) return;
        host.insertBefore(banner, host.querySelector(".btn"));
      }
      banner.textContent = message || "";
    };
    const clearFormError = () => showFormError("");

    const setBusy = (button, busy, label) => {
      button.disabled = busy;
      button.textContent = busy ? "Working\u2026" : label;
    };

    const applyErrors = (errEls, errors) => {
      clearForm(Object.keys(errEls).map((k) => errEls[k]).filter(Boolean));
      showFormError("");
      let placed = false;
      Object.keys(errors).forEach((key) => {
        if (errEls[key]) {
          setError(errEls[key], errors[key]);
          placed = true;
        }
      });
      if (!placed) showFormError(errors.form);
    };

    // ---- Login ----
    const loginEmail = document.getElementById("login-email");
    const loginPassword = document.getElementById("login-password");
    const loginSubmit = document.getElementById("login-submit");
    const loginErr = {
      email: document.getElementById("login-email-error"),
      password: document.getElementById("login-password-error"),
    };
    const clearLogin = () => {
      clearForm([loginErr.email, loginErr.password]);
      clearFormError();
    };
    const submitLogin = async () => {
      clearLogin();
      setBusy(loginSubmit, true, "Log in");
      const res = await window.Lumen.auth.login(loginEmail.value, loginPassword.value);
      setBusy(loginSubmit, false, "Log in");
      if (!res.ok) {
        applyErrors(loginErr, res.errors);
        return;
      }
      store.adoptSession(res);
      await store.refreshPages();
      ui.showToast("Welcome back", "success");
      navigate("dashboard");
    };
    loginSubmit.addEventListener("click", submitLogin);
    loginEmail.addEventListener("keydown", (e) => {
      if (e.key === "Enter") submitLogin();
    });
    loginPassword.addEventListener("keydown", (e) => {
      if (e.key === "Enter") submitLogin();
    });
    loginEmail.addEventListener("input", clearLogin);
    loginPassword.addEventListener("input", clearLogin);
    document.getElementById("login-to-register").addEventListener("click", () => {
      clearLogin();
      showRegister();
    });

    // ---- Register ----
    const regName = document.getElementById("reg-name");
    const regEmail = document.getElementById("reg-email");
    const regPassword = document.getElementById("reg-password");
    const regConfirm = document.getElementById("reg-confirm");
    const regSubmit = document.getElementById("reg-submit");
    const regErr = {
      name: document.getElementById("reg-name-error"),
      email: document.getElementById("reg-email-error"),
      password: document.getElementById("reg-password-error"),
      confirm: document.getElementById("reg-confirm-error"),
    };
    const clearReg = () => {
      clearForm([regErr.name, regErr.email, regErr.password, regErr.confirm]);
      clearFormError();
    };
    const submitRegister = async () => {
      clearReg();
      setBusy(regSubmit, true, "Create account");
      const res = await window.Lumen.auth.register(
        regName.value,
        regEmail.value,
        regPassword.value,
        regConfirm.value
      );
      setBusy(regSubmit, false, "Create account");
      if (!res.ok) {
        applyErrors(regErr, res.errors);
        return;
      }
      store.adoptSession(res);
      await store.refreshPages();
      ui.showToast("Account created \u2014 welcome to Lumen!", "success");
      navigate("dashboard");
    };
    regSubmit.addEventListener("click", submitRegister);
    [regName, regEmail, regPassword, regConfirm].forEach((input) => {
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") submitRegister();
      });
      input.addEventListener("input", clearReg);
    });
    document.getElementById("reg-to-login").addEventListener("click", () => {
      clearReg();
      showLogin();
    });
  }

  /* ============================================================
     Navigation
     ============================================================ */
  function navigate(view) {
    if (!window.Lumen.auth.isLoggedIn()) {
      showLogin();
      return;
    }
    store.setView(view);
    if (ui.isMobile()) window.Lumen.sidebar.setMobileOpen(false);
    const h = {
      dashboard: "",
      inbox: "#inbox",
      settings: "#settings",
      templates: "#templates",
      favorites: "#favorites",
      trash: "#trash",
      search: "#search",
    }[view];
    setHash(h || "");
    showWorkspace();
  }

  async function openPage(id) {
    const page = store.getPage(id);
    if (!page) {
      // A deep link can name a page this workspace doesn't have.
      store.getState().view = "page";
      store.getState().currentPageId = id;
      renderContent();
      return;
    }
    if (page.isArchived) {
      ui.showToast("This page is in the trash", "info");
      navigate("trash");
      return;
    }

    // Blocks live in their own collection, so the editor needs them before it
    // can render. Everything queued on the previous page goes out now.
    store.flushPage(store.getState().currentPageId);
    const target = await store.hydratePage(id);
    if (!target) {
      store.refreshPages();
      renderMissingPage();
      return;
    }

    store.navigate(id);
    if (ui.isMobile()) window.Lumen.sidebar.setMobileOpen(false);
    setHash("#page/" + id);
  }

  function logout() {
    // Don't lose the last few keystrokes on the way out.
    store.flushAll();
    window.Lumen.auth.logout().then(() => {
      store.clearSession();
      ui.closeMenus();
      ui.closeModal();
      clearHash();
      showLanding();
    });
  }

  /* ============================================================
     Store change handling
     ============================================================ */
  function onStoreChange(reason) {
    switch (reason) {
      case "pages":
      case "nav":
        renderTopbar();
        renderMobileNav();
        renderContent();
        break;
      case "trash":
        renderTopbar();
        renderMobileNav();
        renderContent();
        break;
      case "recent-search":
        if (store.getState().view === "search") renderContent();
        break;
      case "user":
      case "workspace":
        renderTopbar();
        renderMobileNav();
        if (store.getState().view === "settings") renderContent();
        break;
      case "rename":
      case "icon":
        renderTopbar();
        syncEditorMeta();
        break;
      case "meta":
        // The server confirmed a queued edit. The DOM already shows it, so
        // don't re-render the editor and lose the caret.
        window.Lumen.sidebar.render();
        break;
      case "favorites":
        renderTopbar();
        renderMobileNav();
        if (store.getState().view === "favorites" || store.getState().view === "dashboard") {
          renderContent();
        }
        break;
      default:
        break;
    }
  }

  function syncEditorMeta() {
    const state = store.getState();
    if (state.view !== "page") return;
    const page = store.getPage(state.currentPageId);
    if (page) window.Lumen.editor.syncMeta(page);
  }

  /* ============================================================
     Topbar
     ============================================================ */
  function renderTopbar() {
    const state = store.getState();
    const isPage = state.view === "page";
    const page = isPage ? store.getPage(state.currentPageId) : null;
    const isMobile = ui.isMobile();
    // breadcrumbs
    let crumbs = "";
    if (isPage && page) {
      const path = store.getPath(page.id);
      crumbs = path
        .map(
          (p, i) =>
            '<button class="breadcrumb-item" data-nav-page="' +
            p.id +
            '" ' +
            (i === path.length - 1 ? 'aria-current="page"' : "") +
            ">" +
            '<span class="page-icon" style="width:16px;height:16px;font-size:13px">' +
            ui.escapeHtml(p.icon || "\uD83D\uDCDD") +
            "</span>" +
            "<span>" +
            ui.escapeHtml(p.title || "Untitled") +
            "</span></button>"
        )
        .join('<span class="breadcrumb-sep">/</span>');
    } else {
      const viewName = {
        dashboard: "Home",
        inbox: "Activity",
        settings: "Settings",
        templates: "Templates",
        favorites: "Favorites",
        search: "Search",
        trash: "Trash",
        page: "Page",
      }[state.view] || "Home";
      crumbs =
        '<button class="breadcrumb-item" data-nav-page="workspace">' +
        ui.escapeHtml(state.workspace.name || "Workspace") +
        "</button>" +
        '<span class="breadcrumb-sep">/</span>' +
        '<button class="breadcrumb-item" aria-current="page">' +
        viewName +
        "</button>";
    }

    const favState = page ? page.favorite : false;
    const searchLabel = isMobile ? "" : "<span>Search</span>";
    const kbdHint = isMobile ? "" : "<kbd>" + (ui.isApple() ? "\u2318" : "Ctrl") + " K</kbd>";

    topbarEl.innerHTML =
      '<div class="topbar-left">' +
      '<button class="icon-btn" data-toggle-sidebar aria-label="Toggle sidebar">' +
      ui.icon("menu") +
      "</button>" +
      '<nav class="breadcrumbs" aria-label="Breadcrumb">' +
      crumbs +
      "</nav></div>" +
      '<div class="topbar-right">' +
      '<button class="search-trigger" data-open-search aria-label="Search">' +
      ui.icon("search") +
      searchLabel +
      kbdHint +
      "</button>" +
      (page
        ? '<button class="topbar-label-btn" data-share>' +
          ui.icon("share") +
          '<span class="share-label">Share</span></button>'
        : "") +
      (page
        ? '<button class="icon-btn" data-fav aria-label="Toggle favorite" data-active="' +
          (favState ? "true" : "false") +
          '">' +
          ui.icon(favState ? "starFilled" : "star") +
          "</button>"
        : "") +
      '<button class="icon-btn" data-more aria-label="More actions">' +
      ui.icon("more") +
      "</button>" +
      '<button class="avatar" data-avatar aria-haspopup="menu">' +
      ui.escapeHtml(ui.initials(state.user.name || "?")) +
      "</button>" +
      "</div>";

    // wire events
    topbarEl.querySelector("[data-toggle-sidebar]").addEventListener("click", toggleSidebar);
    topbarEl.querySelector("[data-open-search]").addEventListener("click", () => navigate("search"));
    topbarEl.querySelectorAll("[data-nav-page]").forEach((b) => {
      b.addEventListener("click", () => {
        const id = b.dataset.navPage;
        if (id === "workspace") navigate("dashboard");
        else openPage(id);
      });
    });
    if (page) {
      topbarEl.querySelector("[data-share]").addEventListener("click", () => openShare(page));
      topbarEl.querySelector("[data-fav]").addEventListener("click", (e) => {
        const now = store.toggleFavorite(page.id);
        ui.showToast(now ? "Added to favorites" : "Removed from favorites");
        e.currentTarget.dataset.active = String(now);
        e.currentTarget.innerHTML = ui.icon(now ? "starFilled" : "star");
      });
    }
    topbarEl.querySelector("[data-more]").addEventListener("click", (e) => {
      const r = e.currentTarget.getBoundingClientRect();
      openMoreMenu(page, r.left, r.bottom + 4);
    });
    topbarEl.querySelector("[data-avatar]").addEventListener("click", (e) => {
      const r = e.currentTarget.getBoundingClientRect();
      openProfileMenu(r.left, r.bottom + 4);
    });
  }

  /* ---------- topbar menus ---------- */
  function openMoreMenu(page, x, y) {
    const items = [];
    if (page) {
      items.push(
        {
          label: page.favorite ? "Remove from Favorites" : "Add to Favorites",
          icon: "star",
          action: () => {
            store.toggleFavorite(page.id);
            ui.showToast(page.favorite ? "Added to favorites" : "Removed from favorites");
          },
        },
        {
          label: "Duplicate page",
          icon: "copy",
          action: () => {
            const c = store.duplicatePage(page.id);
            ui.showToast("Page duplicated", "success");
            openPage(c.id);
          },
        },
        { label: "Copy link", icon: "link", action: () => copyPageLink(page) },
        { sep: true },
        {
          label: "Move to trash",
          icon: "trash",
          danger: true,
          action: () => {
            const confirmFirst = store.getState().settings.confirmDelete;
            const doDelete = () => {
              store.moveToTrash(page.id);
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
        }
      );
    } else {
      const state = store.getState();
      items.push(
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
        { label: "Log out", icon: "logout", danger: true, action: logout }
      );
    }
    ui.openMenu({ x, y, items });
  }

  function openProfileMenu(x, y) {
    const state = store.getState();
    ui.openMenu({
      x,
      y,
      header: { name: state.user.name || "", sub: state.user.email || "" },
      items: [
        { label: "My Profile", icon: "user", action: () => navigate("settings") },
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
        { label: "Help", icon: "help", action: openHelp },
        { sep: true },
        { label: "Log out", icon: "logout", danger: true, action: logout },
      ],
    });
  }

  function copyPageLink(page) {
    const url = location.origin + location.pathname + "#page/" + page.id;
    ui.copyToClipboard(url).then(() => ui.showToast("Link copied to clipboard"));
  }

  function openShare(page) {
    const url = location.origin + location.pathname + "#page/" + page.id;
    const members = store.getState().members;
    const modal = ui.openModal({
      title: "Share",
      size: "modal-sm",
      body:
        '<p>Anyone with this link still has to be a member of <strong>' +
        ui.escapeHtml(store.getState().workspace.name || "this workspace") +
        "</strong> to open the page.</p>" +
        '<div class="share-link-row"><input id="share-url" readonly value="' +
        ui.escapeHtml(url) +
        '" /><button class="btn btn-secondary" id="share-copy">' +
        ui.icon("copy") +
        " Copy</button></div>" +
        (members.length
          ? '<h3 class="settings-section-title" style="margin-top:16px">Members (' +
            members.length +
            ")</h3><div class=\"share-members\">" +
            members
              .map(
                (m) =>
                  '<div class="share-member"><span class="avatar">' +
                  ui.escapeHtml(ui.initials(m.name)) +
                  '</span><span class="share-member-body"><span class="share-member-name">' +
                  ui.escapeHtml(m.name) +
                  '</span><span class="share-member-email">' +
                  ui.escapeHtml(m.email) +
                  '</span></span><span class="share-member-role">' +
                  ui.escapeHtml(m.role) +
                  "</span></div>"
              )
              .join("") +
            "</div>"
          : ""),
      footer: '<button class="btn btn-primary" data-modal-close>Done</button>',
    });
    modal.querySelector("#share-copy").addEventListener("click", () => {
      ui.copyToClipboard(url).then(() => {
        ui.showToast("Link copied to clipboard");
      });
    });
  }

  function openHelp() {
    const shortcuts = [
      ["Open search", "Ctrl / Cmd + K"],
      ["New page", "Ctrl / Cmd + N"],
      ["Bold", "Ctrl / Cmd + B"],
      ["Italic", "Ctrl / Cmd + I"],
      ["Command palette", "Ctrl / Cmd + Shift + P"],
      ["Close menus / dialogs", "Esc"],
      ["Block commands", "Type / inside a block"],
    ];
    ui.openModal({
      title: "Keyboard shortcuts",
      body:
        '<div class="help-grid">' +
        shortcuts
          .map(
            (s) =>
              '<span class="help-label">' + ui.escapeHtml(s[0]) + "</span><kbd>" + ui.escapeHtml(s[1]) + "</kbd>"
          )
          .join("") +
        "</div>",
      footer: '<button class="btn btn-secondary" data-modal-close>Close</button>',
    });
  }

  function toggleSidebar() {
    if (ui.isMobile()) {
      const open = !document.getElementById("sidebar").classList.contains("is-open");
      window.Lumen.sidebar.setMobileOpen(open);
      overlayEl.hidden = !open;
    } else {
      window.Lumen.sidebar.toggleCollapsed();
    }
  }

  /* ============================================================
     Mobile bottom nav
     ============================================================ */
  function renderMobileNav() {
    const state = store.getState();
    const active = state.view;
    const btn = (id, view, iconName, label) =>
      '<button class="mobile-nav-btn" data-mnav="' +
      id +
      '" data-active="' +
      (active === view ? "true" : "false") +
      '">' +
      ui.icon(iconName) +
      "<span>" +
      label +
      "</span></button>";

    mobileNavEl.innerHTML =
      btn("home", "dashboard", "home", "Home") +
      btn("search", null, "search", "Search") +
      btn("new", null, "plus", "New") +
      btn("inbox", "inbox", "inbox", "Activity") +
      btn("settings", "settings", "settings", "Settings");

    mobileNavEl.querySelectorAll("[data-mnav]").forEach((b) => {
      b.addEventListener("click", () => {
        const which = b.dataset.mnav;
        if (which === "search") navigate("search");
        else if (which === "new") createNewPage();
        else navigate(which === "home" ? "dashboard" : which);
      });
    });
  }

  async function createNewPage() {
    try {
      const p = await store.createPage({});
      ui.showToast("Page created", "success");
      openPage(p.id);
    } catch (err) {
      ui.showToast(err.message || "Could not create the page", "error");
    }
  }

  /* ============================================================
     Content rendering
     ============================================================ */
  function renderContent() {
    const state = store.getState();
    contentEl.textContent = "";
    contentEl.scrollTop = 0;

    if (state.view === "page") {
      const page = store.getPage(state.currentPageId);
      if (!page) {
        renderMissingPage();
        return;
      }
      // Blocks are a separate collection and load on demand; don't render a
      // half-empty editor.
      if (!page.blocksLoaded) {
        renderLoading();
        return;
      }
      // autofocus title on brand new/empty pages
      contentEl.appendChild(window.Lumen.editor.render(page, { focusTitle: !page.blocks.length }));
      return;
    }
    if (state.view === "dashboard") renderDashboard();
    else if (state.view === "inbox") renderInbox();
    else if (state.view === "settings") renderSettings();
    else if (state.view === "templates") renderTemplates();
    else if (state.view === "favorites") renderFavoritesView();
    else if (state.view === "search") renderSearchPage();
    else if (state.view === "trash") renderTrash();
    else renderDashboard();
  }

  function renderLoading() {
    const wrap = document.createElement("div");
    wrap.className = "view";
    wrap.innerHTML =
      '<div class="empty-state"><div class="empty-icon">\uD83D\uDCC4</div>' +
      '<h2 class="empty-title">Loading\u2026</h2>' +
      '<p class="empty-desc">Fetching this page from the server.</p></div>';
    contentEl.appendChild(wrap);
  }

  function renderMissingPage() {
    const wrap = document.createElement("div");
    wrap.className = "view";
    wrap.innerHTML =
      '<div class="empty-state">' +
      '<div class="empty-icon">\uD83D\uDCE6</div>' +
      '<h2 class="empty-title">Page not found</h2>' +
      '<p class="empty-desc">This page may have been deleted or moved.</p>' +
      '<button class="btn btn-primary" data-gohome>Go to Home</button></div>';
    wrap.querySelector("[data-gohome]").addEventListener("click", () => navigate("dashboard"));
    contentEl.appendChild(wrap);
  }

  /* ---------- Dashboard ---------- */
  function renderDashboard() {
    const state = store.getState();
    const hour = new Date().getHours();
    const greeting =
      hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
    const firstName = (state.user.name || "").split(" ")[0] || "there";

    const wrap = document.createElement("div");
    wrap.className = "view";
    wrap.innerHTML =
      '<h1 class="dash-greeting">' +
      greeting +
      ", " +
      ui.escapeHtml(firstName) +
      " \uD83D\uDC4B</h1>" +
      '<p class="dash-date">' +
      formatDate(new Date()) +
      "</p>" +
      '<h2 class="dash-section-title">Quick actions</h2>' +
      '<div class="quick-actions">' +
      '<button class="quick-action" data-qa="new"><span class="icon icon-accent">' +
      ui.icon("plus") +
      "</span>New Page</button>" +
      '<button class="quick-action" data-qa="search"><span class="icon icon-violet">' +
      ui.icon("search") +
      "</span>Search</button>" +
      '<button class="quick-action" data-qa="new-workspace-page"><span class="icon icon-green">' +
      ui.icon("folder-plus") +
      "</span>New Workspace Page</button>" +
      "</div>";

    // recently visited
    const recents = state.recent.map((id) => store.getPage(id)).filter(Boolean).slice(0, 6);
    wrap.insertAdjacentHTML(
      "beforeend",
      '<h2 class="dash-section-title">Recently visited</h2><div class="card-grid" id="dash-recent"></div>'
    );
    const recentGrid = wrap.querySelector("#dash-recent");
    if (recents.length) {
      recents.forEach((p) => recentGrid.appendChild(pageCard(p, false)));
    } else {
      recentGrid.innerHTML = emptyCard("Nothing recently visited", "Pages you open will show up here.");
    }

    // favorites
    const favs = store.getFavorites();
    wrap.insertAdjacentHTML(
      "beforeend",
      '<h2 class="dash-section-title">Favorites</h2><div class="card-grid" id="dash-favs"></div>'
    );
    const favGrid = wrap.querySelector("#dash-favs");
    if (favs.length) {
      favs.forEach((p) => favGrid.appendChild(pageCard(p, true)));
    } else {
      favGrid.innerHTML = emptyCard("No favorites yet", "Star a page to pin it here.");
    }

    // wire quick actions
    wrap.querySelector('[data-qa="new"]').addEventListener("click", createNewPage);
    wrap.querySelector('[data-qa="search"]').addEventListener("click", () => navigate("search"));
    wrap.querySelector('[data-qa="new-workspace-page"]').addEventListener("click", createWorkspacePage);

    contentEl.appendChild(wrap);
  }

  function pageCard(page, showStar) {
    const btn = document.createElement("button");
    btn.className = "card";
    // updatedAt is an ISO timestamp; every other surface in the app renders
    // ages as "3 min ago", so don't leak the raw string into a card.
    const when = ui.relativeTime(page.updatedAt);
    btn.innerHTML =
      '<span class="card-icon">' +
      ui.escapeHtml(page.icon || "\uD83D\uDCDD") +
      '</span><span class="card-body"><span class="card-title">' +
      ui.escapeHtml(page.title || "Untitled") +
      '</span><span class="card-sub">' +
      (when ? "Updated " + ui.escapeHtml(when) : "Not yet saved") +
      "</span></span>" +
      (showStar
        ? '<span class="card-star" data-active="true" aria-label="Remove from favorites">' +
          ui.icon("starFilled") +
          "</span>"
        : "");
    btn.addEventListener("click", (e) => {
      if (e.target.closest(".card-star")) {
        store.toggleFavorite(page.id);
        ui.showToast("Removed from favorites");
        return;
      }
      openPage(page.id);
    });
    return btn;
  }

  function emptyCard(title, desc) {
    return (
      '<div class="empty-state" style="padding:28px 16px"><div class="empty-icon">\uD83D\uDCDD</div>' +
      '<h3 class="empty-title" style="font-size:15px">' +
      ui.escapeHtml(title) +
      "</h3>" +
      '<p class="empty-desc" style="font-size:13px">' +
      ui.escapeHtml(desc) +
      "</p></div>"
    );
  }

  function formatDate(d) {
    return d.toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
  }

  /* ---------- Activity ---------- */
  /**
   * There is no notifications collection: activity is derived from the pages
   * collection, newest first.
   */
  function renderInbox() {
    const wrap = document.createElement("div");
    wrap.className = "view view-narrow";
    const activity = store.getActivity();
    const pages = store.getState().pages.filter((p) => !p.isArchived).length;

    wrap.innerHTML =
      '<h1 style="font-size:28px;font-weight:700;margin-bottom:4px">Activity</h1>' +
      '<p class="dash-date">' +
      (activity.length
        ? "The " + pages + " page" + (pages === 1 ? "" : "s") + " in this workspace, most recently changed first."
        : "Nothing here yet.") +
      "</p>";

    if (!activity.length) {
      wrap.insertAdjacentHTML(
        "beforeend",
        '<div class="empty-state"><div class="empty-icon">' +
          ui.icon("inbox") +
          '</div><h2 class="empty-title">No activity yet</h2>' +
          '<p class="empty-desc">Create or edit a page and it shows up here.</p></div>'
      );
      contentEl.appendChild(wrap);
      return;
    }

    const groups = {};
    activity.forEach((item) => {
      (groups[item.group] = groups[item.group] || []).push(item);
    });

    Object.keys(groups).forEach((group) => {
      wrap.insertAdjacentHTML(
        "beforeend",
        '<h3 class="inbox-group-title">' + ui.escapeHtml(group) + "</h3>"
      );
      groups[group].forEach((item) => {
        const btn = document.createElement("button");
        btn.className = "inbox-item";
        btn.innerHTML =
          '<span class="inbox-icon">' +
          ui.escapeHtml(item.icon) +
          '</span><span class="inbox-body"><span class="inbox-text">' +
          ui.escapeHtml(item.title || "Untitled") +
          '</span><div class="inbox-time">' +
          ui.escapeHtml(ui.relativeTime(item.time)) +
          "</div></span>";
        btn.addEventListener("click", () => openPage(item.pageId));
        wrap.appendChild(btn);
      });
    });

    contentEl.appendChild(wrap);
  }

  /* ---------- Settings ---------- */
  function renderSettings() {
    const state = store.getState();
    const s = state.settings;
    const u = state.user;

    const wrap = document.createElement("div");
    wrap.className = "view view-narrow";
    wrap.innerHTML =
      '<h1 style="font-size:28px;font-weight:700;margin-bottom:4px">Settings</h1>' +
      '<p class="dash-date">Manage your account, appearance, and preferences.</p>' +
      '<div class="settings-tabs">' +
      '<button class="settings-tab" data-tab="account" data-active="true">My Account</button>' +
      '<button class="settings-tab" data-tab="appearance">Appearance</button>' +
      '<button class="settings-tab" data-tab="prefs">Preferences</button>' +
      '<button class="settings-tab" data-tab="about">About</button>' +
      "</div>" +
      '<div id="settings-body"></div>';

    const body = wrap.querySelector("#settings-body");

    const renderTab = (tab) => {
      wrap.querySelectorAll(".settings-tab").forEach((t) => {
        t.dataset.active = String(t.dataset.tab === tab);
      });
      if (tab === "account") {
        body.innerHTML =
          '<div class="settings-section">' +
          '<h2 class="settings-section-title">My Account</h2>' +
          '<p class="settings-section-desc">Your profile is stored in the <code>users</code> collection.</p>' +
          '<div class="avatar-edit"><span class="avatar avatar-lg" id="settings-avatar">' +
          ui.escapeHtml(ui.initials(u.name)) +
          '</span><div class="field" style="margin:0"><label for="f-name">Name</label><input id="f-name" value="' +
          ui.escapeHtml(u.name) +
          '" /></div></div>' +
          '<div class="field"><label for="f-email">Email</label><input id="f-email" type="email" value="' +
          ui.escapeHtml(u.email) +
          '" /></div>' +
          '<div class="field"><label for="f-workspace">Workspace</label><input id="f-workspace" value="' +
          ui.escapeHtml(state.workspace.name || "") +
          '" disabled /></div>' +
          '<div class="field"><label for="f-role">Your role</label><input id="f-role" value="' +
          ui.escapeHtml(state.workspace.role || "member") +
          '" disabled /></div>' +
          '<button class="btn btn-primary" data-save-profile>Save changes</button>' +
          "</div>";

        const saveBtn = body.querySelector("[data-save-profile]");
        saveBtn.addEventListener("click", async () => {
          const name = body.querySelector("#f-name").value.trim();
          const email = body.querySelector("#f-email").value.trim();
          if (!name || !email) {
            ui.showToast("Name and email are required", "error");
            return;
          }
          saveBtn.disabled = true;
          try {
            const data = await window.Lumen.api.auth.updateProfile({ name: name, email: email });
            store.updateUser(data.user);
            applyPreferenceClasses();
            renderTopbar();
            ui.showToast("Profile updated", "success");
          } catch (err) {
            ui.showToast(err.message, "error");
          } finally {
            saveBtn.disabled = false;
          }
        });
      } else if (tab === "appearance") {
        body.innerHTML =
          '<div class="settings-section"><h2 class="settings-section-title">Appearance</h2>' +
          '<p class="settings-section-desc">Choose how Lumen looks.</p>' +
          '<div class="theme-options">' +
          themeOption("light", "Light", "Sunny and bright") +
          themeOption("dark", "Dark", "Easy on the eyes") +
          themeOption("system", "System", "Match your OS") +
          "</div></div>";
        body.querySelectorAll("[data-theme-option]").forEach((opt) => {
          opt.addEventListener("click", () => window.Lumen.theme.setTheme(opt.dataset.themeOption));
        });
      } else if (tab === "prefs") {
        body.innerHTML =
          '<div class="settings-section">' +
          "<h2 class=\"settings-section-title\">Preferences</h2>" +
          '<div class="settings-row"><div class="settings-row-label"><div class="settings-row-title">Sidebar behavior</div>' +
          '<div class="settings-row-desc">Choose how the sidebar responds.</div></div>' +
          '<select id="pref-sidebar" class="select"><option value="collapsible"' +
          (s.sidebarBehavior === "fixed" ? "" : " selected") +
          ">Collapsible</option><option value=\"fixed\"" +
          (s.sidebarBehavior === "fixed" ? " selected" : "") +
          ">Fixed</option></select></div>" +
          '<div class="settings-row"><div class="settings-row-label"><div class="settings-row-title">Compact mode</div>' +
          '<div class="settings-row-desc">Reduce spacing throughout the app.</div></div>' +
          toggleRow("pref-compact", !!s.compactMode) +
          "</div>" +
          '<div class="settings-row"><div class="settings-row-label"><div class="settings-row-title">Animations</div>' +
          '<div class="settings-row-desc">Enable subtle interface animations.</div></div>' +
          toggleRow("pref-anim", s.animations !== false) +
          "</div></div>";
        body.querySelector("#pref-sidebar").addEventListener("change", (e) => {
          s.sidebarBehavior = e.target.value;
          store.save();
          renderTopbar();
          ui.showToast("Settings updated", "success");
        });
        body.querySelector("#pref-compact").addEventListener("change", (e) => {
          s.compactMode = e.target.checked;
          store.save();
          applyPreferenceClasses();
          ui.showToast("Settings updated", "success");
        });
        body.querySelector("#pref-anim").addEventListener("change", (e) => {
          s.animations = e.target.checked;
          store.save();
          applyPreferenceClasses();
          ui.showToast("Settings updated", "success");
        });
      } else {
        body.innerHTML =
          '<div class="settings-section"><h2 class="settings-section-title">About</h2>' +
          '<div class="settings-row"><div class="settings-row-label"><div class="settings-row-title">Application</div>' +
          '<div class="settings-row-desc">' +
          ui.escapeHtml(state.app.name) +
          "</div></div></div>" +
          '<div class="settings-row"><div class="settings-row-label"><div class="settings-row-title">Version</div>' +
          '<div class="settings-row-desc">' +
          ui.escapeHtml(state.app.version) +
          "</div></div></div>" +
          '<div class="settings-row"><div class="settings-row-label"><div class="settings-row-title">Tech</div>' +
          '<div class="settings-row-desc">Vanilla HTML, CSS and JavaScript, with an Express + MongoDB API.</div></div></div>' +
          '<div class="settings-row"><div class="settings-row-label"><div class="settings-row-title">Storage</div>' +
          '<div class="settings-row-desc">Six collections: users, workspaces, workspaceMembers, pages, blocks, dataTable.</div></div></div>' +
          '<div class="settings-row"><div class="settings-row-label"><div class="settings-row-title">API</div>' +
          '<div class="settings-row-desc">' +
          ui.escapeHtml(window.Lumen.api.baseUrl()) +
          "</div></div></div></div>";
      }
      // theme options highlight
      if (tab === "appearance") window.Lumen.theme.apply();
    };

    const themeOption = (value, label, desc) =>
      '<button class="theme-option" data-theme-option="' +
      value +
      '" data-active="' +
      (s.theme === value ? "true" : "false") +
      '"><div class="theme-option-preview preview-' +
      value +
      '">' +
      (value === "light" ? ui.icon("sun") : value === "dark" ? ui.icon("moon") : ui.icon("monitor")) +
      '</div><div class="theme-option-label">' +
      label +
      '</div><div class="theme-option-desc">' +
      desc +
      "</div></button>";

    const toggleRow = (id, checked) =>
      '<label class="switch"><input type="checkbox" id="' +
      id +
      '" ' +
      (checked ? "checked" : "") +
      ' /><span class="track"></span></label>';

    wrap.querySelectorAll(".settings-tab").forEach((t) => {
      t.addEventListener("click", () => renderTab(t.dataset.tab));
    });

    renderTab("account");
    contentEl.appendChild(wrap);
  }

  /* ---------- Templates ---------- */
  function renderTemplates() {
    const state = store.getState();
    const wrap = document.createElement("div");
    wrap.className = "view";
    wrap.innerHTML =
      '<h1 style="font-size:28px;font-weight:700;margin-bottom:4px">Templates</h1>' +
      '<p class="dash-date">Start from a template \u2014 it becomes a real page you can edit.</p>' +
      '<div class="template-grid" id="template-grid"></div>';

    const grid = wrap.querySelector("#template-grid");
    window.LumenData.templates.forEach((tpl, i) => {
      const card = document.createElement("button");
      card.className = "template-card";
      card.innerHTML =
        '<div class="template-preview" data-tone="' +
        (tpl.tone !== undefined ? tpl.tone : i % 5) +
        '">' +
        ui.escapeHtml(tpl.icon) +
        '</div><div class="template-info"><div class="template-name">' +
        ui.escapeHtml(tpl.name) +
        '</div><div class="template-desc">' +
        ui.escapeHtml(tpl.desc) +
        "</div></div>";
      card.addEventListener("click", () => createFromTemplate(tpl));
      grid.appendChild(card);
    });

    contentEl.appendChild(wrap);
  }

  async function createFromTemplate(tpl) {
    // A template may include a database block; the store seeds page content
    // and returns once everything is saved.
    try {
      const page = await store.createPage({
        title: tpl.name,
        icon: tpl.icon,
        blocks: tpl.blocks,
      });
      ui.showToast('Page created from "' + tpl.name + '"', "success");
      openPage(page.id);
    } catch (err) {
      ui.showToast(err.message || "Could not create the page", "error");
    }
  }

  /* ---------- Favorites view ---------- */
  function renderFavoritesView() {
    const wrap = document.createElement("div");
    wrap.className = "view";
    wrap.innerHTML =
      '<h1 style="font-size:28px;font-weight:700;margin-bottom:4px">Favorites</h1>' +
      '<p class="dash-date">Pages you\u2019ve starred for quick access.</p>' +
      '<div class="card-grid" id="fav-grid"></div>';

    const grid = wrap.querySelector("#fav-grid");
    const favs = store.getFavorites();
    if (favs.length) {
      favs.forEach((p) => grid.appendChild(pageCard(p, true)));
    } else {
      grid.innerHTML =
        '<div class="empty-state"><div class="empty-icon">\u2726</div>' +
        '<h2 class="empty-title">No favorites yet</h2>' +
        '<p class="empty-desc">Click the star on any page to pin it here.</p></div>';
    }
    contentEl.appendChild(wrap);
  }

  /* ---------- New workspace page ---------- */
  function createWorkspacePage() {
    const modal = ui.openModal({
      title: "New top-level page",
      size: "modal-sm",
      body:
        '<p style="margin-bottom:10px">Name your new top-level page.</p>' +
        '<input id="nwp-title" type="text" placeholder="Page name" style="width:100%;padding:8px 12px;border:1px solid var(--border-strong);border-radius:6px;background:var(--bg-secondary)" />',
      footer:
        '<button class="btn btn-secondary" data-modal-close>Cancel</button>' +
        '<button class="btn btn-primary" id="nwp-ok">Create</button>',
    });
    const input = modal.querySelector("#nwp-title");
    const ok = modal.querySelector("#nwp-ok");
    const done = async () => {
      const title = input.value.trim();
      if (ok.disabled) return;
      ok.disabled = true;
      ui.closeModal();
      try {
        const p = await store.createPage({ title, icon: "\uD83D\uDCDD" });
        ui.showToast("Page created", "success");
        openPage(p.id);
      } catch (err) {
        ui.showToast(err.message || "Could not create the page", "error");
      }
    };
    ok.addEventListener("click", done);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") done();
    });
    requestAnimationFrame(() => input.focus());
  }

  /* ---------- Search page ---------- */
  function escapeRegExp(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function renderSearchPage() {
    const wrap = document.createElement("div");
    wrap.className = "view view-narrow";
    wrap.innerHTML =
      '<h1 style="font-size:28px;font-weight:700;margin-bottom:4px">Search</h1>' +
      '<p class="dash-date">Find pages, notes, and anything inside them.</p>' +
      '<div class="search-box search-box-page">' +
      ui.icon("search") +
      '<input id="search-page-input" type="text" placeholder="Search anything\u2026" autocomplete="off" aria-label="Search" />' +
      "</div>" +
      '<div id="search-page-results" class="search-results search-results-page"></div>';

    const input = wrap.querySelector("#search-page-input");
    const resultsEl = wrap.querySelector("#search-page-results");

    const hl = (text, ql) =>
      ql
        ? ui.escapeHtml(text).replace(new RegExp("(" + escapeRegExp(ql) + ")", "ig"), "<mark>$1</mark>")
        : ui.escapeHtml(text);
    const itemHtml = (r, i, title, snippet, ql) => {
      const path = store
        .getPath(r.page.id)
        .map((p) => p.title || "Untitled")
        .join(" / ");
      return (
        '<button class="search-result" data-id="' +
        r.page.id +
        '" data-index="' +
        i +
        '">' +
        '<span class="search-result-icon">' +
        ui.escapeHtml(r.page.icon || "\uD83D\uDCDD") +
        "</span>" +
        '<span class="search-result-body">' +
        '<span class="search-result-title">' +
        hl(title, ql) +
        "</span>" +
        (snippet ? '<span class="search-result-snippet">' + hl(snippet, ql) + "</span>" : "") +
        "</span>" +
        '<span class="search-result-path">' +
        ui.escapeHtml(path) +
        "</span>" +
        "</button>"
      );
    };

    const wireResultClicks = () => {
      resultsEl.querySelectorAll(".search-result").forEach((btn) => {
        btn.addEventListener("click", () => {
          const q = input.value.trim();
          if (q) store.addRecentSearch(q);
          const page = store.getPage(btn.dataset.id);
          if (page) openPage(page.id);
        });
      });
    };

    const renderEmpty = () => {
      const recents = store.getRecentSearches();
      const recPages = store
        .getState()
        .recent.map((id) => store.getPage(id))
        .filter(Boolean)
        .slice(0, 5);
      let html = "";
      if (recents.length) {
        html +=
          '<div class="search-group-label">Recent searches</div>' +
          recents
            .map(
              (q) =>
                '<button class="recent-search-chip" data-q="' +
                ui.escapeHtml(q) +
                '">' +
                ui.icon("clock") +
                "<span>" +
                ui.escapeHtml(q) +
                "</span></button>"
            )
            .join("") +
          '<button class="recent-search-clear" data-clear-searches>Clear</button>';
      }
      if (recPages.length) {
        html +=
          '<div class="search-group-label">Recent pages</div>' +
          recPages
            .map((p, i) => itemHtml({ page: p, snippet: "" }, i, p.title || "Untitled", "", ""))
            .join("");
      }
      html +=
        '<div class="search-empty" style="padding:24px 10px;text-align:left">Type to search your pages\u2026</div>';
      resultsEl.innerHTML = html;
      resultsEl.querySelectorAll("[data-q]").forEach((b) => {
        b.addEventListener("click", () => {
          input.value = b.dataset.q;
          input.dispatchEvent(new Event("input"));
          input.focus();
        });
      });
      resultsEl.querySelectorAll("[data-clear-searches]").forEach((b) => {
        b.addEventListener("click", () => store.clearRecentSearches());
      });
      wireResultClicks();
    };

    // Searching hits the API, so debounce and guard against a slow response
    // for a query the user has already replaced.
    let timer = null;
    let token = 0;

    const onInput = () => {
      const q = input.value.trim();
      clearTimeout(timer);
      if (!q) {
        token += 1;
        renderEmpty();
        return;
      }
      resultsEl.innerHTML =
        '<div class="search-group-label">Search results</div>' +
        '<div class="search-empty">' + ui.icon("search") + "<br/><br/>Searching\u2026</div>";
      timer = setTimeout(() => runSearch(q), 200);
    };

    async function runSearch(q) {
      const mine = ++token;
      let results = [];
      try {
        results = await store.searchPages(q);
      } catch (err) {
        if (mine !== token) return;
        results = [];
      }
      if (mine !== token) return;

      const ql = q.toLowerCase();
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
      resultsEl.innerHTML =
        '<div class="search-group-label">Search results</div>' +
        results
          .map((r, i) => {
            const title = r.page.title || "Untitled";
            const snippet = r.snippet && r.snippet !== r.page.title ? r.snippet : "";
            return itemHtml(r, i, title, snippet, ql);
          })
          .join("");
      wireResultClicks();
    }

    input.addEventListener("input", onInput);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const first = resultsEl.querySelector(".search-result");
        if (first) {
          const q = input.value.trim();
          if (q) store.addRecentSearch(q);
          const page = store.getPage(first.dataset.id);
          if (page) openPage(page.id);
        }
      }
    });

    renderEmpty();
    requestAnimationFrame(() => input.focus());
    contentEl.appendChild(wrap);
  }

  /* ---------- Trash ---------- */
  function renderTrash() {
    const wrap = document.createElement("div");
    wrap.className = "view view-narrow";
    const items = store.getTrashPages();
    const count = items.reduce((n, p) => n + 1 + store.getDescendantIds(p.id).length, 0);

    wrap.innerHTML =
      '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap">' +
      "<div>" +
      '<h1 style="font-size:28px;font-weight:700;margin-bottom:4px">Trash</h1>' +
      '<p class="dash-date">' +
      (items.length
        ? count +
          " page" +
          (count === 1 ? "" : "s") +
          " in trash. Restore to keep, or delete forever."
        : "Deleted pages appear here.")
        .replace(/\.$/, "") +
      ".</p></div>" +
      (items.length
        ? '<button class="btn btn-danger btn-sm" data-empty-trash>' +
          ui.icon("trash") +
          " Empty trash</button>"
        : "") +
      "</div>";

    if (!items.length) {
      wrap.insertAdjacentHTML(
        "beforeend",
        '<div class="empty-state"><div class="empty-icon">' +
          ui.icon("trash") +
          '</div><h2 class="empty-title">Trash is empty</h2>' +
          '<p class="empty-desc">Pages you move to trash will show up here.</p></div>'
      );
    } else {
      const list = document.createElement("div");
      list.className = "trash-list";
      items.forEach((p) => {
        const row = document.createElement("div");
        row.className = "trash-item";
        const archived = p.archivedAt ? new Date(p.archivedAt) : null;
        const when =
          archived && !isNaN(archived.getTime())
            ? archived.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
              " at " +
              archived.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
            : "";
        const parentPath = p.parentId
          ? store
              .getPath(p.parentId)
              .map((x) => x.title || "Untitled")
              .join(" / ")
          : "";
        row.innerHTML =
          '<span class="trash-item-icon">' +
          ui.escapeHtml(p.icon || "\uD83D\uDCDD") +
          "</span>" +
          '<span class="trash-item-body">' +
          '<span class="trash-item-title">' +
          ui.escapeHtml(p.title || "Untitled") +
          "</span>" +
          '<span class="trash-item-sub">Trashed ' +
          ui.escapeHtml(when) +
          (parentPath ? " \u00B7 " + ui.escapeHtml(parentPath) : "") +
          "</span></span>" +
          '<span class="trash-item-actions">' +
          '<button class="btn btn-secondary btn-sm" data-restore="' +
          p.id +
          '">' +
          ui.icon("rotate-cw") +
          " Restore</button>" +
          '<button class="btn btn-danger btn-sm" data-delete-forever="' +
          p.id +
          '">' +
          ui.icon("trash") +
          " Delete</button>" +
          "</span>";
        list.appendChild(row);
      });
      wrap.appendChild(list);

      wrap.querySelectorAll("[data-restore]").forEach((b) => {
        b.addEventListener("click", () => {
          store.restorePage(b.dataset.restore);
          ui.showToast("Page restored", "success");
        });
      });
      wrap.querySelectorAll("[data-delete-forever]").forEach((b) => {
        b.addEventListener("click", () => {
          const page = store.getPage(b.dataset.deleteForever);
          ui.confirmDialog({
            title: "Delete forever?",
            message:
              'This permanently deletes "<span class="confirm-name">' +
              ui.escapeHtml((page && page.title) || "Untitled") +
              '</span>" and any nested pages. This cannot be undone.',
            confirmLabel: "Delete forever",
            danger: true,
          }).then((ok) => {
            if (ok) {
              store.deletePagePermanently(b.dataset.deleteForever);
              ui.showToast("Page permanently deleted", "info");
            }
          });
        });
      });
    }

    const emptyBtn = wrap.querySelector("[data-empty-trash]");
    if (emptyBtn) {
      emptyBtn.addEventListener("click", () => {
        ui.confirmDialog({
          title: "Empty trash?",
          message:
            "All pages in the trash will be permanently deleted. This cannot be undone.",
          confirmLabel: "Empty trash",
          danger: true,
        }).then((ok) => {
          if (ok) {
            store.emptyTrash();
            ui.showToast("Trash emptied", "info");
          }
        });
      });
    }

    contentEl.appendChild(wrap);
  }

  /* ============================================================
     Command palette (Ctrl/Cmd + Shift + P)
     ============================================================ */
  function openCommandPalette() {
    const state = store.getState();
    const items = [
      { id: "new-page", icon: "plus", label: "New page", action: createNewPage },
      {
        id: "theme",
        icon: state.settings.theme === "dark" ? "sun" : "moon",
        label: "Toggle theme",
        action: () => window.Lumen.theme.toggleTheme(),
      },
      { id: "go-home", icon: "home", label: "Go to Home", action: () => navigate("dashboard") },
      { id: "go-search", icon: "search", label: "Open Search", action: () => navigate("search") },
      { id: "go-inbox", icon: "inbox", label: "Open Activity", action: () => navigate("inbox") },
      { id: "go-templates", icon: "layout", label: "Browse Templates", action: () => navigate("templates") },
      { id: "go-trash", icon: "trash", label: "Go to Trash", action: () => navigate("trash") },
      { id: "go-settings", icon: "settings", label: "Open Settings", action: () => navigate("settings") },
      { id: "import", icon: "upload", label: "Import a .md file", action: triggerImport },
      { sep: true },
    ];
    const recents = state.recent.map((id) => store.getPage(id)).filter(Boolean);
    recents.forEach((p) => {
      items.push({
        id: p.id,
        icon: "file-text",
        label: p.title || "Untitled",
        shortcut: "\u2190 recent",
        action: () => openPage(p.id),
      });
    });

    let sel = 0;
    const modal = ui.openModal({
      title: "Commands",
      size: "modal-sm",
      body:
        '<div class="search-box">' +
        ui.icon("command") +
        '<input id="cmd-input" type="text" placeholder="Type a command or page\u2026" autocomplete="off" /></div>' +
        '<div class="search-results" id="cmd-results"></div>',
    });

    const input = modal.querySelector("#cmd-input");
    const results = modal.querySelector("#cmd-results");

    const renderList = (filter) => {
      const visible = items.filter(
        (it) =>
          it.sep ||
          !filter ||
          it.label.toLowerCase().includes(filter.toLowerCase())
      );
      if (visible.length) {
        sel = Math.max(0, Math.min(sel, visible.length - 1));
      }
      results.innerHTML = visible
        .map((it, i) =>
          it.sep
            ? '<div class="menu-sep"></div>'
            : '<button class="cmd-item" data-i="' +
              i +
              '" data-selected="' +
              (i === sel ? "true" : "false") +
              '">' +
              ui.icon(it.icon) +
              "<span>" +
              ui.escapeHtml(it.label) +
              '</span><span class="cmd-shortcut">' +
              ui.escapeHtml(it.shortcut || "") +
              "</span></button>"
        )
        .join("");

      results.querySelectorAll(".cmd-item").forEach((btn) => {
        btn.addEventListener("mousemove", () => {
          sel = parseInt(btn.dataset.i, 10);
          updateSel();
        });
        btn.addEventListener("click", () => {
          const it = visible[parseInt(btn.dataset.i, 10)];
          if (it && it.action) {
            ui.closeModal();
            it.action();
          }
        });
      });
    };

    const updateSel = () => {
      results.querySelectorAll(".cmd-item").forEach((btn) => {
        btn.dataset.selected = String(parseInt(btn.dataset.i, 10) === sel);
      });
    };

    input.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        sel++;
        renderList(input.value);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        sel--;
        renderList(input.value);
      } else if (e.key === "Enter") {
        e.preventDefault();
        const visible = items.filter(
          (it) => it.sep || !input.value || it.label.toLowerCase().includes(input.value.toLowerCase())
        );
        const it = visible[sel];
        if (it && it.action) {
          ui.closeModal();
          it.action();
        }
      }
    });
    input.addEventListener("input", () => renderList(input.value));

    renderList("");
    requestAnimationFrame(() => input.focus());
  }

  /* ============================================================
     Search
     ============================================================ */
  function openSearch() {
    window.Lumen.search.open();
  }

  /* ============================================================
     Import: turn a local .txt/.md file into a real page
     ============================================================ */
  const importInput = document.getElementById("import-file");

  function wireImport() {
    importInput.addEventListener("change", async () => {
      const file = importInput.files && importInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async () => {
        const text = String(reader.result || "");
        const blocks = text
          .split(/\r?\n/)
          .filter((line) => line.trim().length)
          .map((line) => ({ type: "text", content: line }));
        const name = file.name.replace(/\.[^/.]+$/, "") || "Imported";
        const page = await store.createPage({ title: name, icon: "\uD83D\uDCC1", blocks: blocks });
        ui.showToast('Imported "' + name + '"', "success");
        openPage(page.id);
      };
      reader.readAsText(file);
      importInput.value = "";
    });
  }

  function triggerImport() {
    importInput.click();
  }

  /* ============================================================
     Keyboard shortcuts
     ============================================================ */
  function wireGlobalShortcuts() {
    document.addEventListener("keydown", (e) => {
      const mod = e.ctrlKey || e.metaKey;
      const loggedIn = window.Lumen.auth.isLoggedIn();

      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (loggedIn) openSearch();
        return;
      }
      if (mod && e.shiftKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        if (loggedIn) openCommandPalette();
        return;
      }
      if (mod && !e.shiftKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        if (loggedIn) createNewPage();
        return;
      }
      if (e.key === "Escape") {
        ui.closeMenus();
        ui.closeModal();
        window.Lumen.editor.closeAll();
      }
    });
  }

  /* ============================================================
     Init
     ============================================================ */
  window.Lumen.app = {
    boot,
    navigate,
    openPage,
    openSearch,
    openCommandPalette,
    toggleSidebar,
    logout,
    createNewPage,
    showLogin,
    showRegister,
    openProfileMenu,
  };

  document.addEventListener("DOMContentLoaded", boot);
})();
