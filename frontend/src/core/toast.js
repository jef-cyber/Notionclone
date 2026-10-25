/* Toast queue shared by non-React modules and the toast renderer. */
import { createStore } from "./externalStore.js";

let toastSeq = 0;
export const toastStore = createStore([]);

export function showToast(message, type) {
  const kind = type || "success";
  const id = ++toastSeq;
  toastStore.set(toastStore.get().concat({ id, message, type: kind, leaving: false }));
  setTimeout(() => {
    toastStore.set(
      toastStore.get().map((t) => (t.id === id ? Object.assign({}, t, { leaving: true }) : t))
    );
    setTimeout(() => {
      toastStore.set(toastStore.get().filter((t) => t.id !== id));
    }, 200);
  }, 2800);
}
