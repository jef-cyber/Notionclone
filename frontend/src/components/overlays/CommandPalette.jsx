import React, { useEffect, useRef, useState } from "react";

import { useStore } from "../../hooks.js";
import { store } from "../../core/store.js";
import theme from "../../core/theme.js";
import { Dialog, Icon } from "../ui/index.jsx";

function buildItems(state, actions) {
  const items = [
    { id: "new-page", icon: "plus", label: "New page", action: actions.createNewPage },
    {
      id: "theme",
      icon: state.settings.theme === "dark" ? "sun" : "moon",
      label: "Toggle theme",
      action: () => theme.toggleTheme(),
    },
    { id: "go-home", icon: "home", label: "Go to Home", action: () => actions.navigate("dashboard") },
    { id: "go-search", icon: "search", label: "Open Search", action: () => actions.navigate("search") },
    { id: "go-inbox", icon: "inbox", label: "Open Activity", action: () => actions.navigate("inbox") },
    { id: "go-templates", icon: "layout", label: "Browse Templates", action: () => actions.navigate("templates") },
    { id: "go-trash", icon: "trash", label: "Go to Trash", action: () => actions.navigate("trash") },
    { id: "go-settings", icon: "settings", label: "Open Settings", action: () => actions.navigate("settings") },
    { id: "import", icon: "upload", label: "Import a .md file", action: actions.triggerImport },
    { sep: true },
  ];

  state.recent
    .map((id) => store.getPage(id))
    .filter(Boolean)
    .forEach((p) => {
      items.push({
        id: p.id,
        icon: "file-text",
        label: p.title || "Untitled",
        shortcut: "\u2190 recent",
        action: () => actions.openPage(p.id),
      });
    });

  return items;
}

function visibleItems(items, query) {
  const q = (query || "").toLowerCase();
  return items.filter((it) => it.sep || !q || it.label.toLowerCase().includes(q));
}

export default function CommandPalette({
  open,
  onClose,
  navigate,
  createNewPage,
  openPage,
  triggerImport,
}) {
  const state = useStore();
  const [query, setQuery] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    setQuery("");
    setSel(0);
    const frame = requestAnimationFrame(() => {
      if (inputRef.current) inputRef.current.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);

  const items = buildItems(state, {
    navigate,
    createNewPage,
    openPage,
    triggerImport,
  });
  const visible = visibleItems(items, query);
  const selected = visible.length ? Math.min(sel, visible.length - 1) : 0;

  const run = (item) => {
    if (!item || !item.action) return;
    onClose();
    item.action();
  };

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((prev) => Math.min(visible.length - 1, prev + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((prev) => Math.max(0, prev - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      run(visible[selected]);
    }
  };

  return (
    <Dialog
      open={open}
      title="Commands"
      size="modal-sm"
      onClose={onClose}
      ariaLabel="Commands"
    >
      <div className="search-box">
        <Icon name="command" />
        <input
          id="cmd-input"
          ref={inputRef}
          type="text"
          placeholder={"Type a command or page\u2026"}
          autoComplete="off"
          value={query}
          onChange={(e) => {
            const value = e.target.value;
            setQuery(value);
            const count = visibleItems(items, value).length;
            setSel((prev) => Math.max(0, Math.min(prev, count - 1)));
          }}
          onKeyDown={onKeyDown}
        />
      </div>
      <div className="search-results" id="cmd-results">
        {visible.map((it, i) =>
          it.sep ? (
            <div className="menu-sep" key={"sep" + i}></div>
          ) : (
            <button
              className="cmd-item"
              key={it.id + "-" + i}
              data-i={i}
              data-selected={String(i === selected)}
              onMouseMove={() => setSel(i)}
              onClick={() => run(it)}
            >
              <Icon name={it.icon} />
              <span>{it.label}</span>
              <span className="cmd-shortcut">{it.shortcut || ""}</span>
            </button>
          )
        )}
      </div>
    </Dialog>
  );
}
