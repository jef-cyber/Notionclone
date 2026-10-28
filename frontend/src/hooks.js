/* React bindings for the in-place store and a few viewport helpers. */

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
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

/**
 * Debounced page search shared by the search page and the search modal.
 *
 * The hook owns the parts that are easy to get wrong in each caller: the
 * debounce timer, ignoring stale responses, clearing results when the query is
 * erased, and surfacing an error instead of showing "no results" when the API
 * is unavailable.
 */
export function usePageSearch(query, options = {}) {
  const delay = options.delay || 200;
  const enabled = options.enabled !== false;
  const [result, setResult] = useState({
    q: "",
    items: [],
    loading: false,
    error: null,
  });
  const tokenRef = useRef(0);
  const q = String(query || "").trim();

  useEffect(() => {
    if (!enabled) return undefined;

    if (!q) {
      tokenRef.current += 1;
      setResult({ q: "", items: [], loading: false, error: null });
      return undefined;
    }

    const mine = ++tokenRef.current;
    let cancelled = false;
    setResult((prev) => ({
      q,
      items: prev.q === q ? prev.items : [],
      loading: true,
      error: null,
    }));

    const timer = setTimeout(async () => {
      try {
        const items = await store.searchPages(q);
        if (cancelled || mine !== tokenRef.current) return;
        setResult({ q, items, loading: false, error: null });
      } catch (err) {
        if (cancelled || mine !== tokenRef.current) return;
        setResult({
          q,
          items: [],
          loading: false,
          error: err.message || "Search is unavailable. Please try again.",
        });
      }
    }, delay);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q, delay, enabled]);

  const settled = result.q === q;
  return {
    query: q,
    results: q && settled ? result.items : [],
    loading: !!q && (result.loading || !settled),
    error: q && settled ? result.error : null,
  };
}
