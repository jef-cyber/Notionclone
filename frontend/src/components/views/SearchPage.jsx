import React, { useRef } from "react";

import { usePageSearch, useStore } from "../../hooks.js";
import { store } from "../../core/store.js";
import { Icon } from "../ui/index.jsx";
import { useApp } from "../../appContext.js";
import ViewHeader from "../common/ViewHeader.jsx";
import SearchResult from "../common/SearchResult.jsx";

export default function SearchPage() {
  const state = useStore();
  const app = useApp();
  const [query, setQuery] = React.useState("");
  const inputRef = useRef(null);
  const { query: q, results, loading: searching, error } = usePageSearch(query, {
    delay: 200,
  });

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
      <ViewHeader
        title="Search"
        subtitle="Find pages, notes, and anything inside them."
      />
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
                    type="button"
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
                  type="button"
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
                  <SearchResult
                    result={{ page, snippet: "" }}
                    index={i}
                    query=""
                    key={page.id}
                    onOpen={() => open(page)}
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
            ) : error ? (
              <div className="search-empty search-empty-error" role="alert">
                <Icon name="alert-triangle" />
                <br />
                <br />
                {error}
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
                <SearchResult
                  result={item}
                  index={i}
                  query={q.toLowerCase()}
                  key={item.page.id}
                  onOpen={() => open(item.page)}
                />
              ))
            )}
          </>
        )}
      </div>
    </div>
  );
}
