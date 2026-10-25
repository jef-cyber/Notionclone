import React from "react";

import { useStore } from "../../hooks.js";
import { store } from "../../core/store.js";
import { PageCard } from "../common/PageCard.jsx";

export default function Favorites() {
  useStore();
  const favorites = store.getFavorites();

  return (
    <div className="view">
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>Favorites</h1>
      <p className="dash-date">Pages you’ve starred for quick access.</p>
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
