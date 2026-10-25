/* React bindings for the in-place store and a few viewport helpers. */

import { useEffect, useState, useSyncExternalStore } from "react";
import { store } from "./core/store.js";

/**
 * The store mutates state in place, so the snapshot is a monotonically
 * increasing version counter; reading getState() in the component body gives
 * the actual data.
 */
export function useStore() {
  useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  return store.getState();
}

export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() =>
    typeof window === "undefined" ? false : window.matchMedia(query).matches
  );

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    if (mql.addEventListener) mql.addEventListener("change", onChange);
    else mql.addListener(onChange);
    return () => {
      if (mql.removeEventListener) mql.removeEventListener("change", onChange);
      else mql.removeListener(onChange);
    };
  }, [query]);

  return matches;
}

export function useIsMobile() {
  return useMediaQuery("(max-width: 720px)");
}
