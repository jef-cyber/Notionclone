import React from "react";

import { useStore } from "../../hooks.js";
import { store } from "../../core/store.js";
import { Icon, relativeTime } from "../ui/index.jsx";
import { useApp } from "../../appContext.js";
import ViewHeader from "../common/ViewHeader.jsx";

export default function Activity() {
  const state = useStore();
  const app = useApp();
  const activity = store.getActivity();
  const pages = state.pages.filter((p) => !p.isArchived).length;

  if (!activity.length) {
    return (
      <div className="view view-narrow">
        <ViewHeader title="Activity" subtitle="Nothing here yet." />
        <div className="empty-state">
          <div className="empty-icon">
            <Icon name="inbox" />
          </div>
          <h2 className="empty-title">No activity yet</h2>
          <p className="empty-desc">Create or edit a page and it shows up here.</p>
        </div>
      </div>
    );
  }

  const groups = {};
  activity.forEach((item) => {
    (groups[item.group] = groups[item.group] || []).push(item);
  });

  return (
    <div className="view view-narrow">
      <ViewHeader
        title="Activity"
        subtitle={
          "The " +
          pages +
          " page" +
          (pages === 1 ? "" : "s") +
          " in this workspace, most recently changed first."
        }
      />
      {Object.keys(groups).map((group) => (
        <React.Fragment key={group}>
          <h3 className="inbox-group-title">{group}</h3>
          {groups[group].map((item) => (
            <button
              className="inbox-item"
              key={item.pageId}
              onClick={() => app.openPage(item.pageId)}
            >
              <span className="inbox-icon">{item.icon}</span>
              <span className="inbox-body">
                <span className="inbox-text">{item.title || "Untitled"}</span>
                <div className="inbox-time">{relativeTime(item.time)}</div>
              </span>
            </button>
          ))}
        </React.Fragment>
      ))}
    </div>
  );
}
