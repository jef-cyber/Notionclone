import React, { useEffect, useRef, useState } from "react";

import { useStore } from "../../hooks.js";
import { store } from "../../core/store.js";
import {
  confirmDialog,
  Dialog,
  Icon,
  initials,
  openMenu,
  showToast,
} from "../ui/index.jsx";
import { themeItems } from "../menus.jsx";
import { useApp } from "../../appContext.js";
import {
  focusFirstInvalid,
  validateEmail,
  validateWorkspaceName,
  PAGE_TITLE_MAX,
} from "../../core/validation.js";

const ROLE_LABELS = { owner: "Owner", admin: "Admin", member: "Member", viewer: "Viewer" };

function roleLabel(role) {
  return role ? "You are the " + role : "";
}

export default function Sidebar({ mobileOpen, setMobileOpen, openProfileMenu, onLogout }) {
  const state = useStore();
  const app = useApp();
  const treeRef = useRef(null);
  const dragIdRef = useRef(null);
  const [dragId, setDragId] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const [renaming, setRenaming] = useState(null);
  const [prompt, setPrompt] = useState(null);
  const [workspaceName, setWorkspaceName] = useState(null);
  const [membersOpen, setMembersOpen] = useState(false);
  const [invite, setInvite] = useState({ email: "", role: "member", busy: false, error: "" });
  const workspaceFormRef = useRef(null);
  const inviteFormRef = useRef(null);

  const collapsed = !state.settings.sidebarOpen;
  const className =
    "sidebar" + (collapsed ? " is-collapsed" : "") + (mobileOpen ? " is-open" : "");

  /* ---------- prompt dialog (replacement for the old promptText) ---------- */
  const promptText = (opts) =>
    new Promise((resolve) => {
      setPrompt(Object.assign({}, opts, { resolve }));
    });

  const finishPrompt = (value) => {
    if (!prompt) return;
    const resolve = prompt.resolve;
    setPrompt(null);
    resolve(value);
  };

  /* ---------- navigation ---------- */
  const navItems = [
    { id: "home", view: "dashboard", icon: "home", label: "Home" },
    { id: "search", view: "search", icon: "search", label: "Search" },
    { id: "inbox", view: "inbox", icon: "inbox", label: "Activity" },
    { id: "trash", view: "trash", icon: "trash", label: "Trash" },
    { id: "settings", view: "settings", icon: "settings", label: "Settings" },
  ];
  const activeNav =
    state.view === "dashboard"
      ? "home"
      : state.view === "inbox"
        ? "inbox"
        : state.view === "trash"
          ? "trash"
          : state.view === "settings"
            ? "settings"
            : state.view === "search"
              ? "search"
              : null;

  const createTopLevelPage = async () => {
    try {
      const page = await store.createPage({});
      showToast("Page created", "success");
      app.openPage(page.id);
    } catch (err) {
      showToast(err.message || "Could not create the page", "error");
    }
  };

  const createSubpage = async (parentId) => {
    try {
      const page = await store.createPage({ parentId });
      showToast("Page created", "success");
      app.openPage(page.id);
    } catch (err) {
      showToast(err.message || "Could not create the page", "error");
    }
  };

  /* ---------- page context menu ---------- */
  const buildMoveItems = (id) => {
    const page = store.getPage(id);
    if (!page) return [];
    const blocked = new Set([id].concat(store.getDescendantIds(id)));
    const items = [
      {
        label: "Top level",
        icon: "folder",
        checked: !page.parentId,
        action: () => {
          store.movePage(id, null, null);
          showToast("Page moved", "success");
        },
      },
    ];
    state.pages
      .filter((p) => !blocked.has(p.id) && !p.isArchived)
      .forEach((p) => {
        items.push({
          label: p.title || "Untitled",
          icon: "folder",
          checked: p.id === page.parentId,
          action: () => {
            store.movePage(id, p.id, null);
            showToast('Moved to "' + (p.title || "Untitled") + '"', "success");
          },
        });
      });
    return items;
  };

  const startRename = (page) => {
    setRenaming({ id: page.id, value: page.title || "" });
  };

  const openPageMenu = (page, x, y) => {
    const id = page.id;
    const items = [
      { label: "Open", icon: "external", action: () => app.openPage(id) },
      {
        label: page.favorite ? "Remove from Favorites" : "Add to Favorites",
        icon: "star",
        action: () => {
          const on = store.toggleFavorite(id);
          showToast(on ? "Added to favorites" : "Removed from favorites");
        },
      },
      { label: "Rename", icon: "pencil", action: () => startRename(page) },
      {
        label: "Duplicate",
        icon: "copy",
        action: async () => {
          try {
            const copy = await store.duplicatePage(id);
            showToast("Page duplicated", "success");
            app.openPage(copy.id);
          } catch (err) {
            showToast(err.message, "error");
          }
        },
      },
      { label: "Move to", icon: "folder-plus", caret: true, items: buildMoveItems(id) },
      { sep: true },
      {
        label: "Move to trash",
        icon: "trash",
        danger: true,
        action: () => {
          const confirmFirst = store.getState().settings.confirmDelete;
          const doDelete = () => {
            store.moveToTrash(id);
            showToast("Page moved to trash", "info");
          };
          if (!confirmFirst) {
            doDelete();
            return;
          }
          confirmDialog({
            title: "Move to trash?",
            message: (
              <>
                This will move &quot;
                <span className="confirm-name">{page.title || "Untitled"}</span>&quot; and
                any nested pages to trash.
              </>
            ),
            confirmLabel: "Move to trash",
            danger: true,
          }).then((ok) => {
            if (ok) doDelete();
          });
        },
      },
    ];
    openMenu({ x, y, items });
  };

  /* ---------- inline rename ---------- */
  const renameDoneRef = useRef(false);
  const finishRename = (save) => {
    if (!renaming || renameDoneRef.current) return;
    renameDoneRef.current = true;
    const page = store.getPage(renaming.id);
    const value = renaming.value.trim();
    if (save && page && value && value !== page.title) {
      store.updatePage(renaming.id, { title: value });
      showToast("Page renamed", "success");
    }
    setRenaming(null);
    setTimeout(() => {
      renameDoneRef.current = false;
    }, 0);
  };

  /* ---------- drag & drop ---------- */
  const onRowDragStart = (e, page) => {
    dragIdRef.current = page.id;
    setDragId(page.id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", page.id);
    e.dataTransfer.setDragImage(e.currentTarget, 20, 20);
  };

  const onRowDragEnd = () => {
    dragIdRef.current = null;
    setDragId(null);
    setDropTarget(null);
  };

  const onTreeDragOver = (e) => {
    if (!dragIdRef.current) return;
    const wrap = e.target.closest(".page-row-wrap");
    if (!wrap) {
      setDropTarget(null);
      return;
    }
    if (wrap.dataset.id === dragIdRef.current) {
      setDropTarget(null);
      return;
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const rect = wrap.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const h = rect.height;
    let mode;
    if (y < h * 0.33) mode = "before";
    else if (y > h * 0.66) mode = "after";
    else mode = "inside";
    setDropTarget((current) =>
      current && current.id === wrap.dataset.id && current.mode === mode
        ? current
        : { id: wrap.dataset.id, mode }
    );
  };

  const onTreeDrop = (e) => {
    const draggingId = dragIdRef.current;
    if (!draggingId) return;
    e.preventDefault();
    const wrap = e.target.closest(".page-row-wrap");
    setDropTarget(null);
    if (!wrap) return;
    const targetId = wrap.dataset.id;
    if (targetId === draggingId) return;

    const mode = dropTarget && dropTarget.id === targetId ? dropTarget.mode : "inside";
    const target = store.getPage(targetId);
    let parentId = null;
    let beforeId = null;

    if (mode === "inside") {
      parentId = targetId;
    } else if (target) {
      parentId = target.parentId;
      if (mode === "after") {
        const sibs = store.getChildren(target.parentId);
        const idx = sibs.findIndex((p) => p.id === targetId);
        const next = sibs[idx + 1];
        beforeId = next ? next.id : null;
      } else {
        beforeId = targetId;
      }
    }

    store.movePage(draggingId, parentId, beforeId);
    showToast("Page moved", "success");
  };

  /* ---------- workspace menu ---------- */
  const createWorkspaceFlow = async () => {
    const name = await promptText({
      title: "New workspace",
      label: "Workspace name",
      placeholder: "My Workspace",
      confirmLabel: "Create",
    });
    if (!name) return;
    try {
      const ws = await store.createWorkspace(name);
      app.navigate("dashboard");
      showToast("Created \u201C" + ws.name + "\u201D", "success");
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  const renameWorkspace = () => {
    setWorkspaceName({ value: state.workspace.name || "", error: "" });
  };

  const saveWorkspaceName = () => {
    if (!workspaceName) return;
    const name = workspaceName.value.trim();
    const validationError = validateWorkspaceName(name);
    if (validationError) {
      setWorkspaceName((current) =>
        current ? Object.assign({}, current, { error: validationError }) : current
      );
      focusFirstInvalid(workspaceFormRef.current);
      return;
    }
    if (name !== state.workspace.name) store.renameWorkspace(name);
    setWorkspaceName(null);
  };

  const openMembers = async () => {
    setMembersOpen(true);
    setInvite({ email: "", role: "member", busy: false, error: "" });
    try {
      await store.reloadMembers();
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  const deleteWorkspaceFlow = () => {
    confirmDialog({
      title: "Delete workspace?",
      message: (
        <>
          This permanently deletes{" "}
          <span className="confirm-name">{state.workspace.name || "this workspace"}</span>,
          including every page, block, and database inside it. This cannot be undone.
        </>
      ),
      confirmLabel: "Delete workspace",
      danger: true,
    }).then(async (ok) => {
      if (!ok) return;
      try {
        await store.deleteWorkspace();
        if (store.getState().currentWorkspaceId) app.navigate("dashboard");
        showToast("Workspace deleted", "info");
        if (!store.getState().currentWorkspaceId) onLogout();
      } catch (err) {
        showToast(err.message, "error");
      }
    });
  };

  const openWorkspaceMenu = (anchor) => {
    const r = anchor.getBoundingClientRect();
    const switcher = state.workspaces
      .filter((w) => w._id !== state.currentWorkspaceId)
      .map((w) => ({
        label: w.name || "Untitled workspace",
        icon: w._id ? "layers" : "layers",
        action: () => {
          store
            .switchWorkspace(w._id)
            .then(() => {
              app.navigate("dashboard");
              showToast("Switched to " + (w.name || "workspace"), "success");
            })
            .catch((err) => showToast(err.message, "error"));
        },
      }));

    const items = [];
    if (switcher.length) {
      items.push(
        { label: "Your workspaces", icon: "layers", caret: true, items: switcher },
        { sep: true }
      );
    }
    items.push(
      { label: "New workspace", icon: "plus", action: createWorkspaceFlow },
      { label: "Rename workspace", icon: "pencil", action: renameWorkspace },
      { label: "Members", icon: "user", action: openMembers },
      { label: "Settings", icon: "settings", action: () => app.navigate("settings") },
      {
        label: "Theme",
        icon: state.settings.theme === "dark" ? "moon" : "sun",
        caret: true,
        items: themeItems(state.settings),
      },
      { sep: true },
      { label: "Log out", icon: "logout", danger: true, action: onLogout }
    );

    if (state.workspace.role === "owner" && (state.workspaces || []).length > 1) {
      items.push({
        label: "Delete workspace",
        icon: "trash",
        danger: true,
        action: deleteWorkspaceFlow,
      });
    }

    openMenu({
      x: r.left,
      y: r.bottom + 4,
      header: { name: state.workspace.name, sub: roleLabel(state.workspace.role) },
      items,
    });
  };

  /* ---------- members dialog ---------- */
  const canManage = state.workspace.role === "owner" || state.workspace.role === "admin";

  const inviteMember = async () => {
    if (invite.busy) return;
    const email = invite.email.trim();
    const validationError = validateEmail(email, {
      required: "Enter an email address.",
    });
    if (validationError) {
      setInvite((v) => Object.assign({}, v, { error: validationError }));
      focusFirstInvalid(inviteFormRef.current);
      return;
    }
    setInvite((v) => Object.assign({}, v, { busy: true, error: "" }));
    try {
      await store.addMember(email, invite.role);
      showToast("Invited " + email, "success");
      setInvite({ email: "", role: "member", busy: false, error: "" });
    } catch (err) {
      showToast(err.message, "error");
      setInvite((v) => Object.assign({}, v, { busy: false, error: err.message || "" }));
      focusFirstInvalid(inviteFormRef.current);
    }
  };

  const changeRole = async (member, role) => {
    try {
      await store.updateMemberRole(member.id, role);
      showToast("Role updated", "success");
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  const removeMember = (member) => {
    confirmDialog({
      title: "Remove member?",
      message: (
        <>
          Remove <span className="confirm-name">{member.name || "this person"}</span> from this
          workspace?
        </>
      ),
      confirmLabel: "Remove",
      danger: true,
    }).then(async (ok) => {
      if (!ok) return;
      try {
        await store.removeMember(member.id);
        showToast("Member removed", "info");
      } catch (err) {
        showToast(err.message, "error");
      }
    });
  };

  /* ---------- recursive page tree ---------- */
  const renderTree = (parentId, depth) => {
    const children = store.getChildren(parentId);
    if (!children.length) {
      if (parentId === null) {
        return <div className="sidebar-empty">No pages yet. Add one below.</div>;
      }
      return null;
    }

    return children.map((page) => {
      const hasChildren = store.getChildren(page.id).length > 0;
      const isOpen = store.isExpanded(page.id);
      const isActive = state.view === "page" && state.currentPageId === page.id;
      const isRenaming = renaming && renaming.id === page.id;

      return (
        <div
          className="page-row-wrap"
          data-id={page.id}
          key={page.id}
          role="treeitem"
          aria-level={depth + 1}
          aria-selected={isActive}
          aria-expanded={hasChildren ? isOpen : undefined}
          aria-label={page.title || "Untitled"}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.target.closest("button") || e.target.closest("input")) return;
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              app.openPage(page.id);
            } else if (e.key === "ArrowRight" && hasChildren && !isOpen) {
              e.preventDefault();
              store.setExpanded(page.id, true);
            } else if (e.key === "ArrowLeft" && hasChildren && isOpen) {
              e.preventDefault();
              store.setExpanded(page.id, false);
            } else if (e.key === "F2") {
              e.preventDefault();
              startRename(page);
            }
          }}
        >
          <div
            className={"page-row" + (dragId === page.id ? " dragging" : "")}
            data-page-row
            data-id={page.id}
            data-active={isActive ? "true" : "false"}
            data-drop-target={
              dropTarget && dropTarget.id === page.id ? dropTarget.mode : undefined
            }
            style={{ paddingLeft: depth * 14 + 4 + "px" }}
            draggable
            onDragStart={(e) => onRowDragStart(e, page)}
            onDragEnd={onRowDragEnd}
            onClick={(e) => {
              if (e.target.closest("button") || e.target.closest("input")) return;
              app.openPage(page.id);
            }}
            onDoubleClick={(e) => {
              if (e.target.closest("button") || e.target.closest("input")) return;
              startRename(page);
            }}
          >
            {hasChildren ? (
              <button
                className={"page-caret" + (isOpen ? " is-open" : "")}
                data-caret
                aria-label={isOpen ? "Collapse" : "Expand"}
                onClick={(e) => {
                  e.stopPropagation();
                  store.setExpanded(page.id, !store.isExpanded(page.id));
                }}
              >
                <Icon name="chevron-right" />
              </button>
            ) : (
              <span className="page-chevron-spacer" />
            )}
            <span className="page-icon">{page.icon || "\uD83D\uDCDD"}</span>
            {isRenaming ? (
              <input
                className="page-title-input"
                aria-label="Page name"
                value={renaming.value}
                autoFocus
                onFocus={(e) => e.currentTarget.select()}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) =>
                  setRenaming((current) =>
                    current ? Object.assign({}, current, { value: e.target.value }) : current
                  )
                }
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter") finishRename(true);
                  if (e.key === "Escape") finishRename(false);
                }}
                onBlur={() => finishRename(true)}
              />
            ) : (
              <span className="page-title" data-title>
                {page.title || "Untitled"}
              </span>
            )}
            <div className="page-actions">
              <button
                className="page-action page-star"
                data-star
                data-active={page.favorite ? "true" : "false"}
                aria-label="Toggle favorite"
                onClick={(e) => {
                  e.stopPropagation();
                  const on = store.toggleFavorite(page.id);
                  showToast(on ? "Added to favorites" : "Removed from favorites", "success");
                }}
              >
                <Icon name={page.favorite ? "starFilled" : "star"} />
              </button>
              <button
                className="page-action"
                data-add
                aria-label="Add subpage"
                onClick={(e) => {
                  e.stopPropagation();
                  createSubpage(page.id);
                }}
              >
                <Icon name="plus" />
              </button>
              <button
                className="page-action"
                data-more
                aria-label="More actions"
                onClick={(e) => {
                  e.stopPropagation();
                  const r = e.currentTarget.getBoundingClientRect();
                  openPageMenu(page, r.left, r.bottom + 4);
                }}
              >
                <Icon name="more" />
              </button>
            </div>
          </div>
          {hasChildren ? (
            <div
              className={"page-children" + (isOpen ? "" : " is-collapsed")}
              role="group"
            >
              {renderTree(page.id, depth + 1)}
            </div>
          ) : null}
        </div>
      );
    });
  };

  const favorites = store.getFavorites();

  return (
    <>
      <aside id="sidebar" className={className} aria-label="Sidebar navigation">
        <div className="sidebar-inner">
          <button
            id="sidebar-workspace"
            className="sidebar-workspace"
            aria-haspopup="menu"
            onClick={(e) => openWorkspaceMenu(e.currentTarget)}
          >
            <span className="sidebar-ws-icon">{state.workspace.icon || "\u25C8"}</span>
            <span className="sidebar-ws-name">{state.workspace.name || "Workspace"}</span>
            <span className="sidebar-ws-caret">
              <Icon name="chevron-down" />
            </span>
          </button>

          <div className="sidebar-scroll">
            <div id="sidebar-nav" className="sidebar-nav">
              {navItems.map((item) => (
                <button
                  className="sidebar-nav-item"
                  data-nav={item.id}
                  data-active={activeNav === item.id ? "true" : undefined}
                  aria-label={item.label}
                  key={item.id}
                  onClick={() => app.navigate(item.view)}
                >
                  <Icon name={item.icon} />
                  <span className="sidebar-nav-item-label">{item.label}</span>
                </button>
              ))}
            </div>

            <div className="sidebar-section-label">Favorites</div>
            <div id="sidebar-favorites">
              {favorites.map((p) => (
                <div className="sidebar-fav-item" key={p.id}>
                  <button
                    className="sidebar-fav-open"
                    data-id={p.id}
                    onClick={() => app.openPage(p.id)}
                  >
                    <span className="page-icon">{p.icon || "\uD83D\uDCDD"}</span>
                    <span className="page-title">{p.title || "Untitled"}</span>
                  </button>
                  <button
                    className="sidebar-fav-star"
                    type="button"
                    aria-label={"Remove " + (p.title || "Untitled") + " from favorites"}
                    onClick={() => {
                      store.toggleFavorite(p.id);
                      showToast("Removed from favorites");
                    }}
                  >
                    <Icon name="starFilled" />
                  </button>
                </div>
              ))}
            </div>

            <div className="sidebar-tree-title">
              <span className="sidebar-tree-title-label">Pages</span>
              <button
                className="sidebar-tree-add"
                data-add-top
                aria-label="Add page"
                onClick={createTopLevelPage}
              >
                <Icon name="plus" />
              </button>
            </div>
            <div
              id="sidebar-tree"
              className="sidebar-tree"
              ref={treeRef}
              role="tree"
              aria-label="Pages"
              onDragOver={onTreeDragOver}
              onDrop={onTreeDrop}
              onDragLeave={(e) => {
                if (treeRef.current && !treeRef.current.contains(e.relatedTarget)) {
                  setDropTarget(null);
                }
              }}
            >
              {renderTree(null, 0)}
            </div>
          </div>

          <div className="sidebar-footer">
            <button
              id="sidebar-add-page"
              className="sidebar-add-page"
              onClick={createTopLevelPage}
            >
              <Icon name="plus" />
              <span>New page</span>
            </button>
            <button
              className="sidebar-profile"
              data-profile
              aria-haspopup="menu"
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                openProfileMenu(r.left, r.top - 4);
              }}
            >
              <span className="avatar" data-profile-avatar>
                {initials(state.user.name || "")}
              </span>
              <span className="sidebar-profile-info">
                <span className="sidebar-profile-name" data-profile-name>
                  {state.user.name || ""}
                </span>
                <span className="sidebar-profile-sub">My Profile</span>
              </span>
              <span className="sidebar-profile-caret">
                <Icon name="chevron-down" />
              </span>
            </button>
          </div>
        </div>
      </aside>

      <PromptDialog prompt={prompt} onFinish={finishPrompt} />

      <Dialog
        open={!!workspaceName}
        title="Rename workspace"
        size="modal-sm"
        onClose={() => setWorkspaceName(null)}
        footer={
          <>
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => setWorkspaceName(null)}
            >
              Cancel
            </button>
            <button
              className="btn btn-primary"
              id="ws-save"
              type="submit"
              form="workspace-name-form"
            >
              Save
            </button>
          </>
        }
      >
        <form
          id="workspace-name-form"
          className="field"
          ref={workspaceFormRef}
          style={{ margin: 0 }}
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            saveWorkspaceName();
          }}
        >
          <label htmlFor="ws-name">Workspace name</label>
          <input
            id="ws-name"
            name="workspaceName"
            type="text"
            maxLength={PAGE_TITLE_MAX}
            value={workspaceName ? workspaceName.value : ""}
            autoFocus
            aria-invalid={!!(workspaceName && workspaceName.error)}
            aria-describedby={
              workspaceName && workspaceName.error ? "ws-name-error" : undefined
            }
            onChange={(e) =>
              setWorkspaceName((current) =>
                current
                  ? Object.assign({}, current, { value: e.target.value, error: "" })
                  : current
              )
            }
          />
          {workspaceName && workspaceName.error ? (
            <p className="field-error" id="ws-name-error" role="alert">
              {workspaceName.error}
            </p>
          ) : null}
        </form>
      </Dialog>

      <Dialog
        open={membersOpen}
        title="Members"
        onClose={() => setMembersOpen(false)}
        footer={
          <button className="btn btn-secondary" onClick={() => setMembersOpen(false)}>
            Done
          </button>
        }
      >
        <div className="members-list">
          {(state.members || []).map((m) => {
            const isOwner = m.role === "owner";
            return (
              <div className="member-row" key={m.id}>
                <span className="avatar">{initials(m.name)}</span>
                <span className="member-body">
                  <span className="member-name">{m.name || "Unknown"}</span>
                  <span className="member-email">{m.email || ""}</span>
                </span>
                {canManage && !isOwner ? (
                  <>
                    <select
                      className="select member-role"
                      data-member={m.id}
                      value={m.role}
                      onChange={(e) => changeRole(m, e.target.value)}
                    >
                      {["admin", "member", "viewer"].map((r) => (
                        <option value={r} key={r}>
                          {ROLE_LABELS[r]}
                        </option>
                      ))}
                    </select>
                    <button
                      className="member-remove"
                      data-remove={m.id}
                      aria-label="Remove member"
                      onClick={() => removeMember(m)}
                    >
                      <Icon name="close" />
                    </button>
                  </>
                ) : (
                  <span className="member-role-static">
                    {ROLE_LABELS[m.role] || m.role}
                  </span>
                )}
              </div>
            );
          })}
        </div>
        {canManage ? (
          <>
            <form
              className="member-invite"
              ref={inviteFormRef}
              noValidate
              aria-busy={invite.busy}
              onSubmit={(e) => {
                e.preventDefault();
                inviteMember();
              }}
            >
              <input
                id="invite-email"
                type="email"
                name="email"
                placeholder="teammate@example.com"
                aria-label="Teammate email"
                required
                aria-invalid={!!invite.error}
                aria-describedby={invite.error ? "invite-error" : undefined}
                value={invite.email}
                onChange={(e) =>
                  setInvite((v) =>
                    Object.assign({}, v, { email: e.target.value, error: "" })
                  )
                }
              />
              <select
                id="invite-role"
                className="select"
                aria-label="Role"
                value={invite.role}
                onChange={(e) =>
                  setInvite((v) => Object.assign({}, v, { role: e.target.value }))
                }
              >
                <option value="member">Member</option>
                <option value="admin">Admin</option>
                <option value="viewer">Viewer</option>
              </select>
              <button
                className="btn btn-primary"
                id="invite-btn"
                type="submit"
                disabled={invite.busy}
              >
                {invite.busy ? "Inviting\u2026" : "Invite"}
              </button>
            </form>
            {invite.error ? (
              <p className="field-error invite-error" id="invite-error" role="alert">
                {invite.error}
              </p>
            ) : null}
          </>
        ) : null}
      </Dialog>
    </>
  );
}

function PromptDialog({ prompt, onFinish }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const formRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!prompt) return undefined;
    setValue(prompt.value || "");
    setError("");
    const t = requestAnimationFrame(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.select();
      }
    });
    return () => cancelAnimationFrame(t);
  }, [prompt]);

  if (!prompt) return null;

  const submit = () => {
    const next = value.trim();
    const validationError = validateWorkspaceName(next);
    if (validationError) {
      setError(validationError);
      focusFirstInvalid(formRef.current);
      return;
    }
    onFinish(next);
  };

  return (
    <Dialog
      open
      title={prompt.title}
      size="modal-sm"
      onClose={() => onFinish(null)}
      footer={
        <>
          <button className="btn btn-secondary" type="button" onClick={() => onFinish(null)}>
            Cancel
          </button>
          <button
            className={"btn " + (prompt.danger ? "btn-danger" : "btn-primary")}
            type="submit"
            form="prompt-form"
          >
            {prompt.confirmLabel || "Save"}
          </button>
        </>
      }
    >
      <form
        id="prompt-form"
        className="field"
        ref={formRef}
        style={{ margin: 0 }}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label htmlFor="prompt-input">{prompt.label}</label>
        <input
          id="prompt-input"
          ref={inputRef}
          type="text"
          maxLength={PAGE_TITLE_MAX}
          value={value}
          placeholder={prompt.placeholder || ""}
          aria-invalid={!!error}
          aria-describedby={error ? "prompt-input-error" : undefined}
          onChange={(e) => {
            setValue(e.target.value);
            if (error) setError("");
          }}
        />
        {error ? (
          <p className="field-error" id="prompt-input-error" role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </Dialog>
  );
}
