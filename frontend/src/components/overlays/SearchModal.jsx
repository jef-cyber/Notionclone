import React, { useEffect, useRef, useState } from "react";

import { useStore } from "../../hooks.js";
import { store } from "../../core/store.js";
import { Dialog, Icon } from "../ui/index.jsx";

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

function ResultItem({ result, index, query, selected, onHover, onOpen }) {
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
      data-selected={String(selected)}
      role="option"
      aria-selected={selected}
      onMouseMove={onHover}
      onClick={onOpen}
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

export default function SearchModal({ open, onClose, openPage }) {
  const state = useStore();
  const [query, setQuery] = useState("");
  const [result, setResult] = useState({ q: "", items: [], loading: false });
  const [selected, setSelected] = useState(0);
  const inputRef = useRef(null);
  const resultsRef = useRef(null);
  const tokenRef = useRef(0);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setResult({ q: "", items: [], loading: false });
    setSelected(0);
    const frame = requestAnimationFrame(() => {
      if (inputRef.current) inputRef.current.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
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
      setSelected(0);
      setResult({ q, items, loading: false });
    }, 180);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, query]);

  const q = query.trim();
  const searching = !!q && (result.loading || result.q !== q);
  const results = q && result.q === q ? result.items : [];
  const recents = state.recent.map((id) => store.getPage(id)).filter(Boolean);
  const empty = !q;
  const items = empty ? recents : results;

  useEffect(() => {
    if (!open || !resultsRef.current) return;
    const el = resultsRef.current.querySelector('[data-index="' + selected + '"]');
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [open, selected, result]);

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
                <ResultItem
                  result={{ page, snippet: "" }}
                  index={i}
                  query=""
                  selected={selected === i}
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
                  query={q.toLowerCase()}
                  selected={selected === i}
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
