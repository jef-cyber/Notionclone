/* Lumen — theme: light / dark / system, persisted in settings. */

import { store } from "./store.js";

export function resolve() {
  const t = store.getState().settings.theme;
  if (t === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return t;
}

export function applyTheme(withTransition) {
  const resolved = resolve();
  const html = document.documentElement;

  if (withTransition && document.startViewTransition) {
    document.startViewTransition(() => {
      html.dataset.theme = resolved;
    });
  } else {
    html.dataset.theme = resolved;
  }

  // Keep any theme toggle buttons that are not React-rendered (there are none
  // today, but this preserves the original contract) in sync.
  document.querySelectorAll("[data-theme-toggle-icon]").forEach((el) => {
    el.dataset.theme = resolved;
  });

  // Highlight the matching theme option in Settings.
  document.querySelectorAll("[data-theme-option]").forEach((el) => {
    el.dataset.active = String(el.dataset.themeOption === store.getState().settings.theme);
  });

  // Sync view transition class for the cosmetic fade.
  const body = document.body;
  body.classList.remove("theme-switching");
  void body.offsetWidth;
  body.classList.add("theme-switching");
  setTimeout(() => body.classList.remove("theme-switching"), 250);
}

export function setTheme(t) {
  store.updateSettings({ theme: t }, "settings");
  applyTheme(true);
}

export function toggleTheme() {
  const next = resolve() === "dark" ? "light" : "dark";
  setTheme(next);
}

// React to system theme changes when using "system".
if (typeof window !== "undefined") {
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (store.getState().settings.theme === "system") applyTheme();
  });
}

export const theme = {
  apply: applyTheme,
  setTheme,
  toggleTheme,
  current: resolve,
};

export default theme;
