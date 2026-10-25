import React, { useState } from "react";

import { useStore } from "../../hooks.js";
import { store } from "../../core/store.js";
import { Dialog, Icon, showToast } from "../ui/index.jsx";
import { useApp } from "../../appContext.js";
import { EmptyCard, PageCard } from "../common/PageCard.jsx";

function formatDate(d) {
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export default function Dashboard() {
  const state = useStore();
  const app = useApp();
  const [newPageOpen, setNewPageOpen] = useState(false);
  const [newPageTitle, setNewPageTitle] = useState("");
  const [creating, setCreating] = useState(false);

  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const firstName = (state.user.name || "").split(" ")[0] || "there";

  const recents = state.recent
    .map((id) => store.getPage(id))
    .filter(Boolean)
    .slice(0, 6);
  const favorites = store.getFavorites();

  const createWorkspacePage = async () => {
    if (creating) return;
    setCreating(true);
    setNewPageOpen(false);
    try {
      const page = await store.createPage({ title: newPageTitle.trim(), icon: "\uD83D\uDCDD" });
      showToast("Page created", "success");
      app.openPage(page.id);
    } catch (err) {
      showToast(err.message || "Could not create the page", "error");
    } finally {
      setCreating(false);
      setNewPageTitle("");
    }
  };

  return (
    <div className="view">
      <h1 className="dash-greeting">
        {greeting}, {firstName} {"\uD83D\uDC4B"}
      </h1>
      <p className="dash-date">{formatDate(new Date())}</p>

      <h2 className="dash-section-title">Quick actions</h2>
      <div className="quick-actions">
        <button className="quick-action" data-qa="new" onClick={app.createNewPage}>
          <span className="icon icon-accent">
            <Icon name="plus" />
          </span>
          New Page
        </button>
        <button
          className="quick-action"
          data-qa="search"
          onClick={() => app.navigate("search")}
        >
          <span className="icon icon-violet">
            <Icon name="search" />
          </span>
          Search
        </button>
        <button
          className="quick-action"
          data-qa="new-workspace-page"
          onClick={() => {
            setNewPageTitle("");
            setNewPageOpen(true);
          }}
        >
          <span className="icon icon-green">
            <Icon name="folder-plus" />
          </span>
          New Workspace Page
        </button>
      </div>

      <h2 className="dash-section-title">Recently visited</h2>
      <div className="card-grid" id="dash-recent">
        {recents.length ? (
          recents.map((p) => <PageCard page={p} showStar={false} key={p.id} />)
        ) : (
          <EmptyCard
            title="Nothing recently visited"
            desc="Pages you open will show up here."
          />
        )}
      </div>

      <h2 className="dash-section-title">Favorites</h2>
      <div className="card-grid" id="dash-favs">
        {favorites.length ? (
          favorites.map((p) => <PageCard page={p} showStar key={p.id} />)
        ) : (
          <EmptyCard title="No favorites yet" desc="Star a page to pin it here." />
        )}
      </div>

      <Dialog
        open={newPageOpen}
        title="New top-level page"
        size="modal-sm"
        onClose={() => setNewPageOpen(false)}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setNewPageOpen(false)}>
              Cancel
            </button>
            <button className="btn btn-primary" id="nwp-ok" disabled={creating} onClick={createWorkspacePage}>
              Create
            </button>
          </>
        }
      >
        <p style={{ marginBottom: 10 }}>Name your new top-level page.</p>
        <input
          id="nwp-title"
          type="text"
          placeholder="Page name"
          value={newPageTitle}
          autoFocus
          style={{
            width: "100%",
            padding: "8px 12px",
            border: "1px solid var(--border-strong)",
            borderRadius: 6,
            background: "var(--bg-secondary)",
          }}
          onChange={(e) => setNewPageTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") createWorkspacePage();
          }}
        />
      </Dialog>
    </div>
  );
}
