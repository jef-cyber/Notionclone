import React from "react";

import { useStore } from "../../hooks.js";
import { store } from "../../core/store.js";
import { PageCard } from "../common/PageCard.jsx";
import ViewHeader from "../common/ViewHeader.jsx";

export default function Favorites() {
  useStore();
  const favorites = store.getFavorites();

  return (
    <div className="view">
      <ViewHeader
        title="Favorites"
        subtitle="Pages you’ve starred for quick access."
      />
      <div className="card-grid" id="fav-grid">
        {favorites.length ? (
          favorites.map((page) => <PageCard page={page} showStar key={page.id} />)
        ) : (
          <div className="empty-state">
            <div className="empty-icon">{"\u2726"}</div>
            <h2 className="empty-title">No favorites yet</h2>
            <p className="empty-desc">Click the star on any page to pin it here.</p>
          </div>
        )}
      </div>
    </div>
  );
}
