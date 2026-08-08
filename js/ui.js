/* ============================================================
   Lumen — ui: icons, toasts, modals, dropdowns/context menus,
   and small shared helpers.
   ============================================================ */

(function () {
  "use strict";

  /* ---------- inline SVG icon set (feather-style, MIT) ---------- */
  const PATHS = {
    plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    "chevron-right": '<polyline points="9 18 15 12 9 6"/>',
    "chevron-down": '<polyline points="6 9 12 15 18 9"/>',
    more: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
    search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
    star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
    starFilled:
      '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" fill="currentColor" stroke="currentColor"/>',
    home: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
    inbox:
      '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
    settings:
      '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    share:
      '<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/>',
    sun: '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>',
    moon: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
    monitor: '<rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>',
    user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    bell: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
    external:
      '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>',
    close: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    grip: '<circle cx="9" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="18" r="1"/>',
    type: '<polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    bold: '<path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/>',
    italic: '<line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/>',
    underline: '<path d="M6 3v7a6 6 0 0 0 6 6 6 6 0 0 0 6-6V3"/><line x1="4" y1="21" x2="20" y2="21"/>',
    strike: '<path d="M16 4H9a3 3 0 0 0-2.83 4"/><path d="M14 12a4 4 0 0 1 0 8H6"/><line x1="4" y1="12" x2="20" y2="12"/>',
    code: '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>',
    "align-left": '<line x1="17" y1="10" x2="3" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="17" y1="18" x2="3" y2="18"/>',
    "align-center": '<line x1="18" y1="10" x2="6" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="18" y1="18" x2="6" y2="18"/>',
    "align-right": '<line x1="21" y1="10" x2="7" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="21" y1="18" x2="7" y2="18"/>',
    trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
    help: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    check: '<polyline points="20 6 9 17 4 12"/>',
    "file-text": '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
    folder: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
    layout: '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/>',
    import: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
    message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    "arrow-up-right": '<line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/>',
    "arrow-left": '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>',
    "check-circle": '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
    info: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
    "alert-triangle": '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    "folder-plus": '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/>',
    pencil: '<path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>',
    dot: '<circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/>',
    menu: '<line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>',
    command:
      '<path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z"/>',
    "rotate-cw":
      '<polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>',
  };

  function icon(name, size) {
    const path = PATHS[name] || PATHS.dot;
    const sz = size ? ` style="width:${size}px;height:${size}px"` : "";
    return (
      '<span class="icon"' +
      sz +
      ' aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      path +
      "</svg></span>"
    );
  }

  /* ---------- small helpers ---------- */
  function escapeHtml(str) {
    if (str === null || str === undefined) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function debounce(fn, wait) {
    let t;
    return function () {
      const ctx = this;
      const args = arguments;
      clearTimeout(t);
      t = setTimeout(() => fn.apply(ctx, args), wait);
    };
  }

  function initials(name) {
    return String(name || "?")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0] || "")
      .join("")
      .toUpperCase();
  }

  function isMobile() {
    return window.matchMedia("(max-width: 720px)").matches;
  }

  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
    }
    return Promise.resolve(fallbackCopy(text));
  }
  function fallbackCopy(text) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    return Promise.resolve();
  }

  /* ---------- toasts ---------- */
  const toastRoot = document.getElementById("toast-root");

  function showToast(message, type) {
    type = type || "success";
    const el = document.createElement("div");
    el.className = "toast";
    el.dataset.type = type;
    const iconName =
      type === "error" ? "alert-triangle" : type === "info" ? "info" : "check-circle";
    el.innerHTML = icon(iconName) + "<span>" + escapeHtml(message) + "</span>";
    toastRoot.appendChild(el);
    setTimeout(() => {
      el.classList.add("is-leaving");
      setTimeout(() => el.remove(), 200);
    }, 2800);
  }

  /* ---------- modals ---------- */
  const modalRoot = document.getElementById("modal-root");

  function closeModal() {
    modalRoot.dataset.open = "false";
    modalRoot.innerHTML = "";
  }

  /**
   * Open a modal. Returns the modal element.
   * opts: { title, body (html), footer (html), size ('modal-sm'|'modal-lg'), onClose }
   */
  function openModal(opts) {
    closeModal();
    modalRoot.innerHTML =
      '<div class="modal-overlay" data-modal-close></div>' +
      '<div class="modal ' +
      (opts.size || "") +
      '" role="dialog" aria-modal="true" aria-label="' +
      escapeHtml(opts.title || "Dialog") +
      '">' +
      '<div class="modal-header"><h2 class="modal-title">' +
      escapeHtml(opts.title || "") +
      '</h2><button class="icon-btn" data-modal-close aria-label="Close">' +
      icon("close") +
      "</button></div>" +
      '<div class="modal-body">' +
      (opts.body || "") +
      "</div>" +
      (opts.footer ? '<div class="modal-footer">' + opts.footer + "</div>" : "") +
      "</div>";
    modalRoot.dataset.open = "true";

    modalRoot.querySelectorAll("[data-modal-close]").forEach((el) => {
      el.addEventListener("click", () => closeModal());
    });

    const modal = modalRoot.querySelector(".modal");
    // focus first focusable
    const focusable = modal.querySelector("input, button, textarea, select");
    if (focusable) focusable.focus();

    if (opts.onClose) {
      const observer = new MutationObserver(() => {
        if (!modalRoot.contains(modal)) {
          observer.disconnect();
          opts.onClose();
        }
      });
      observer.observe(modalRoot, { childList: true });
    }
    return modal;
  }

  /** Promise-based confirm dialog. */
  function confirmDialog(opts) {
    return new Promise((resolve) => {
      const modal = openModal({
        title: opts.title || "Are you sure?",
        body:
          '<div class="confirm-desc">' +
          (opts.message || "") +
          "</div>",
        size: "modal-sm",
        footer:
          '<button class="btn btn-secondary" data-confirm-cancel>Cancel</button>' +
          '<button class="btn ' +
          (opts.danger ? "btn-danger" : "btn-primary") +
          '" data-confirm-ok>' +
          escapeHtml(opts.confirmLabel || "Confirm") +
          "</button>",
        onClose: () => resolve(false),
      });
      modal.querySelector("[data-confirm-cancel]").addEventListener("click", () => {
        closeModal();
        resolve(false);
      });
      modal.querySelector("[data-confirm-ok]").addEventListener("click", () => {
        closeModal();
        resolve(true);
      });
    });
  }

  /* ---------- dropdowns / context menus ---------- */
  const menuRoot = document.getElementById("menu-root");
  let menus = []; // stack: { el, submenuOf }

  function closeMenus() {
    menus.forEach((m) => m.el.remove());
    menus = [];
    menuRoot.dataset.open = "false";
  }

  function fitToViewport(el, x, y) {
    const r = el.getBoundingClientRect();
    let left = x;
    let top = y;
    if (left + r.width > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - r.width - 8);
    }
    if (top + r.height > window.innerHeight - 8) {
      top = Math.max(8, window.innerHeight - r.height - 8);
    }
    el.style.left = left + "px";
    el.style.top = top + "px";
  }

  function buildMenuEl(opts) {
    const el = document.createElement("div");
    el.className = "menu";
    el.setAttribute("role", "menu");

    if (opts.header) {
      const h = document.createElement("div");
      h.className = "menu-header";
      h.innerHTML =
        '<div class="menu-header-name">' +
        escapeHtml(opts.header.name || "") +
        "</div>" +
        (opts.header.sub
          ? '<div class="menu-header-sub">' + escapeHtml(opts.header.sub) + "</div>"
          : "");
      el.appendChild(h);
    }

    opts.items.forEach((item) => {
      if (item.sep) {
        const sep = document.createElement("div");
        sep.className = "menu-sep";
        el.appendChild(sep);
        return;
      }
      const btn = document.createElement("button");
      btn.className = "menu-item";
      btn.setAttribute("role", "menuitem");
      if (item.danger) btn.dataset.danger = "true";
      if (item.icon) btn.innerHTML = icon(item.icon);
      btn.innerHTML += '<span class="menu-item-label">' + escapeHtml(item.label) + "</span>";
      if (item.checked) btn.innerHTML += '<span class="menu-caret">' + icon("check") + "</span>";
      else if (item.caret || item.items)
        btn.innerHTML += '<span class="menu-caret">' + icon("chevron-right") + "</span>";
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (item.items) {
          toggleSubmenu(btn, item.items);
          return;
        }
        if (item.action) item.action();
        closeMenus();
      });
      if (item.items) {
        btn.addEventListener("mouseenter", () => openSubmenu(btn, item.items));
      }
      el.appendChild(btn);
    });
    return el;
  }

  function openSubmenu(anchor, items) {
    // close existing submenus first
    while (menus.length > 1) {
      const m = menus.pop();
      m.el.remove();
    }
    const parentMenu = menus[0].el;
    const sub = buildMenuEl({ items });
    sub.className += " submenu";
    menuRoot.appendChild(sub);
    menus.push({ el: sub, submenuOf: parentMenu });

    const anchorRect = anchor.getBoundingClientRect();
    const parentRect = parentMenu.getBoundingClientRect();
    let left = parentRect.right + 2;
    let top = anchorRect.top - parentRect.top + parentRect.top - 4;
    if (left + sub.offsetWidth > window.innerWidth - 8) {
      left = parentRect.left - sub.offsetWidth - 2;
    }
    fitToViewport(sub, left, top);
  }

  function toggleSubmenu(anchor, items) {
    const isOpen = menus.some((m) => m.submenuOf === anchor.closest(".menu"));
    if (isOpen) {
      closeMenus();
      return;
    }
    openSubmenu(anchor, items);
  }

  /**
   * Open a dropdown/context menu at screen coords.
   * opts: { x, y, header, items, align }
   */
  function openMenu(opts) {
    closeMenus();
    const el = buildMenuEl(opts);
    menuRoot.appendChild(el);
    menuRoot.dataset.open = "true";
    menus = [{ el, submenuOf: null }];

    const x = opts.align === "end" ? opts.x - el.offsetWidth : opts.x;
    fitToViewport(el, x, opts.y);

    // backdrop click
    const backdrop = document.createElement("div");
    backdrop.className = "menu-backdrop";
    menuRoot.prepend(backdrop);
    menuRoot._backdrop = backdrop;
    backdrop.addEventListener("pointerdown", (e) => {
      if (e.target === backdrop) closeMenus();
    });
  }

  /** Open a menu anchored to a button element. */
  function openMenuAt(anchor, opts) {
    const r = anchor.getBoundingClientRect();
    const menu = buildMenuEl(Object.assign({}, opts));
    openMenu(Object.assign({}, opts, { x: r.left, y: r.bottom + 4 }));
    return menu;
  }

  /* ---------- export ---------- */
  window.Lumen = window.Lumen || {};
  window.Lumen.ui = {
    icon,
    escapeHtml,
    debounce,
    initials,
    isMobile,
    copyToClipboard,
    showToast,
    openModal,
    closeModal,
    confirmDialog,
    openMenu,
    closeMenus,
    PATHS,
  };
})();
