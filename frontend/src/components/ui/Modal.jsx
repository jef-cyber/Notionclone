/* ---------- modals ---------- */

import React, { createContext, useContext, useEffect } from "react";
import { createPortal } from "react-dom";

import { createStore } from "../../core/externalStore.js";
import { Icon } from "./Icon.jsx";
import { useExternal } from "./useExternal.js";

const modalStore = createStore(null);

export function closeModal() {
  const current = modalStore.get();
  if (!current) return;
  modalStore.set(null);
  if (current.onClose) {
    try {
      current.onClose();
    } catch (e) {
      /* ignore */
    }
  }
}

export function openModal(opts) {
  closeModal();
  const entry = Object.assign({}, opts, { id: Date.now() + Math.random() });
  modalStore.set(entry);
  return entry;
}

export function useModalState() {
  return useExternal(modalStore);
}

export function ModalLayer() {
  const modal = useExternal(modalStore);
  if (!modal) return <div className="modal-root" data-open="false" />;

  const content = modal.content || null;
  const footer = modal.footer || null;

  return createPortal(
    <div className="modal-root" data-open="true">
      <div className="modal-overlay" onClick={closeModal} />
      <div
        className={"modal " + (modal.size || "")}
        role="dialog"
        aria-modal="true"
        aria-label={modal.title || "Dialog"}
      >
        <div className="modal-header">
          <h2 className="modal-title">{modal.title || ""}</h2>
          <button className="icon-btn" onClick={closeModal} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>
        <div className="modal-body">{content}</div>
        {footer ? <div className="modal-footer">{footer(closeModal)}</div> : null}
      </div>
    </div>,
    document.body
  );
}

/** Promise-based confirm dialog. */
export function confirmDialog(opts) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    openModal({
      title: opts.title || "Are you sure?",
      size: "modal-sm",
      content: <div className="confirm-desc">{opts.message}</div>,
      footer: () => (
        <>
          <button
            className="btn btn-secondary"
            onClick={() => {
              finish(false);
              closeModal();
            }}
          >
            Cancel
          </button>
          <button
            className={"btn " + (opts.danger ? "btn-danger" : "btn-primary")}
            onClick={() => {
              // Settle first: closeModal runs the dialog's onClose, which
              // resolves the promise as false. Doing this in the other order
              // made every confirm button a no-op.
              finish(true);
              closeModal();
            }}
          >
            {opts.confirmLabel || "Confirm"}
          </button>
        </>
      ),
      onClose: () => finish(false),
    });
  });
}

/**
 * A local, React-owned dialog that uses the same DOM contract as ModalLayer.
 * Complex flows (members, database settings, prompts) keep their state in a
 * component instead of imperatively rebuilding modal bodies.
 */
export function Dialog({ open, title, size, onClose, children, footer, ariaLabel }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        if (onClose) onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="modal-root" data-open="true">
      <div className="modal-overlay" onClick={onClose} />
      <div
        className={"modal " + (size || "")}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel || title || "Dialog"}
      >
        <div className="modal-header">
          <h2 className="modal-title">{title || ""}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-footer">{footer}</div> : null}
      </div>
    </div>,
    document.body
  );
}

/* Small Modal context so components can close/replace dialogs predictably. */
const ModalContext = createContext({ close: closeModal, open: openModal });
export const ModalProvider = ModalContext.Provider;
export const useModal = () => useContext(ModalContext);
