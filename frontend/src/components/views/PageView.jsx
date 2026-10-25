import React, { useEffect } from "react";

import { useStore } from "../../hooks.js";
import { store } from "../../core/store.js";
import { useApp } from "../../appContext.js";
import Editor from "../editor/Editor.jsx";

export default function PageView({ pageId }) {
  const state = useStore();
  const app = useApp();
  const page = store.getPage(pageId);

  useEffect(() => {
    if (page && !page.blocksLoaded) store.hydratePage(pageId);
  }, [pageId, page, page && page.blocksLoaded]);

  if (!page) {
    return (
      <div className="view">
        <div className="empty-state">
          <div className="empty-icon">{"\uD83D\uDCE6"}</div>
          <h2 className="empty-title">Page not found</h2>
          <p className="empty-desc">This page may have been deleted or moved.</p>
          <button
            className="btn btn-primary"
            onClick={() => app.navigate("dashboard")}
          >
            Go to Home
          </button>
        </div>
      </div>
    );
  }

  if (!page.blocksLoaded) {
    return (
      <div className="view">
        <div className="empty-state">
          <div className="empty-icon">{"\uD83D\uDCC4"}</div>
          <h2 className="empty-title">Loading…</h2>
          <p className="empty-desc">Fetching this page from the server.</p>
        </div>
      </div>
    );
  }

  // The editor is keyed by page so switching pages remounts the uncontrolled
  // contenteditable fields with the new page's content.
  void state;
  return <Editor key={page.id} page={page} focusTitle={!page.blocks.length} />;
}
