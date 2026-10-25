import React from "react";

import { store } from "../../core/store.js";
import { Icon, showToast } from "../ui/index.jsx";
import { relativeTime } from "../ui/index.jsx";
import { useApp } from "../../appContext.js";

export function PageCard({ page, showStar }) {
  const app = useApp();
  const when = relativeTime(page.updatedAt);

  return (
    <button
      className="card"
      onClick={(e) => {
        if (e.target.closest(".card-star")) {
          store.toggleFavorite(page.id);
          showToast("Removed from favorites");
          return;
        }
        app.openPage(page.id);
      }}
    >
      <span className="card-icon">{page.icon || "\uD83D\uDCDD"}</span>
      <span className="card-body">
        <span className="card-title">{page.title || "Untitled"}</span>
        <span className="card-sub">
          {when ? "Updated " + when : "Not yet saved"}
        </span>
      </span>
      {showStar ? (
        <span className="card-star" data-active="true" aria-label="Remove from favorites">
          <Icon name="starFilled" />
        </span>
      ) : null}
    </button>
  );
}

export function EmptyCard({ title, desc }) {
  return (
    <div className="empty-state" style={{ padding: "28px 16px" }}>
      <div className="empty-icon">{"\uD83D\uDCDD"}</div>
      <h3 className="empty-title" style={{ fontSize: 15 }}>
        {title}
      </h3>
      <p className="empty-desc" style={{ fontSize: 13 }}>
        {desc}
      </p>
    </div>
  );
}
