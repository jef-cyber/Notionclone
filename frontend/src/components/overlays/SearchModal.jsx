import React, { useEffect, useRef, useState } from "react";

import { usePageSearch, useStore } from "../../hooks.js";
import { store } from "../../core/store.js";
import { Dialog, Icon } from "../ui/index.jsx";
import SearchResult from "../common/SearchResult.jsx";

export default function SearchModal({ open, onClose, openPage }) {
  const state = useStore();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef(null);
  const resultsRef = useRef(null);
  const { results, loading: searching, error } = usePageSearch(query, {
    delay: 180,
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelected(0);
    const frame = requestAnimationFrame(() => {
      if (inputRef.current) inputRef.current.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    setSelected(0);
  }, [query]);

  const q = query.trim();
  const recents = state.recent.map((id) => store.getPage(id)).filter(Boolean);
  const empty = !q;
  const items = empty ? recents : results;

  useEffect(() => {
    if (!open || !resultsRef.current) return;
    const el = resultsRef.current.querySelector('[data-index="' + selected + '"]');
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [open, selected, results]);

  const go = (page) => {
    if (!page) return;
    onClose();
    openPage(page.id);
  };

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((prev) => Math.min(items.length - 1, prev + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((prev) => Math.max(0, prev - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = items[selected];
      if (item) go(item.page ? item.page : item);
    }
  };

  return (
    <Dialog
      open={open}
      title="Search"
      size="modal-lg"
      onClose={onClose}
      ariaLabel="Search"
    >
      <div className="search-box">
        <Icon name="search" />
        <input
          id="search-input"
          ref={inputRef}
          type="text"
          placeholder="Search anything…"
          aria-label="Search"
          autoComplete="off"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
        />
      </div>
      <div id="search-results" className="search-results" ref={resultsRef}>
        {empty ? (
          recents.length ? (
            <>
              <div className="search-group-label">Recent</div>
              {recents.map((page, i) => (
                <SearchResult
                  result={{ page, snippet: "" }}
                  index={i}
                  query=""
                  selected={selected === i}
                  option
                  key={page.id}
                  onHover={() => setSelected(i)}
                  onOpen={() => go(page)}
                />
              ))}
              <div
                className="search-empty"
                style={{
                  padding: "16px 10px",
                  textAlign: "left",
                  color: "var(--text-muted)",
                  fontSize: 12.5,
                }}
              >
                Search all pages by typing above
              </div>
            </>
          ) : (
            <>
              <div className="search-group-label">Search</div>
              <div className="search-empty">Type to search your pages…</div>
            </>
          )
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
                  selected={selected === i}
                  option
                  key={item.page.id}
                  onHover={() => setSelected(i)}
                  onOpen={() => go(item.page)}
                />
              ))
            )}
          </>
        )}
      </div>
    </Dialog>
  );
}
