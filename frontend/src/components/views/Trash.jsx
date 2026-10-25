import React from "react";

import { useStore } from "../../hooks.js";
import { store } from "../../core/store.js";
import { confirmDialog, Icon, showToast } from "../ui/index.jsx";

function trashedWhen(page) {
  const archived = page.archivedAt ? new Date(page.archivedAt) : null;
  if (!archived || isNaN(archived.getTime())) return "";
  return (
    archived.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
    " at " +
    archived.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
  );
}

export default function Trash() {
  useStore();
  const items = store.getTrashPages();
  const count = items.reduce(
    (n, page) => n + 1 + store.getDescendantIds(page.id).length,
    0
  );

  const restore = (id) => {
    store.restorePage(id);
    showToast("Page restored", "success");
  };

  const deleteForever = async (page) => {
    const ok = await confirmDialog({
      title: "Delete forever?",
      message: (
        <>
          This permanently deletes &quot;
          <span className="confirm-name">{page.title || "Untitled"}</span>&quot; and any
          nested pages. This cannot be undone.
        </>
      ),
      confirmLabel: "Delete forever",
      danger: true,
    });
    if (!ok) return;
    store.deletePagePermanently(page.id);
    showToast("Page permanently deleted", "info");
  };

  const emptyTrash = async () => {
    const ok = await confirmDialog({
      title: "Empty trash?",
      message: "All pages in the trash will be permanently deleted. This cannot be undone.",
      confirmLabel: "Empty trash",
      danger: true,
    });
    if (!ok) return;
    store.emptyTrash();
    showToast("Trash emptied", "info");
  };

  return (
    <div className="view view-narrow">
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>Trash</h1>
          <p className="dash-date">
            {items.length
              ? count + " page" + (count === 1 ? "" : "s") +
                " in trash. Restore to keep, or delete forever."
              : "Deleted pages appear here."}
          </p>
        </div>
        {items.length ? (
          <button className="btn btn-danger btn-sm" data-empty-trash onClick={emptyTrash}>
            <Icon name="trash" /> Empty trash
          </button>
        ) : null}
      </div>

      {!items.length ? (
        <div className="empty-state">
          <div className="empty-icon">
            <Icon name="trash" />
          </div>
          <h2 className="empty-title">Trash is empty</h2>
          <p className="empty-desc">Pages you move to trash will show up here.</p>
        </div>
      ) : (
        <div className="trash-list">
          {items.map((page) => {
            const parentPath = page.parentId
              ? store
                  .getPath(page.parentId)
                  .map((x) => x.title || "Untitled")
                  .join(" / ")
              : "";
            return (
              <div className="trash-item" key={page.id}>
                <span className="trash-item-icon">{page.icon || "\uD83D\uDCDD"}</span>
                <span className="trash-item-body">
                  <span className="trash-item-title">{page.title || "Untitled"}</span>
                  <span className="trash-item-sub">
                    Trashed {trashedWhen(page)}
                    {parentPath ? " · " + parentPath : ""}
                  </span>
                </span>
                <span className="trash-item-actions">
                  <button
                    className="btn btn-secondary btn-sm"
                    data-restore={page.id}
                    onClick={() => restore(page.id)}
                  >
                    <Icon name="rotate-cw" /> Restore
                  </button>
                  <button
                    className="btn btn-danger btn-sm"
                    data-delete-forever={page.id}
                    onClick={() => deleteForever(page)}
                  >
                    <Icon name="trash" /> Delete
                  </button>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
