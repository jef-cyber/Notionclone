import React from "react";

import ViewHeader from "../common/ViewHeader.jsx";
import { Icon } from "../ui/index.jsx";
import { useApp } from "../../appContext.js";

/**
 * Shown when the hash does not name a view this app knows about, instead of
 * silently pretending the user asked for the dashboard.
 */
export default function NotFound() {
  const app = useApp();

  return (
    <div className="view view-narrow">
      <ViewHeader
        title="Page not found"
        subtitle="That link does not match a page or view in this workspace."
      />
      <div className="empty-state">
        <div className="empty-icon">
          <Icon name="search" />
        </div>
        <h2 className="empty-title">Nothing lives here</h2>
        <p className="empty-desc">
          The address may be mistyped, or the page may have been moved to the trash.
        </p>
        <div className="notfound-actions">
          <button className="btn btn-primary" onClick={() => app.navigate("dashboard")}>
            Go to Home
          </button>
          <button className="btn btn-secondary" onClick={() => app.navigate("search")}>
            <Icon name="search" /> Search pages
          </button>
        </div>
      </div>
    </div>
  );
}
