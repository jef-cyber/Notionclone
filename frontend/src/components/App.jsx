import React, { useCallback, useEffect, useRef, useState } from "react";

import { useStore } from "../hooks.js";
import { store } from "../core/store.js";
import { auth } from "../core/auth.js";
import theme from "../core/theme.js";
import * as api from "../core/api.js";
import {
  closeMenus,
  closeModal,
  MenuLayer,
  ModalLayer,
  showToast,
  ToastRoot,
} from "./ui/index.jsx";
import { AppContext } from "../appContext.js";
import { openProfileMenu as showProfileMenu } from "./menus.jsx";
import { AuthView, Landing } from "./auth/Auth.jsx";
import Sidebar from "./layout/Sidebar.jsx";
import Topbar from "./layout/Topbar.jsx";
import MobileNav from "./layout/MobileNav.jsx";
import Dashboard from "./views/Dashboard.jsx";
import Activity from "./views/Activity.jsx";
import Settings from "./views/Settings.jsx";
import Templates from "./views/Templates.jsx";
import Favorites from "./views/Favorites.jsx";
import SearchPage from "./views/SearchPage.jsx";
import Trash from "./views/Trash.jsx";
import PageView from "./views/PageView.jsx";
import SearchModal from "./overlays/SearchModal.jsx";
import CommandPalette from "./overlays/CommandPalette.jsx";

/* ---------- routing ---------- */
function parseHash() {
  const h = (window.location.hash || "").replace(/^#/, "");
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

function setHash(h) {
  const next = h || "";
  if (window.location.hash === next) return;
  if (next) window.location.hash = next;
  else {
    try {
      history.replaceState(null, "", window.location.pathname + window.location.search);
    } catch (e) {
      /* ignore */
    }
  }
}

function clearHash() {
  if (!window.location.hash) return;
  try {
    history.replaceState(null, "", window.location.pathname + window.location.search);
  } catch (e) {
    /* ignore */
  }
}

const HASH_FOR_VIEW = {
  dashboard: "",
  inbox: "#inbox",
  settings: "#settings",
  templates: "#templates",
  favorites: "#favorites",
  trash: "#trash",
  search: "#search",
};

export default function App() {
  const state = useStore();
  const [booted, setBooted] = useState(false);
  const [authMode, setAuthMode] = useState("landing");
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const importRef = useRef(null);
  const contentRef = useRef(null);
  const bootRef = useRef(false);

  const isLoggedIn = () => !!api.getToken();

  const navigate = useCallback((view) => {
    if (!isLoggedIn()) {
      setAuthMode("login");
      setHash("#login");
      return;
    }
    store.setView(view);
    setMobileSidebarOpen(false);
    setHash(HASH_FOR_VIEW[view] || "");
  }, []);

  const openPage = useCallback(async (id) => {
    const page = store.getPage(id);
    if (!page) {
      // A deep link can name a page this workspace doesn't have.
      store.getState().view = "page";
      store.getState().currentPageId = id;
      store.commit("nav");
      setHash("#page/" + id);
      return;
    }
    if (page.isArchived) {
      showToast("This page is in the trash", "info");
      navigate("trash");
      return;
    }

    store.flushPage(store.getState().currentPageId);
    const target = await store.hydratePage(id);
    if (!target) {
      store.refreshPages();
      store.getState().view = "page";
      store.getState().currentPageId = id;
      store.commit("nav");
      return;
    }

    store.navigate(id);
    setMobileSidebarOpen(false);
    setHash("#page/" + id);
  }, [navigate]);

  const createNewPage = useCallback(async () => {
    try {
      const page = await store.createPage({});
      showToast("Page created", "success");
      openPage(page.id);
    } catch (err) {
      showToast(err.message || "Could not create the page", "error");
    }
  }, [openPage]);

  const routeFromHash = useCallback(() => {
    const parsed = parseHash();
    if (!isLoggedIn()) {
      if (parsed.route === "login") {
        setAuthMode("login");
      } else if (parsed.route === "register") {
        setAuthMode("register");
      } else {
        setAuthMode("landing");
        clearHash();
      }
      return;
    }

    if (parsed.route === "login" || parsed.route === "register") {
      clearHash();
      navigate("dashboard");
      return;
    }

    if (parsed.route === "page") {
      const page = store.getPage(parsed.id);
      if (!page) {
        store.getState().view = "page";
        store.getState().currentPageId = parsed.id;
        store.commit("nav");
        return;
      }
      const current = store.getState();
      if (current.view === "page" && current.currentPageId === page.id && page.blocksLoaded) return;
      openPage(page.id);
      return;
    }

    if (parsed.route !== store.getState().view) store.setView(parsed.route);
    setAuthMode("workspace");
  }, [navigate, openPage]);

  const authenticate = useCallback(async (result, isLogin) => {
    store.adoptSession(result);
    await store.refreshPages();
    showToast(isLogin ? "Welcome back" : "Account created — welcome to Lumen!", "success");
    navigate("dashboard");
  }, [navigate]);

  const logout = useCallback(() => {
    store.flushAll();
    auth.logout().then(() => {
      store.clearSession();
      closeMenus();
      closeModal();
      clearHash();
      setAuthMode("landing");
      setMobileSidebarOpen(false);
    });
  }, []);

  const showLogin = useCallback(() => {
    if (isLoggedIn()) {
      setAuthMode("workspace");
      return;
    }
    closeMenus();
    closeModal();
    setAuthMode("login");
    setHash("#login");
  }, []);

  const showRegister = useCallback(() => {
    if (isLoggedIn()) {
      setAuthMode("workspace");
      return;
    }
    closeMenus();
    closeModal();
    setAuthMode("register");
    setHash("#register");
  }, []);

  const toggleSidebar = useCallback(() => {
    if (window.matchMedia("(max-width: 720px)").matches) {
      setMobileSidebarOpen((open) => !open);
    } else {
      store.updateSettings(
        { sidebarOpen: !store.getState().settings.sidebarOpen },
        "settings"
      );
    }
  }, []);

  const openProfileMenu = useCallback((x, y) => {
    showProfileMenu(store.getState(), x, y, { navigate, logout });
  }, [navigate, logout]);

  const triggerImport = useCallback(() => {
    if (importRef.current) importRef.current.click();
  }, []);

  const onImportFile = useCallback(async (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const text = String(reader.result || "");
      const blocks = text
        .split(/\r?\n/)
        .filter((line) => line.trim().length)
        .map((line) => ({ type: "text", content: line }));
      const name = file.name.replace(/\.[^/.]+$/, "") || "Imported";
      try {
        const page = await store.createPage({ title: name, icon: "\uD83D\uDCC1", blocks });
        showToast('Imported "' + name + '"', "success");
        openPage(page.id);
      } catch (err) {
        showToast(err.message, "error");
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  }, [openPage]);

  /* Boot session and route. */
  useEffect(() => {
    if (bootRef.current) return;
    bootRef.current = true;
    let cancelled = false;
    theme.apply();
    (async () => {
      await store.loadSession();
      if (cancelled) return;
      setBooted(true);
      routeFromHash();
    })();
    return () => {
      cancelled = true;
    };
  }, [routeFromHash]);

  /* Hash routing. */
  useEffect(() => {
    if (!booted) return undefined;
    const onHashChange = () => routeFromHash();
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [booted, routeFromHash]);

  /* Session expiry from any API request. */
  useEffect(() => {
    const onUnauthorized = () => {
      store.clearSession();
      closeMenus();
      closeModal();
      clearHash();
      setAuthMode("landing");
      setMobileSidebarOpen(false);
    };
    window.addEventListener("lumen:unauthorized", onUnauthorized);
    return () => window.removeEventListener("lumen:unauthorized", onUnauthorized);
  }, []);

  /* Preference classes and theme. */
  useEffect(() => {
    document.body.classList.toggle("no-anim", !state.settings.animations);
    document.body.classList.toggle("compact", !!state.settings.compactMode);
  }, [state.settings.animations, state.settings.compactMode]);

  useEffect(() => {
    theme.apply();
  }, [state.settings.theme]);

  /* Keep the content pane scrolled to the top when the destination changes. */
  useEffect(() => {
    if (contentRef.current) contentRef.current.scrollTop = 0;
  }, [state.view, state.currentPageId]);

  /* Global shortcuts. */
  useEffect(() => {
    const onKeyDown = (e) => {
      const mod = e.ctrlKey || e.metaKey;
      const loggedIn = !!api.getToken();
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (loggedIn) setSearchOpen(true);
        return;
      }
      if (mod && e.shiftKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        if (loggedIn) setPaletteOpen(true);
        return;
      }
      if (mod && !e.shiftKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        if (loggedIn) createNewPage();
        return;
      }
      if (e.key === "Escape") {
        closeMenus();
        closeModal();
        window.dispatchEvent(new CustomEvent("lumen:close-editor-overlays"));
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [createNewPage]);

  const loggedIn = !!state.loggedIn && !!api.getToken();
  const contextValue = {
    navigate,
    openPage,
    createNewPage,
    logout,
    openProfileMenu,
    triggerImport,
    setSearchOpen,
    setPaletteOpen,
    showLogin,
    showRegister,
    authenticate,
  };

  let shell = null;
  if (!loggedIn) {
    shell =
      authMode === "login" || authMode === "register" ? (
        <AuthView
          key={authMode}
          mode={authMode}
          onSwitch={(next) => (next === "login" ? showLogin() : showRegister())}
          onAuthenticated={authenticate}
        />
      ) : (
        <Landing onLogin={showLogin} onSignup={showRegister} />
      );
  } else {
    shell = (
      <div className="workspace">
        <Sidebar
          mobileOpen={mobileSidebarOpen}
          setMobileOpen={setMobileSidebarOpen}
          openProfileMenu={openProfileMenu}
          onLogout={logout}
        />
        <div
          className="sidebar-overlay"
          hidden={!mobileSidebarOpen}
          onClick={() => setMobileSidebarOpen(false)}
        />
        <div className="workspace-main">
          <Topbar toggleSidebar={toggleSidebar} />
          <main id="content" className="content" tabIndex="-1" ref={contentRef}>
            {renderView(state, openPage)}
          </main>
          <MobileNav
            state={state}
            navigate={navigate}
            createNewPage={createNewPage}
          />
        </div>
      </div>
    );
  }

  return (
    <AppContext.Provider value={contextValue}>
      {shell}
      <MenuLayer />
      <ModalLayer />
      <ToastRoot />
      <input
        type="file"
        id="import-file"
        accept=".txt,.md,.markdown"
        hidden
        ref={importRef}
        onChange={onImportFile}
      />
      <SearchModal
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        openPage={openPage}
      />
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        navigate={navigate}
        createNewPage={createNewPage}
        openPage={openPage}
        triggerImport={triggerImport}
      />
    </AppContext.Provider>
  );
}

function renderView(state, openPage) {
  if (state.view === "page") {
    return <PageView pageId={state.currentPageId} openPage={openPage} />;
  }
  if (state.view === "dashboard") return <Dashboard />;
  if (state.view === "inbox") return <Activity />;
  if (state.view === "settings") return <Settings />;
  if (state.view === "templates") return <Templates />;
  if (state.view === "favorites") return <Favorites />;
  if (state.view === "search") return <SearchPage />;
  if (state.view === "trash") return <Trash />;
  return <Dashboard />;
}
