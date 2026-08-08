/* ============================================================
   Lumen — theme: light / dark / system, persisted in settings.
   ============================================================ */

(function () {
  "use strict";

  const { store, ui } = window.Lumen;

  function resolve() {
    const t = store.getState().settings.theme;
    if (t === "system") {
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    return t;
  }

  function applyTheme(withTransition) {
    const resolved = resolve();
    const html = document.documentElement;

    if (withTransition && document.startViewTransition) {
      document.startViewTransition(() => {
        html.dataset.theme = resolved;
      });
    } else {
      html.dataset.theme = resolved;
    }

    // Update any theme toggle buttons (sun/moon glyph)
    document.querySelectorAll("[data-theme-toggle-icon]").forEach((el) => {
      el.innerHTML = ui.icon(resolved === "dark" ? "sun" : "moon");
    });

    // Highlight the matching theme option in Settings
    document.querySelectorAll("[data-theme-option]").forEach((el) => {
      const on = el.dataset.themeOption === store.getState().settings.theme;
      el.dataset.active = String(on);
    });

    // Sync view transition class for cosmetic fade
    const body = document.body;
    body.classList.remove("theme-switching");
    void body.offsetWidth;
    body.classList.add("theme-switching");
    setTimeout(() => body.classList.remove("theme-switching"), 250);
  }

  function setTheme(t) {
    store.getState().settings.theme = t;
    store.save();
    applyTheme(true);
  }

  function toggleTheme() {
    const next = resolve() === "dark" ? "light" : "dark";
    setTheme(next);
  }

  // React to system theme changes when using "system"
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (store.getState().settings.theme === "system") applyTheme();
  });

  window.Lumen.theme = {
    apply: applyTheme,
    setTheme,
    toggleTheme,
    current: resolve,
  };
})();
