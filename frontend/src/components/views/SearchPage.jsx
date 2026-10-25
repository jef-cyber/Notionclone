import React, { useEffect, useRef, useState } from "react";

import { useStore } from "../../hooks.js";
import { store } from "../../core/store.js";
import { Icon } from "../ui/index.jsx";
import { useApp } from "../../appContext.js";

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function Highlight({ text, query }) {
  if (!query) return text;
  const parts = String(text).split(new RegExp("(" + escapeRegExp(query) + ")", "ig"));
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase() ? <mark key={i}>{part}</mark> : part
  );
}

function ResultItem({ result, index, query, onOpen }) {
  const page = result.page;
  const title = page.title || "Untitled";
  const snippet = result.snippet && result.snippet !== page.title ? result.snippet : "";
  const path = store
    .getPath(page.id)
    .map((p) => p.title || "Untitled")
    .join(" / ");

  return (
    <button
      className="search-result"
      data-id={page.id}
      data-index={index}
      onClick={() => onOpen(page)}
    >
      <span className="search-result-icon">{page.icon || "\uD83D\uDCDD"}</span>
      <span className="search-result-body">
        <span className="search-result-title">
          <Highlight text={title} query={query} />
        </span>
        {snippet ? (
          <span className="search-result-snippet">
            <Highlight text={snippet} query={query} />
          </span>
        ) : null}
      </span>
      <span className="search-result-path">{path}</span>
    </button>
  );
}

export default function SearchPage() {
  const state = useStore();
  const app = useApp();
  const [query, setQuery] = useState("");
  const [result, setResult] = useState({ q: "", items: [], loading: false });
  const inputRef = useRef(null);
  const tokenRef = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      tokenRef.current += 1;
      setResult({ q: "", items: [], loading: false });
      return undefined;
    }

    const mine = ++tokenRef.current;
    let cancelled = false;
    setResult((prev) => ({ q, items: prev.q === q ? prev.items : [], loading: true }));

    const timer = setTimeout(async () => {
      let items = [];
      try {
        items = await store.searchPages(q);
      } catch (err) {
        items = [];
      }
      if (cancelled || mine !== tokenRef.current) return;
      setResult({ q, items, loading: false });
    }, 200);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const q = query.trim();
  const searching = !!q && (result.loading || result.q !== q);
  const results = q && result.q === q ? result.items : [];
  const ql = q.toLowerCase();

  const open = (page) => {
    if (!page) return;
    if (q) store.addRecentSearch(q);
    app.openPage(page.id);
  };

  const recents = state.recent
    .map((id) => store.getPage(id))
    .filter(Boolean)
    .slice(0, 5);
  const recentSearches = store.getRecentSearches();

  return (
    <div className="view view-narrow">
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>Search</h1>
      <p className="dash-date">Find pages, notes, and anything inside them.</p>
      <div className="search-box search-box-page">
        <Icon name="search" />
        <input
          id="search-page-input"
          ref={inputRef}
          type="text"
          placeholder="Search anything…"
          autoComplete="off"
          aria-label="Search"
          value={query}
          autoFocus
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && results.length) open(results[0].page);
          }}
        />
      </div>
      <div id="search-page-results" className="search-results search-results-page">
        {!q ? (
          <>
            {recentSearches.length ? (
              <>
                <div className="search-group-label">Recent searches</div>
                {recentSearches.map((item) => (
                  <button
                    className="recent-search-chip"
                    data-q={item}
                    key={item}
                    onClick={() => {
                      setQuery(item);
                      if (inputRef.current) inputRef.current.focus();
                    }}
                  >
                    <Icon name="clock" />
                    <span>{item}</span>
                  </button>
                ))}
                <button
                  className="recent-search-clear"
                  data-clear-searches
                  onClick={() => store.clearRecentSearches()}
                >
                  Clear
                </button>
              </>
            ) : null}
            {recents.length ? (
              <>
                <div className="search-group-label">Recent pages</div>
                {recents.map((page, i) => (
                  <ResultItem
                    result={{ page, snippet: "" }}
                    index={i}
                    query=""
                    key={page.id}
                    onOpen={open}
                  />
                ))}
              </>
            ) : null}
            <div
              className="search-empty"
              style={{ padding: "24px 10px", textAlign: "left" }}
            >
              Type to search your pages…
            </div>
          </>
        ) : (
          <>
            <div className="search-group-label">Search results</div>
            {searching ? (
              <div className="search-empty">
                <Icon name="search" />
                <br />
                <br />
                Searching…
              </div>
            ) : !results.length ? (
              <div className="search-empty">
                <Icon name="search" />
                <br />
                <br />
                No pages match “{q}”
              </div>
            ) : (
              results.map((item, i) => (
                <ResultItem
                  result={item}
                  index={i}
                  query={ql}
                  key={item.page.id}
                  onOpen={open}
                />
              ))
            )}
          </>
        )}
      </div>
    </div>
  );
}
