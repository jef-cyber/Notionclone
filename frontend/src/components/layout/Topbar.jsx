import React from "react";

import { useStore } from "../../hooks.js";
import { store } from "../../core/store.js";
import { Icon, initials, isApple, showToast } from "../ui/index.jsx";
import { useApp } from "../../appContext.js";
import { openHelp, openMoreMenu, openProfileMenu, sharePage } from "../menus.jsx";
import { useIsMobile } from "../../hooks.js";

export default function Topbar({ toggleSidebar }) {
  const state = useStore();
  const app = useApp();
  const isMobile = useIsMobile();
  const isPage = state.view === "page";
  const page = isPage ? store.getPage(state.currentPageId) : null;

  let crumbs;
  if (isPage && page) {
    const path = store.getPath(page.id);
    crumbs = path.map((p, i) => (
      <React.Fragment key={p.id}>
        {i > 0 ? <span className="breadcrumb-sep">/</span> : null}
        <button
          className="breadcrumb-item"
          data-nav-page={p.id}
          aria-current={i === path.length - 1 ? "page" : undefined}
          onClick={() => app.openPage(p.id)}
        >
          <span
            className="page-icon"
            style={{ width: 16, height: 16, fontSize: 13 }}
          >
            {p.icon || "📝"}
          </span>
          <span>{p.title || "Untitled"}</span>
        </button>
      </React.Fragment>
    ));
  } else {
    const viewName =
      {
        dashboard: "Home",
        inbox: "Activity",
        settings: "Settings",
        templates: "Templates",
        favorites: "Favorites",
        search: "Search",
        trash: "Trash",
        page: "Page",
      }[state.view] || "Home";
    crumbs = (
      <>
        <button
          className="breadcrumb-item"
          data-nav-page="workspace"
          onClick={() => app.navigate("dashboard")}
        >
          {state.workspace.name || "Workspace"}
        </button>
        <span className="breadcrumb-sep">/</span>
        <button className="breadcrumb-item" aria-current="page">
          {viewName}
        </button>
      </>
    );
  }

  const searchLabel = isMobile ? null : <span>Search</span>;
  const kbdHint = isMobile ? null : <kbd>{isApple() ? "⌘" : "Ctrl"} K</kbd>;

  return (
    <header id="topbar" className="topbar">
      <div className="topbar-left">
        <button className="icon-btn" data-toggle-sidebar aria-label="Toggle sidebar" onClick={toggleSidebar}>
          <Icon name="menu" />
        </button>
        <nav className="breadcrumbs" aria-label="Breadcrumb">
          {crumbs}
        </nav>
      </div>
      <div className="topbar-right">
        <button
          className="search-trigger"
          data-open-search
          aria-label="Search"
          onClick={() => app.navigate("search")}
        >
          <Icon name="search" />
          {searchLabel}
          {kbdHint}
        </button>
        {page ? (
          <button className="topbar-label-btn" data-share onClick={() => sharePage(page)}>
            <Icon name="share" />
            <span className="share-label">Share</span>
          </button>
        ) : null}
        {page ? (
          <button
            className="icon-btn"
            data-fav
            aria-label="Toggle favorite"
            data-active={page.favorite ? "true" : "false"}
            onClick={() => {
              const now = store.toggleFavorite(page.id);
              showToast(now ? "Added to favorites" : "Removed from favorites");
            }}
          >
            <Icon name={page.favorite ? "starFilled" : "star"} />
          </button>
        ) : null}
        <button
          className="icon-btn"
          data-more
          aria-label="More actions"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            openMoreMenu(page, r.left, r.bottom + 4, {
              navigate: app.navigate,
              openPage: app.openPage,
              logout: app.logout,
            });
          }}
        >
          <Icon name="more" />
        </button>
        <button
          className="avatar"
          data-avatar
          aria-haspopup="menu"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            openProfileMenu(state, r.left, r.bottom + 4, {
              navigate: app.navigate,
              logout: app.logout,
            });
          }}
        >
          {initials(state.user.name || "?")}
        </button>
      </div>
    </header>
  );
}
