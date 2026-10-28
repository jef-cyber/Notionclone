import React from "react";

/**
 * Shared page heading used by the non-editor views.
 *
 * Keeping the title, subtitle and optional action in one component means the
 * spacing and mobile wrapping stay identical from page to page.
 */
export default function ViewHeader({ title, subtitle, action }) {
  return (
    <header className="view-header">
      <div className="view-header-text">
        <h1 className="view-title">{title}</h1>
        {subtitle ? <p className="dash-date">{subtitle}</p> : null}
      </div>
      {action ? <div className="view-header-action">{action}</div> : null}
    </header>
  );
}
