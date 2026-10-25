import { useSyncExternalStore } from "react";

export function useExternal(store) {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
