/* ---------- toasts ---------- */

import React from "react";

import { toastStore } from "../../core/toast.js";
import { Icon } from "./Icon.jsx";
import { useExternal } from "./useExternal.js";

export { showToast } from "../../core/toast.js";

export function ToastRoot() {
  const toasts = useExternal(toastStore);
  if (!toasts.length) return <div className="toast-root" aria-live="polite" aria-atomic="false" />;
  const iconFor = (type) =>
    type === "error" ? "alert-triangle" : type === "info" ? "info" : "check-circle";
  return (
    <div className="toast-root" aria-live="polite" aria-atomic="false">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={"toast" + (t.leaving ? " is-leaving" : "")}
          data-type={t.type}
        >
          <Icon name={iconFor(t.type)} />
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}
