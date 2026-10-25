import React from "react";

import { store } from "../core/store.js";
import theme from "../core/theme.js";
import { copyToClipboard, confirmDialog, Icon, initials, openMenu, openModal, showToast } from "./ui/index.jsx";

/* Topbar and sidebar share these menus so both entry points stay identical. */

export function themeItems(settings) {
  return [
    {
      label: "Light",
      icon: "sun",
      checked: settings.theme === "light",
      action: () => theme.setTheme("light"),
    },
    {
      label: "Dark",
      icon: "moon",
      checked: settings.theme === "dark",
      action: () => theme.setTheme("dark"),
    },
    {
      label: "System",
      icon: "monitor",
      checked: settings.theme === "system",
      action: () => theme.setTheme("system"),
    },
  ];
}

export function openProfileMenu(state, x, y, actions) {
  openMenu({
    x,
    y,
    header: { name: state.user.name || "", sub: state.user.email || "" },
    items: [
      {
        label: "My Profile",
        icon: "user",
        action: () => actions.navigate("settings"),
      },
      {
        label: "Settings",
        icon: "settings",
        action: () => actions.navigate("settings"),
      },
      {
        label: "Theme",
        icon: state.settings.theme === "dark" ? "moon" : "sun",
        caret: true,
        items: themeItems(state.settings),
      },
      { label: "Help", icon: "help", action: () => openHelp() },
      { sep: true },
      { label: "Log out", icon: "logout", danger: true, action: actions.logout },
    ],
  });
}

export function openMoreMenu(page, x, y, actions) {
  const items = [];
  if (page) {
    items.push(
      {
        label: page.favorite ? "Remove from Favorites" : "Add to Favorites",
        icon: "star",
        action: () => {
          store.toggleFavorite(page.id);
          const fresh = store.getPage(page.id);
          // Read the updated value: the action used to inspect the object from
          // before the toggle, which always showed the same toast.
          const on = fresh ? fresh.favorite : false;
          showToast(on ? "Added to favorites" : "Removed from favorites");
        },
      },
      {
        label: "Duplicate page",
        icon: "copy",
        action: async () => {
          const copy = await store.duplicatePage(page.id);
          showToast("Page duplicated", "success");
          actions.openPage(copy.id);
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
            showToast("Page moved to trash", "info");
          };
          if (!confirmFirst) {
            doDelete();
            return;
          }
          confirmDialog({
            title: "Move to trash?",
            message: (
              <>
                This will move &quot;
                <span className="confirm-name">{page.title || "Untitled"}</span>&quot; and
                any nested pages to trash.
              </>
            ),
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
      {
        label: "Settings",
        icon: "settings",
        action: () => actions.navigate("settings"),
      },
      {
        label: "Theme",
        icon: state.settings.theme === "dark" ? "moon" : "sun",
        caret: true,
        items: themeItems(state.settings),
      },
      { sep: true },
      { label: "Log out", icon: "logout", danger: true, action: actions.logout },
    );
  }
  openMenu({ x, y, items });
}

export function copyPageLink(page) {
  const url = window.location.origin + window.location.pathname + "#page/" + page.id;
  copyToClipboard(url).then(() => showToast("Link copied to clipboard"));
}

export function openHelp() {
  const shortcuts = [
    ["Open search", "Ctrl / Cmd + K"],
    ["New page", "Ctrl / Cmd + N"],
    ["Bold", "Ctrl / Cmd + B"],
    ["Italic", "Ctrl / Cmd + I"],
    ["Command palette", "Ctrl / Cmd + Shift + P"],
    ["Close menus / dialogs", "Esc"],
    ["Block commands", "Type / inside a block"],
  ];
  openModal({
    title: "Keyboard shortcuts",
    content: (
      <div className="help-grid">
        {shortcuts.map((s) => (
          <React.Fragment key={s[0]}>
            <span className="help-label">{s[0]}</span>
            <kbd>{s[1]}</kbd>
          </React.Fragment>
        ))}
      </div>
    ),
    footer: (close) => (
      <button className="btn btn-secondary" onClick={close}>
        Close
      </button>
    ),
  });
}

export function sharePage(page) {
  const url = window.location.origin + window.location.pathname + "#page/" + page.id;
  const state = store.getState();
  const members = state.members || [];
  openModal({
    title: "Share",
    size: "modal-sm",
    content: (
      <>
        <p>
          Anyone with this link still has to be a member of{" "}
          <strong>{state.workspace.name || "this workspace"}</strong> to open the page.
        </p>
        <div className="share-link-row">
          <input id="share-url" readOnly value={url} />
          <button
            className="btn btn-secondary"
            id="share-copy"
            onClick={() => {
              copyToClipboard(url).then(() => showToast("Link copied to clipboard"));
            }}
          >
            <Icon name="copy" /> Copy
          </button>
        </div>
        {members.length ? (
          <>
            <h3 className="settings-section-title" style={{ marginTop: 16 }}>
              Members ({members.length})
            </h3>
            <div className="share-members">
              {members.map((m) => (
                <div className="share-member" key={m.id}>
                  <span className="avatar">{initials(m.name)}</span>
                  <span className="share-member-body">
                    <span className="share-member-name">{m.name}</span>
                    <span className="share-member-email">{m.email}</span>
                  </span>
                  <span className="share-member-role">{m.role}</span>
                </div>
              ))}
            </div>
          </>
        ) : null}
      </>
    ),
    footer: (close) => (
      <button className="btn btn-primary" onClick={close}>
        Done
      </button>
    ),
  });
}

/* Re-export to avoid a second copy of the initials helper in JSX files. */
export { initials } from "./ui/index.jsx";
