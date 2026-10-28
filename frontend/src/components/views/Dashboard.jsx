import React, { useRef, useState } from "react";

import { useStore } from "../../hooks.js";
import { store } from "../../core/store.js";
import {
  focusFirstInvalid,
  validatePageTitle,
  PAGE_TITLE_MAX,
} from "../../core/validation.js";
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
  const [newPageError, setNewPageError] = useState("");
  const [creating, setCreating] = useState(false);
  const newPageFormRef = useRef(null);

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
    const title = newPageTitle.trim();
    const validationError = validatePageTitle(title);
    if (validationError) {
      setNewPageError(validationError);
      focusFirstInvalid(newPageFormRef.current);
      return;
    }
    setNewPageError("");
    setCreating(true);
    try {
      const page = await store.createPage({ title, icon: "\uD83D\uDCDD" });
      showToast("Page created", "success");
      setNewPageOpen(false);
      setNewPageTitle("");
      app.openPage(page.id);
    } catch (err) {
      setNewPageError(err.message || "Could not create the page. Please try again.");
      focusFirstInvalid(newPageFormRef.current);
    } finally {
      setCreating(false);
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
            setNewPageError("");
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
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => setNewPageOpen(false)}
            >
              Cancel
            </button>
            <button
              className="btn btn-primary"
              id="nwp-ok"
              type="submit"
              form="new-page-form"
              disabled={creating}
            >
              {creating ? "Creating…" : "Create"}
            </button>
          </>
        }
      >
        <form
          id="new-page-form"
          className="dialog-form"
          ref={newPageFormRef}
          noValidate
          aria-busy={creating}
          onSubmit={(e) => {
            e.preventDefault();
            createWorkspacePage();
          }}
        >
          <label className="dialog-label" htmlFor="nwp-title">
            Page name
          </label>
          <input
            id="nwp-title"
            className="dialog-input"
            type="text"
            name="title"
            placeholder="Page name"
            value={newPageTitle}
            autoFocus
            required
            maxLength={PAGE_TITLE_MAX}
            aria-invalid={!!newPageError}
            aria-describedby={newPageError ? "nwp-title-error" : undefined}
            onChange={(e) => {
              setNewPageTitle(e.target.value);
              if (newPageError) setNewPageError("");
            }}
          />
          {newPageError ? (
            <p className="field-error" id="nwp-title-error" role="alert">
              {newPageError}
            </p>
          ) : (
            <p className="form-hint">You can rename it later from the sidebar.</p>
          )}
        </form>
      </Dialog>
    </div>
  );
}
