/* ---------- menus ---------- */

import React, { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { createStore } from "../../core/externalStore.js";
import { Icon } from "./Icon.jsx";
import { useExternal } from "./useExternal.js";

const menuStore = createStore(null);

function fitRect(el, x, y) {
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

function MenuPanel({ opts, x, y, align, onClose, isSub }) {
  const ref = useRef(null);
  const [sub, setSub] = useState(null);

  useLayoutEffect(() => {
    if (!ref.current) return;
    const left = align === "end" && !isSub ? x - ref.current.offsetWidth : x;
    fitRect(ref.current, left, y);
  });

  const handleItem = (item) => {
    if (item.items) return; // submenu opens on hover; click toggles
    if (item.action) item.action();
    onClose();
  };

  const toggleSubmenu = (e, item) => {
    e.stopPropagation();
    if (sub && sub.key === item.label) setSub(null);
    else {
      const rect = e.currentTarget.getBoundingClientRect();
      setSub({ key: item.label, items: item.items, x: rect.right + 2, y: rect.top - 4 });
    }
  };

  const openSubmenu = (e, item) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setSub({ key: item.label, items: item.items, x: rect.right + 2, y: rect.top - 4 });
  };

  return (
    <>
      <div
        ref={ref}
        className={"menu" + (isSub ? " submenu" : "")}
        role="menu"
        style={{ left: x, top: y }}
      >
        {opts.header ? (
          <div className="menu-header">
            <div className="menu-header-name">{opts.header.name || ""}</div>
            {opts.header.sub ? <div className="menu-header-sub">{opts.header.sub}</div> : null}
          </div>
        ) : null}
        {(opts.items || []).map((item, i) => {
          if (item.sep) return <div className="menu-sep" key={"sep" + i} />;
          return (
            <button
              key={item.label + i}
              className="menu-item"
              role="menuitem"
              data-danger={item.danger ? "true" : undefined}
              onClick={(e) => (item.items ? toggleSubmenu(e, item) : handleItem(item))}
              onMouseEnter={(e) => {
                if (item.items) openSubmenu(e, item);
              }}
            >
              {item.icon ? <Icon name={item.icon} /> : null}
              <span className="menu-item-label">{item.label}</span>
              {item.checked ? (
                <span className="menu-caret">
                  <Icon name="check" />
                </span>
              ) : item.caret || item.items ? (
                <span className="menu-caret">
                  <Icon name="chevron-right" />
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      {sub ? (
        <MenuPanel
          key={sub.key}
          opts={{ items: sub.items }}
          x={sub.x}
          y={sub.y}
          onClose={onClose}
          isSub
        />
      ) : null}
    </>
  );
}

export function openMenu(opts) {
  menuStore.set({ opts, id: Date.now() + Math.random() });
}

export function closeMenus() {
  if (menuStore.get()) menuStore.set(null);
}

export function MenuLayer() {
  const menu = useExternal(menuStore);
  if (!menu) return <div className="menu-root" data-open="false" />;
  const { opts } = menu;
  return createPortal(
    <div className="menu-root" data-open="true">
      <div
        className="menu-backdrop"
        onPointerDown={(e) => {
          if (e.target === e.currentTarget) closeMenus();
        }}
      />
      <MenuPanel
        opts={opts}
        x={opts.x}
        y={opts.y}
        align={opts.align}
        onClose={closeMenus}
      />
    </div>,
    document.body
  );
}

/** Open a menu anchored to a button element. */
export function openMenuAt(anchor, opts) {
  const r = anchor.getBoundingClientRect();
  openMenu(Object.assign({}, opts, { x: r.left, y: r.bottom + 4 }));
}
