import React from "react";

import { store } from "../../core/store.js";

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Highlight every case-insensitive match of `query` inside `text`. */
export function Highlight({ text, query }) {
  if (!query) return text;
  const parts = String(text).split(new RegExp("(" + escapeRegExp(query) + ")", "ig"));
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase() ? <mark key={i}>{part}</mark> : part
  );
}

/**
 * One row in the search results list. The same markup is used by the search
 * page and the command-palette style modal; `option` adds the ARIA roles the
 * modal's listbox needs.
 */
export default function SearchResult({
  result,
  index,
  query,
  onOpen,
  selected,
  onHover,
  option = false,
}) {
  const page = result.page;
  const title = page.title || "Untitled";
  const snippet = result.snippet && result.snippet !== page.title ? result.snippet : "";
  const path = store
    .getPath(page.id)
    .map((p) => p.title || "Untitled")
    .join(" / ");

  return (
    <button
      type="button"
      className="search-result"
      data-id={page.id}
      data-index={index}
      data-selected={option ? String(!!selected) : undefined}
      role={option ? "option" : undefined}
      aria-selected={option ? !!selected : undefined}
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
