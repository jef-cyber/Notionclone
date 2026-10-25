import React from "react";

import { Icon } from "../ui/index.jsx";

export default function MobileNav({ state, navigate, createNewPage }) {
  const items = [
    { id: "home", view: "dashboard", icon: "home", label: "Home" },
    { id: "search", view: null, icon: "search", label: "Search" },
    { id: "new", view: null, icon: "plus", label: "New" },
    { id: "inbox", view: "inbox", icon: "inbox", label: "Activity" },
    { id: "settings", view: "settings", icon: "settings", label: "Settings" },
  ];

  return (
    <nav id="mobile-nav" className="mobile-nav" aria-label="Mobile navigation">
      {items.map((item) => (
        <button
          className="mobile-nav-btn"
          data-mnav={item.id}
          data-active={item.view && state.view === item.view ? "true" : "false"}
          key={item.id}
          onClick={() => {
            if (item.id === "search") navigate("search");
            else if (item.id === "new") createNewPage();
            else navigate(item.view);
          }}
        >
          <Icon name={item.icon} />
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}
