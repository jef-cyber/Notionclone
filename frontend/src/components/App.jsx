import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";

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
import NotFound from "./views/NotFound.jsx";
import SearchModal from "./overlays/SearchModal.jsx";
import CommandPalette from "./overlays/CommandPalette.jsx";
import {
  AUTH_PATHS,
  VIEW_PATHS,
  legacyHashTarget,
  matchAppPath,
  pagePath,
  pathForView,
  safeInternalPath,
} from "../routing.js";

/* React Router owns the URL. The store mirrors the active view so the
   sidebar, breadcrumbs and mobile nav do not need a second router. */

export default function App() {
  const state = useStore();
  const location = useLocation();
  const reactNavigate = useNavigate();
  const [booted, setBooted] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const importRef = useRef(null);
  const contentRef = useRef(null);
  const bootRef = useRef(false);

  const loggedIn = !!state.loggedIn && !!api.getToken();
  const route = matchAppPath(location.pathname);

  const navigate = useCallback(
    (view) => {
      if (!Object.prototype.hasOwnProperty.call(VIEW_PATHS, view)) return;
      const target = pathForView(view);
      setMobileSidebarOpen(false);
      if (!api.getToken()) {
        reactNavigate(AUTH_PATHS.login, {
          replace: true,
          state: { from: target },
        });
        return;
      }
      store.setView(view);
      reactNavigate(target);
    },
    [reactNavigate]
  );

  const openPage = useCallback(
    (id) => {
      if (!id) return;
      const target = pagePath(id);
      setMobileSidebarOpen(false);
      if (!api.getToken()) {
        reactNavigate(AUTH_PATHS.login, {
          replace: true,
          state: { from: target },
        });
        return;
      }
      const page = store.getPage(id);
      if (page && page.isArchived) {
        showToast("This page is in the trash", "info");
        navigate("trash");
        return;
      }
      if (window.location.pathname !== target) {
        reactNavigate(target);
      }
    },
    [navigate, reactNavigate]
  );

  const createNewPage = useCallback(async () => {
    try {
      const page = await store.createPage({});
      showToast("Page created", "success");
      openPage(page.id);
    } catch (err) {
      showToast(err.message || "Could not create the page", "error");
    }
  }, [openPage]);

  const authenticate = useCallback(
    async (result, isLogin) => {
      store.adoptSession(result);
      await store.refreshPages();
      showToast(
        isLogin ? "Welcome back" : "Account created — welcome to Lumen!",
        "success"
      );
      const requested = safeInternalPath(
        location.state && location.state.from,
        VIEW_PATHS.dashboard
      );
      const destination =
        requested === AUTH_PATHS.login || requested === AUTH_PATHS.register
          ? VIEW_PATHS.dashboard
          : requested;
      reactNavigate(destination, { replace: true });
    },
    [location.state, reactNavigate]
  );

  const logout = useCallback(() => {
    store.flushAll();
    auth.logout().then(() => {
      store.clearSession();
      closeMenus();
      closeModal();
      setMobileSidebarOpen(false);
      reactNavigate(VIEW_PATHS.dashboard, { replace: true });
    });
  }, [reactNavigate]);

  const showLogin = useCallback(() => {
    if (api.getToken()) {
      reactNavigate(VIEW_PATHS.dashboard, { replace: true });
      return;
    }
    closeMenus();
    closeModal();
    const from = location.pathname + location.search;
    reactNavigate(AUTH_PATHS.login, {
      state: { from: from === AUTH_PATHS.register ? VIEW_PATHS.dashboard : from },
    });
  }, [location.pathname, location.search, reactNavigate]);

  const showRegister = useCallback(() => {
    if (api.getToken()) {
      reactNavigate(VIEW_PATHS.dashboard, { replace: true });
      return;
    }
    closeMenus();
    closeModal();
    const from = location.pathname + location.search;
    reactNavigate(AUTH_PATHS.register, {
      state: { from: from === AUTH_PATHS.login ? VIEW_PATHS.dashboard : from },
    });
  }, [location.pathname, location.search, reactNavigate]);

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

  const openProfileMenu = useCallback(
    (x, y) => {
      showProfileMenu(store.getState(), x, y, { navigate, logout });
    },
    [navigate, logout]
  );

  const triggerImport = useCallback(() => {
    if (importRef.current) importRef.current.click();
  }, []);

  const onImportFile = useCallback(
    async (event) => {
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
          const page = await store.createPage({
            title: name,
            icon: "\uD83D\uDCC1",
            blocks,
          });
          showToast('Imported "' + name + '"', "success");
          openPage(page.id);
        } catch (err) {
          showToast(err.message, "error");
        }
      };
      reader.readAsText(file);
      event.target.value = "";
    },
    [openPage]
  );

  /* Boot the session once. Router-backed effects below resolve the URL. */
  useEffect(() => {
    if (bootRef.current) return undefined;
    bootRef.current = true;
    let cancelled = false;
    theme.apply();
    (async () => {
      await store.loadSession();
      if (cancelled) return;
      setBooted(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /* Translate URL changes from links, back/forward and deep links into store
     state. Page hydration is owned by PageView so this effect stays sync. */
  useEffect(() => {
    if (!booted || !loggedIn) return undefined;

    if (route.kind === "auth") {
      reactNavigate(VIEW_PATHS.dashboard, { replace: true });
      return undefined;
    }

    if (route.kind === "redirect") {
      reactNavigate(route.to, { replace: true });
      return undefined;
    }

    if (route.kind === "not-found") {
      if (store.getState().view !== "notfound") store.setView("notfound");
      return undefined;
    }

    if (route.kind === "page") {
      const pageId = route.pageId;
      const page = store.getPage(pageId);
      if (!page) {
        store.setPageView(pageId);
        return undefined;
      }
      if (page.isArchived) {
        showToast("This page is in the trash", "info");
        reactNavigate(VIEW_PATHS.trash, { replace: true });
        return undefined;
      }
      const current = store.getState();
      if (current.view !== "page" || current.currentPageId !== pageId) {
        if (current.currentPageId) store.flushPage(current.currentPageId);
        store.navigate(pageId);
      }
      return undefined;
    }

    if (store.getState().view !== route.view) store.setView(route.view);
    return undefined;
  }, [
    booted,
    loggedIn,
    route.kind,
    route.pageId,
    route.to,
    route.view,
    reactNavigate,
  ]);

  /* Old share links used #page/:id and #settings. Convert them once without a
     full reload so existing bookmarks keep working. */
  useEffect(() => {
    if (!booted) return undefined;
    const convert = () => {
      const target = legacyHashTarget(window.location.hash);
      if (!target) return;
      const next = safeInternalPath(target, VIEW_PATHS.dashboard);
      reactNavigate(next, { replace: true });
    };
    convert();
    window.addEventListener("hashchange", convert);
    return () => window.removeEventListener("hashchange", convert);
  }, [booted, reactNavigate]);

  /* Session expiry from any API request. */
  useEffect(() => {
    const onUnauthorized = () => {
      store.clearSession();
      closeMenus();
      closeModal();
      setMobileSidebarOpen(false);
      reactNavigate(VIEW_PATHS.dashboard, { replace: true });
    };
    window.addEventListener("lumen:unauthorized", onUnauthorized);
    return () => window.removeEventListener("lumen:unauthorized", onUnauthorized);
  }, [reactNavigate]);

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
  }, [location.pathname, state.currentPageId]);

  /* Global shortcuts. */
  useEffect(() => {
    const onKeyDown = (e) => {
      const mod = e.ctrlKey || e.metaKey;
      const hasToken = !!api.getToken();
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (hasToken) setSearchOpen(true);
        return;
      }
      if (mod && e.shiftKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        if (hasToken) setPaletteOpen(true);
        return;
      }
      if (mod && !e.shiftKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        if (hasToken) createNewPage();
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

  const overlays = (
    <>
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
    </>
  );

  if (!booted) {
    return (
      <div className="boot-screen" role="status" aria-live="polite">
        <img
          className="boot-logo"
          src="/assets/icons/logo.svg"
          alt=""
          aria-hidden="true"
        />
        <div className="boot-spinner" aria-hidden="true" />
        <p className="boot-text">Loading your workspace…</p>
      </div>
    );
  }

  if (!loggedIn) {
    const from = location.pathname + location.search;
    return (
      <AppContext.Provider value={contextValue}>
        <Routes>
          <Route
            path={AUTH_PATHS.login}
            element={
              <AuthView
                key="login"
                mode="login"
                onSwitch={showRegister}
                onAuthenticated={authenticate}
              />
            }
          />
          <Route
            path={AUTH_PATHS.register}
            element={
              <AuthView
                key="register"
                mode="register"
                onSwitch={showLogin}
                onAuthenticated={authenticate}
              />
            }
          />
          <Route
            path={VIEW_PATHS.dashboard}
            element={<Landing onLogin={showLogin} onSignup={showRegister} />}
          />
          <Route
            path="*"
            element={
              <Navigate
                to={AUTH_PATHS.login}
                replace
                state={{ from: safeInternalPath(from, VIEW_PATHS.dashboard) }}
              />
            }
          />
        </Routes>
        {overlays}
      </AppContext.Provider>
    );
  }

  return (
    <AppContext.Provider value={contextValue}>
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
            <Routes>
              <Route path={VIEW_PATHS.dashboard} element={<Dashboard />} />
              <Route path={VIEW_PATHS.inbox} element={<Activity />} />
              <Route path="/inbox" element={<Navigate to={VIEW_PATHS.inbox} replace />} />
              <Route path={VIEW_PATHS.settings} element={<Settings />} />
              <Route path={VIEW_PATHS.templates} element={<Templates />} />
              <Route path={VIEW_PATHS.favorites} element={<Favorites />} />
              <Route path={VIEW_PATHS.search} element={<SearchPage />} />
              <Route path={VIEW_PATHS.trash} element={<Trash />} />
              <Route path="/page/:pageId" element={<PageRoute openPage={openPage} />} />
              <Route path={AUTH_PATHS.login} element={<Navigate to={VIEW_PATHS.dashboard} replace />} />
              <Route path={AUTH_PATHS.register} element={<Navigate to={VIEW_PATHS.dashboard} replace />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </main>
          <MobileNav
            state={state}
            navigate={navigate}
            createNewPage={createNewPage}
          />
        </div>
      </div>
      {overlays}
    </AppContext.Provider>
  );
}

function PageRoute({ openPage }) {
  const { pageId } = useParams();
  return <PageView pageId={pageId} openPage={openPage} />;
}
