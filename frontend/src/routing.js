/* URL contract for the app. React Router owns navigation; the store only
   mirrors the active view so sidebar and topbar state stay in sync. */

import { matchPath } from "react-router-dom";

export const VIEW_PATHS = Object.freeze({
  dashboard: "/",
  inbox: "/activity",
  settings: "/settings",
  templates: "/templates",
  favorites: "/favorites",
  search: "/search",
  trash: "/trash",
});

export const AUTH_PATHS = Object.freeze({
  login: "/login",
  register: "/register",
});

const VIEW_BY_PATH = new Map(
  Object.entries(VIEW_PATHS).map(([view, path]) => [path, view])
);

function normalizePathname(pathname) {
  const value = String(pathname || "/");
  if (value.length > 1 && value.endsWith("/")) return value.replace(/\/+$/, "");
  return value;
}

export function pathForView(view) {
  return VIEW_PATHS[view] || VIEW_PATHS.dashboard;
}

export function pagePath(pageId) {
  return "/page/" + encodeURIComponent(String(pageId || ""));
}

export function pageUrl(pageId, origin) {
  const base =
    typeof origin === "string"
      ? origin
      : typeof window !== "undefined"
        ? window.location.origin
        : "";
  return base + pagePath(pageId);
}

/**
 * Resolve a pathname into the part of the app it addresses.
 * Keeping this pure makes aliases and legacy links testable without a browser.
 */
export function matchAppPath(pathname) {
  const path = normalizePathname(pathname);

  if (path === AUTH_PATHS.login) return { kind: "auth", view: "login" };
  if (path === AUTH_PATHS.register) return { kind: "auth", view: "register" };
  if (path === "/inbox") return { kind: "redirect", to: VIEW_PATHS.inbox };

  const view = VIEW_BY_PATH.get(path);
  if (view) return { kind: "view", view };

  const page = matchPath({ path: "/page/:pageId", end: true }, path);
  if (page) return { kind: "page", view: "page", pageId: page.params.pageId };

  return { kind: "not-found" };
}

/** Convert old `#page/:id`, `#settings` links into the new pathname routes. */
export function legacyHashTarget(hash) {
  const raw = String(hash || "").replace(/^#/, "");
  if (!raw) return null;

  const simple = {
    login: AUTH_PATHS.login,
    register: AUTH_PATHS.register,
    inbox: VIEW_PATHS.inbox,
    settings: VIEW_PATHS.settings,
    templates: VIEW_PATHS.templates,
    favorites: VIEW_PATHS.favorites,
    search: VIEW_PATHS.search,
    trash: VIEW_PATHS.trash,
  };
  if (simple[raw]) return simple[raw];
  if (raw.startsWith("page/")) return pagePath(raw.slice(5));
  if (raw.startsWith("/")) return raw;
  return "/" + raw;
}

/** Only same-origin paths may be used as post-login destinations. */
export function safeInternalPath(value, fallback = VIEW_PATHS.dashboard) {
  if (typeof value !== "string") return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return fallback;
  }
  return value;
}
