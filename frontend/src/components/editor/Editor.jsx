/* ============================================================
   Lumen — page editor.

   The title and every block body are uncontrolled contenteditable
   elements: React owns their structure, but never writes text into them
   after mount, so the caret and undo stack survive the re-renders that
   the optimistic store emits.
   ============================================================ */

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { useStore } from "../../hooks.js";
import { store } from "../../core/store.js";
import { COMMON_ICONS, slashItems } from "../../core/blockTypes.js";
import { Dialog, Icon, openMenu, relativeTime, showToast } from "../ui/index.jsx";
import Database from "../database/Database.jsx";

const CODE_LANGUAGES = [
  "JavaScript",
  "TypeScript",
  "Python",
  "HTML",
  "CSS",
  "JSON",
  "Bash",
  "SQL",
  "Plain text",
];

function isImageSource(value) {
  const v = String(value || "").trim();
  if (!v) return false;
  if (v.startsWith("data:image/")) return true;
  if (v.startsWith("/") || v.startsWith("./") || v.startsWith("../")) return true;
  try {
    const url = new URL(v);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch (err) {
    return false;
  }
}

function openLanguageMenu(event, block, pageId) {
  const r = event.currentTarget.getBoundingClientRect();
  openMenu({
    x: r.left,
    y: r.bottom + 4,
    items: CODE_LANGUAGES.map((language) => ({
      label: language,
      checked: (block.language || "") === language,
      action: () => {
        store.updateBlock(pageId, block.id, { language });
        store.commit("blocks");
      },
    })),
  });
}

function openCalloutIconMenu(event, block, pageId) {
  const r = event.currentTarget.getBoundingClientRect();
  openMenu({
    x: r.left,
    y: r.bottom + 4,
    items: COMMON_ICONS.map((icon) => ({
      label: icon,
      checked: block.icon === icon,
      action: () => {
        store.updateBlock(pageId, block.id, { icon });
        store.commit("blocks");
      },
    })),
  });
}

/* ---------- caret helpers ---------- */
function placeCaretAtEnd(el) {
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

function getCaretOffset(el) {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return el.innerText.length;
  const range = sel.getRangeAt(0);
  if (!el.contains(range.commonAncestorContainer)) return el.innerText.length;
  const pre = range.cloneRange();
  pre.selectNodeContents(el);
  pre.setEnd(range.endContainer, range.endOffset);
  return pre.toString().length;
}

function setBlockText(map, blockId, text) {
  const el = map.current.get(blockId);
  if (!el) return;
  el.innerText = text;
  if (el.dataset.placeholder !== undefined) {
    el.dataset.placeholder = String(!text);
  }
}

/* ---------- uncontrolled editable ---------- */
function Editable({
  blockId,
  value,
  className,
  placeholder,
  register,
  onInput,
  onKeyDown,
}) {
  const nodeRef = useRef(null);

  // Initialise the text once. Subsequent store writes are mirrored by the
  // input handlers, never by React's reconciliation.
  useLayoutEffect(() => {
    const el = nodeRef.current;
    if (!el) return;
    const text = value || "";
    if (el.innerText !== text) el.innerText = text;
    if (placeholder) el.dataset.placeholder = String(!text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={(el) => {
        nodeRef.current = el;
        register(blockId, el);
      }}
      className={className}
      contentEditable="true"
      suppressContentEditableWarning
      role="textbox"
      aria-multiline="true"
      spellCheck="true"
      onInput={(e) => {
        const text = e.currentTarget.innerText.replace(/\u200B/g, "");
        if (placeholder) {
          e.currentTarget.dataset.placeholder = String(!text);
        }
        if (onInput) onInput(text, e.currentTarget);
      }}
      onKeyDown={(e) => {
        if (onKeyDown) onKeyDown(e, e.currentTarget);
      }}
    />
  );
}

/* ---------- image ---------- */
function ImageContent({ block, register, onInput, onKeyDown, onImageRequest }) {
  const [failed, setFailed] = useState(false);
  const source = block.content || block.url || "";
  return (
    <div className="block-image">
      {source ? (
        failed ? (
          <div className="block-image-error">Image could not be loaded</div>
        ) : (
          <img
            src={source}
            alt={block.caption || "Embedded image"}
            loading="lazy"
            onError={() => setFailed(true)}
          />
        )
      ) : (
        <button
          className="block-image-placeholder"
          onClick={() => onImageRequest(block.id)}
        >
          Add an image
        </button>
      )}
      <Editable
        blockId={block.id}
        value={block.caption || ""}
        className="block-image-caption"
        placeholder
        register={register}
        onInput={onInput}
        onKeyDown={onKeyDown}
      />
    </div>
  );
}

/* ---------- toggle ---------- */
function ToggleContent({ block, register, onInput, onKeyDown }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="block-toggle" data-open={String(open)}>
      <button
        className="toggle-caret"
        aria-label={open ? "Collapse" : "Expand"}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="chevron-right" />
      </button>
      <Editable
        blockId={block.id}
        value={block.content || ""}
        className="block-content"
        register={register}
        onInput={onInput}
        onKeyDown={onKeyDown}
      />
    </div>
  );
}

/* ---------- per-type content ---------- */
function BlockContent({
  block,
  pageId,
  numberSeq,
  register,
  onTextInput,
  onKeyDown,
  onImageRequest,
}) {
  const shared = {
    blockId: block.id,
    register,
    onInput: (text) => onTextInput(block, text),
    onKeyDown: (e, el) => onKeyDown(e, block, el),
  };

  switch (block.type) {
    case "heading1":
    case "heading2":
    case "heading3":
      return (
        <Editable
          {...shared}
          value={block.content || ""}
          className={"block-content block-" + block.type}
        />
      );

    case "bulleted":
    case "numbered":
      return (
        <div className={"block-" + block.type}>
          <span className="list-marker">
            {block.type === "bulleted" ? "\u2022" : (numberSeq || 1) + "."}
          </span>
          <Editable
            {...shared}
            value={block.content || ""}
            className="block-content"
          />
        </div>
      );

    case "todo": {
      const done = !!block.checked;
      return (
        <div className="block-todo" data-checked={String(done)}>
          <button
            className="todo-checkbox"
            data-checked={String(done)}
            aria-label={done ? "Mark as not done" : "Mark as done"}
            onClick={() => {
              store.updateBlock(pageId, block.id, { checked: !block.checked });
              store.commit("blocks");
            }}
          >
            <Icon name="check" />
          </button>
          <Editable
            {...shared}
            value={block.content || ""}
            className="block-content"
          />
        </div>
      );
    }

    case "quote":
      return (
        <Editable
          {...shared}
          value={block.content || ""}
          className="block-content block-quote"
        />
      );

    case "code":
      return (
        <div className="block-code-wrap">
          <button
            type="button"
            className="block-code-lang"
            aria-label="Change code language"
            onClick={(e) => openLanguageMenu(e, block, pageId)}
          >
            {block.language || "code"}
          </button>
          <Editable
            {...shared}
            value={block.content || ""}
            className="block-content block-code"
          />
        </div>
      );

    case "callout":
      return (
        <div className="block-callout">
          <button
            className="callout-icon"
            type="button"
            aria-label="Change icon"
            onClick={(e) => openCalloutIconMenu(e, block, pageId)}
          >
            {block.icon || "\uD83D\uDCA1"}
          </button>
          <Editable
            {...shared}
            value={block.content || ""}
            className="block-content"
          />
        </div>
      );

    case "divider":
      return <div className="block-divider">{"\u2022 \u2022 \u2022"}</div>;

    case "image":
      return (
        <ImageContent
          block={block}
          register={register}
          onImageRequest={onImageRequest}
          onInput={(text) => {
            store.updateBlock(pageId, block.id, { caption: text });
          }}
        />
      );

    case "video": {
      const url = block.url || block.content || "";
      return (
        <div className="block-video">
          {url ? (
            <iframe
              src={url}
              allowFullScreen
              loading="lazy"
              title="Embedded video"
            />
          ) : (
            "No video URL set."
          )}
        </div>
      );
    }

    case "toggle":
      return (
        <ToggleContent
          block={block}
          register={register}
          onInput={(text) => onTextInput(block, text)}
          onKeyDown={(e, el) => onKeyDown(e, block, el)}
        />
      );

    case "database":
      return (
        <div className="block-database">
          <Database block={block} pageId={pageId} />
        </div>
      );

    default:
      return (
        <Editable
          {...shared}
          value={block.content || ""}
          className="block-content block-text"
          placeholder
        />
      );
  }
}

/* ---------- block wrapper ---------- */
function Block({
  block,
  pageId,
  numberSeq,
  register,
  onTextInput,
  onKeyDown,
  onImageRequest,
  onTypeMenu,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}) {
  const wrapRef = useRef(null);
  return (
    <div
      ref={wrapRef}
      className="block"
      data-block-id={block.id}
      data-type={block.type}
      onFocus={() => {
        if (wrapRef.current) wrapRef.current.classList.add("selected");
      }}
      onBlur={(e) => {
        if (wrapRef.current && !wrapRef.current.contains(e.relatedTarget)) {
          wrapRef.current.classList.remove("selected");
        }
      }}
      onDragOver={(e) => onDragOver(e, block)}
      onDrop={(e) => onDrop(e, block, wrapRef.current)}
    >
      <div className="block-controls">
        <button
          className="block-handle"
          draggable="true"
          aria-label="Drag to reorder"
          onDragStart={(e) => onDragStart(e, block, wrapRef.current)}
          onDragEnd={() => onDragEnd(block, wrapRef.current)}
        >
          <Icon name="grip" />
        </button>
        <button
          className="block-type-btn"
          aria-label="Change block type"
          onClick={(e) => {
            e.stopPropagation();
            const r = e.currentTarget.getBoundingClientRect();
            onTypeMenu(block, r.left, r.bottom + 4);
          }}
        >
          <Icon name="more" />
        </button>
      </div>
      <BlockContent
        block={block}
        pageId={pageId}
        numberSeq={numberSeq}
        register={register}
        onTextInput={onTextInput}
        onKeyDown={onKeyDown}
        onImageRequest={onImageRequest}
      />
    </div>
  );
}

/* ---------- phantom trailing block ---------- */
function PhantomBlock({ onConvert, onBackspaceEmpty }) {
  const elRef = useRef(null);
  const convert = () => {
    const el = elRef.current;
    const content = el ? el.innerText.replace(/\u200B/g, "") : "";
    onConvert(content);
  };
  return (
    <div className="block block-text" data-phantom="true">
      <div
        ref={elRef}
        className="block-content block-text"
        contentEditable="true"
        suppressContentEditableWarning
        data-placeholder="true"
        role="textbox"
        onFocus={() => {
          if (elRef.current && !elRef.current.innerText) convert();
        }}
        onInput={() => {
          if (elRef.current && elRef.current.innerText) convert();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            convert();
          } else if (e.key === "Backspace" && elRef.current && !elRef.current.innerText) {
            e.preventDefault();
            onBackspaceEmpty();
          }
        }}
      />
    </div>
  );
}

/* ---------- formatting toolbar buttons ---------- */
const FORMAT_BUTTONS = [
  { cmd: "bold", icon: "bold", title: "Bold (Ctrl+B)" },
  { cmd: "italic", icon: "italic", title: "Italic (Ctrl+I)" },
  { cmd: "underline", icon: "underline", title: "Underline" },
  { cmd: "strikeThrough", icon: "strike", title: "Strikethrough" },
  { cmd: "formatBlock", icon: "code", title: "Inline code", extra: "<code>" },
  { sep: true },
  { cmd: "createLink", icon: "link", title: "Link" },
  { sep: true },
  { cmd: "justifyLeft", icon: "align-left", title: "Align left" },
  { cmd: "justifyCenter", icon: "align-center", title: "Align center" },
  { cmd: "justifyRight", icon: "align-right", title: "Align right" },
];

export default function Editor({ page, focusTitle }) {
  useStore();

  const pageId = page.id;
  const blocks = page.blocks;
  const rootRef = useRef(null);
  const titleRef = useRef(null);
  const blockEls = useRef(new Map());
  const focusAfterRef = useRef(null);
  const draggingRef = useRef(null);
  const slashRef = useRef(null);
  const formatRef = useRef(null);
  const firstToolbarShow = useRef(true);
  const fileRef = useRef(null);

  const [slash, setSlash] = useState(null);
  const [format, setFormat] = useState(null);
  const [imageFor, setImageFor] = useState(null);
  const [imageUrl, setImageUrl] = useState("");
  const [imageError, setImageError] = useState("");
  const [imageBusy, setImageBusy] = useState(false);
  const imageFormRef = useRef(null);

  const register = useCallback((blockId, el) => {
    if (el) blockEls.current.set(blockId, el);
    else blockEls.current.delete(blockId);
  }, []);

  /* ---------- title / meta sync ---------- */
  useLayoutEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    if (document.activeElement !== el) {
      const next = page.title || "";
      if (el.textContent !== next) el.textContent = next;
    }
    el.dataset.placeholder = String(!page.title);
  });

  useEffect(() => {
    if (!focusTitle) return undefined;
    const frame = requestAnimationFrame(() => {
      const el = titleRef.current;
      if (!el) return;
      el.focus();
      placeCaretAtEnd(el);
    });
    return () => cancelAnimationFrame(frame);
  }, [focusTitle]);

  /* Focus the block requested by the last structural edit, after React
     has committed the new DOM. */
  useLayoutEffect(() => {
    const target = focusAfterRef.current;
    if (!target) return;
    const el = blockEls.current.get(target.id);
    if (!el) return;
    focusAfterRef.current = null;
    el.focus();
    if (target.atEnd) placeCaretAtEnd(el);
  });

  /* ---------- slash menu positioning ---------- */
  useLayoutEffect(() => {
    const el = slashRef.current;
    if (!slash || !el) return;
    const sel = window.getSelection();
    const range = sel && sel.rangeCount ? sel.getRangeAt(0) : null;
    const rect = range
      ? range.getBoundingClientRect()
      : document.activeElement && document.activeElement.getBoundingClientRect
        ? document.activeElement.getBoundingClientRect()
        : { left: 8, top: 8, bottom: 8, right: 8, width: 0, height: 0 };
    let left = rect.left;
    let top = rect.bottom + 6;
    el.style.visibility = "hidden";
    const measured = el.getBoundingClientRect();
    if (left + measured.width > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - measured.width - 8);
    }
    if (top + measured.height > window.innerHeight - 8) {
      top = Math.max(8, rect.top - measured.height - 6);
    }
    el.style.left = left + "px";
    el.style.top = top + "px";
    el.style.visibility = "visible";
  });

  /* ---------- formatting toolbar ---------- */
  const syncSelection = useCallback(() => {
    const root = rootRef.current;
    const sel = window.getSelection();
    const within =
      !!root &&
      !!sel &&
      ((sel.anchorNode && root.contains(sel.anchorNode)) ||
        (sel.focusNode && root.contains(sel.focusNode)));
    if (!root || !sel || sel.isCollapsed || !within || !sel.rangeCount) {
      setFormat(null);
      return;
    }
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    const active = {};
    FORMAT_BUTTONS.forEach((b) => {
      if (!b.cmd) return;
      let on = false;
      try {
        if (b.cmd === "createLink") {
          on = document.queryCommandValue("createLink") !== "";
        } else if (b.cmd === "formatBlock") {
          on = document.queryCommandValue("formatBlock") === "code";
        } else {
          on = document.queryCommandState(b.cmd);
        }
      } catch (err) {
        on = false;
      }
      active[b.cmd] = on;
    });
    setFormat({
      rect: {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      },
      active,
    });
  }, []);

  useEffect(() => {
    document.addEventListener("selectionchange", syncSelection);
    return () => document.removeEventListener("selectionchange", syncSelection);
  }, [syncSelection]);

  useEffect(() => {
    const hide = () => setFormat(null);
    document.addEventListener("scroll", hide, true);
    return () => document.removeEventListener("scroll", hide, true);
  }, []);

  useLayoutEffect(() => {
    if (!format) {
      firstToolbarShow.current = true;
      return undefined;
    }
    const el = formatRef.current;
    if (!el) return undefined;
    const r = format.rect;
    let left = r.left + r.width / 2 - el.offsetWidth / 2;
    let top = r.top - el.offsetHeight - 10;
    left = Math.max(8, Math.min(left, window.innerWidth - el.offsetWidth - 8));
    if (top < 8) top = r.bottom + 10;
    el.style.left = left + "px";
    el.style.top = top + "px";
    if (firstToolbarShow.current) {
      firstToolbarShow.current = false;
      el.style.opacity = "0";
      const frame = requestAnimationFrame(() => {
        el.style.opacity = "1";
        el.style.transition = "opacity 0.1s ease";
      });
      return () => cancelAnimationFrame(frame);
    }
    return undefined;
  }, [format]);

  /* ---------- global close / outside click ---------- */
  useEffect(() => {
    const onClose = () => {
      setSlash(null);
      setFormat(null);
    };
    const onPointerDown = (e) => {
      if (slashRef.current && !slashRef.current.contains(e.target)) {
        setSlash(null);
      }
    };
    window.addEventListener("lumen:close-editor-overlays", onClose);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("lumen:close-editor-overlays", onClose);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, []);

  /* ---------- title ---------- */
  const onTitleInput = () => {
    const el = titleRef.current;
    if (!el) return;
    const val = el.textContent.replace(/\n/g, " ").trim();
    el.dataset.placeholder = String(!val);
    store.updatePage(pageId, { title: val }, "rename");
  };

  /* ---------- block text + slash detection ---------- */
  const onTextInput = (block, text) => {
    store.updateBlock(pageId, block.id, { content: text });
    if (text.startsWith("/")) {
      const query = text.slice(1);
      setSlash((prev) => {
        if (prev) return Object.assign({}, prev, { blockId: block.id, query });
        return { blockId: block.id, query, index: 0 };
      });
    } else {
      setSlash((prev) => (prev ? null : prev));
    }
  };

  /* ---------- apply a slash/type-menu choice ---------- */
  const applySlashItem = (type) => {
    if (!slash) return;
    const blockId = slash.blockId;
    setSlash(null);

    setBlockText(blockEls, blockId, "");
    store.updateBlock(pageId, blockId, { content: "" });

    if (type === "divider") {
      store.setBlockType(pageId, blockId, "divider");
      return;
    }
    if (type === "image") {
      setImageUrl("");
      setImageError("");
      setImageFor(blockId);
      return;
    }
    focusAfterRef.current = { id: blockId, atEnd: true };
    store.setBlockType(pageId, blockId, type);
  };

  const applySlashSelection = () => {
    const items = slashItems(slash.query);
    const item = items[Math.min(slash.index, items.length - 1)];
    if (item) applySlashItem(item.type);
  };

  /* ---------- keyboard editing ---------- */
  const onBlockKeyDown = (e, block, editable) => {
    const all = store.getPageBlocks(pageId);
    const index = all.findIndex((b) => b.id === block.id);
    const text = editable.innerText;

    if (e.key === "Enter" && !e.shiftKey) {
      if (block.type === "code") return; // allow newline in code
      e.preventDefault();
      if (slash) {
        applySlashSelection();
        return;
      }
      const offset = getCaretOffset(editable);
      const before = text.slice(0, offset);
      const after = text.slice(offset);
      let newType = "text";
      if (
        ["bulleted", "numbered", "todo", "quote", "callout", "toggle"].includes(
          block.type
        )
      ) {
        newType = block.type;
      }
      store.updateBlock(pageId, block.id, { content: before });
      editable.innerText = before;
      if (editable.dataset.placeholder !== undefined) {
        editable.dataset.placeholder = String(!before);
      }
      const nb = store.addBlock(pageId, newType, after, index + 1);
      if (nb) focusAfterRef.current = { id: nb.id, atEnd: true };
      return;
    }

    if (e.key === "Backspace") {
      if (slash) {
        e.preventDefault();
        setSlash(null);
        return;
      }
      const offset = getCaretOffset(editable);
      if (offset === 0) {
        if (!text && index > 0) {
          e.preventDefault();
          const prev = all[index - 1];
          focusAfterRef.current = { id: prev.id, atEnd: false };
          store.removeBlock(pageId, block.id);
          return;
        }
        if (!text && index === 0) {
          e.preventDefault();
          return;
        }
        if (offset === 0 && index > 0) {
          e.preventDefault();
          const prev = all[index - 1];
          const merged = (prev.content || "") + text;
          store.updateBlock(pageId, prev.id, { content: merged });
          setBlockText(blockEls, prev.id, merged);
          focusAfterRef.current = { id: prev.id, atEnd: false };
          store.removeBlock(pageId, block.id);
          return;
        }
      }
      if (!text && index === 0) e.preventDefault();
    }

    if (slash && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      const items = slashItems(slash.query);
      const max = items.length - 1;
      const next =
        e.key === "ArrowDown"
          ? Math.min(max, slash.index + 1)
          : Math.max(0, slash.index - 1);
      setSlash((prev) => (prev ? Object.assign({}, prev, { index: next }) : prev));
      return;
    }

    if (e.key === "Escape") {
      setSlash(null);
    }
  };

  /* ---------- block menu / icon picker ---------- */
  const openTypeMenu = (block, x, y) => {
    // Build the items against the block so the checked state matches its
    // current type.
    const items = slashItems("").map((it) => ({
      label: it.label,
      icon: "file-text",
      checked: block.type === it.type,
      action: () => {
        if (it.type === "image") {
          setImageUrl("");
          setImageFor(block.id);
          return;
        }
        if (it.type === "divider") {
          store.setBlockType(pageId, block.id, "divider");
          return;
        }
        focusAfterRef.current = { id: block.id, atEnd: true };
        store.setBlockType(pageId, block.id, it.type);
      },
    }));
    openMenu({
      x,
      y,
      header: { name: "Change type", sub: "Transform this block" },
      items,
    });
  };

  const openIconPicker = (btn) => {
    const r = btn.getBoundingClientRect();
    openMenu({
      x: r.left,
      y: r.bottom + 4,
      header: { name: "Choose an icon" },
      items: COMMON_ICONS.map((glyph) => ({
        label: glyph,
        icon: "dot",
        action: () => {
          store.updatePageIcon(pageId, glyph);
          showToast("Icon updated", "success");
        },
      })),
    });
  };

  /* ---------- drag & drop ---------- */
  const onDragStart = (e, block, wrap) => {
    draggingRef.current = block.id;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", block.id);
    if (wrap) wrap.classList.add("is-dragging");
    const preview = document.createElement("div");
    preview.className = "drag-preview";
    preview.textContent = block.content || block.type;
    document.body.appendChild(preview);
    e.dataTransfer.setDragImage(preview, 10, 10);
    setTimeout(() => preview.remove(), 0);
  };

  const onDragEnd = (block, wrap) => {
    draggingRef.current = null;
    if (wrap) wrap.classList.remove("is-dragging");
  };

  const onDragOver = (e, block) => {
    if (!draggingRef.current || draggingRef.current === block.id) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const onDrop = (e, block, wrap) => {
    const dragged = draggingRef.current;
    if (!dragged || dragged === block.id) return;
    e.preventDefault();
    e.stopPropagation();
    const all = store.getPageBlocks(pageId);
    const fromIdx = all.findIndex((b) => b.id === dragged);
    const toIdx = all.findIndex((b) => b.id === block.id);
    if (fromIdx < 0 || toIdx < 0) return;
    const rect = wrap.getBoundingClientRect();
    const above = e.clientY < rect.top + rect.height / 2;
    store.moveBlockIndex(pageId, fromIdx, above ? toIdx : toIdx + 1);
    focusAfterRef.current = { id: dragged, atEnd: true };
  };

  /* ---------- add block helpers ---------- */
  const addEmptyBlock = (focusAtEnd) => {
    const b = store.addBlock(pageId, "text", "");
    if (b) focusAfterRef.current = { id: b.id, atEnd: focusAtEnd };
    return b;
  };

  const onBlocksClick = (e) => {
    if (e.target === e.currentTarget) addEmptyBlock(true);
  };

  /* ---------- image dialog ---------- */
  const insertImage = () => {
    if (imageFor === null || imageBusy) return;
    const val = imageUrl.trim();
    if (!val) {
      setImageError("Paste an image URL or choose a file.");
      focusFirstInvalid(imageFormRef.current);
      return;
    }
    if (!isImageSource(val)) {
      setImageError("Use an http(s) URL or an image file.");
      focusFirstInvalid(imageFormRef.current);
      return;
    }
    const blockId = imageFor;
    store.updateBlock(pageId, blockId, { content: val });
    focusAfterRef.current = { id: blockId, atEnd: false };
    store.setBlockType(pageId, blockId, "image");
    setImageFor(null);
    setImageUrl("");
    setImageError("");
  };

  const onImageFile = (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type || !file.type.startsWith("image/")) {
      setImageError("Choose an image file.");
      focusFirstInvalid(imageFormRef.current);
      return;
    }
    if (file.size > 1.5 * 1024 * 1024) {
      setImageError("Choose an image under 1.5 MB.");
      focusFirstInvalid(imageFormRef.current);
      return;
    }
    setImageBusy(true);
    setImageError("");
    const reader = new FileReader();
    reader.onload = () => {
      setImageUrl(String(reader.result || ""));
      setImageBusy(false);
    };
    reader.onerror = () => {
      setImageError("That file could not be read.");
      setImageBusy(false);
    };
    reader.readAsDataURL(file);
  };

  /* ---------- render ---------- */
  const path = store
    .getPath(pageId)
    .map((p) => p.title || "Untitled")
    .join(" / ");
  const edited = relativeTime(page.updatedAt);

  let numberSeq = 0;
  const last = blocks[blocks.length - 1];
  const needsPhantom = !!blocks.length && !(last && last.type === "text" && last.content === "");
  const slashResults = slash ? slashItems(slash.query) : [];

  return (
    <div className="editor-page" ref={rootRef}>
      <div className="page-header">
        <button
          className="page-header-icon"
          aria-label="Change page icon"
          onClick={(e) => openIconPicker(e.currentTarget)}
        >
          {page.icon || "\uD83D\uDCDD"}
        </button>
        <div
          className="page-header-title"
          contentEditable="true"
          suppressContentEditableWarning
          ref={titleRef}
          role="textbox"
          aria-multiline="true"
          onInput={onTitleInput}
        />
        <div className="page-meta">
          {edited ? "Edited " + edited : null}
          {path}
        </div>
      </div>

      <div className="editor-blocks" onClick={onBlocksClick}>
        {!blocks.length ? (
          <div className="editor-empty-hint" onClick={() => addEmptyBlock(true)}>
            {"Click to start writing \u2014 or type / for commands"}
          </div>
        ) : (
          <>
            {blocks.map((block, i) => {
              const prev = blocks[i - 1];
              if (block.type === "numbered" && prev && prev.type === "numbered") {
                numberSeq += 1;
              } else {
                numberSeq = block.type === "numbered" ? 1 : 0;
              }
              return (
                <Block
                  key={block.id}
                  block={block}
                  pageId={pageId}
                  numberSeq={numberSeq}
                  register={register}
                  onTextInput={onTextInput}
                  onKeyDown={onBlockKeyDown}
                  onImageRequest={(blockId) => {
                    setImageUrl("");
                    setImageFor(blockId);
                  }}
                  onTypeMenu={openTypeMenu}
                  onDragStart={onDragStart}
                  onDragEnd={onDragEnd}
                  onDragOver={onDragOver}
                  onDrop={onDrop}
                />
              );
            })}
            {needsPhantom ? (
              <PhantomBlock
                onConvert={(content) => {
                  const b = store.addBlock(pageId, "text", content);
                  if (b) focusAfterRef.current = { id: b.id, atEnd: true };
                }}
                onBackspaceEmpty={() => {
                  const all = store.getPageBlocks(pageId);
                  const prev = all[all.length - 1];
                  if (prev) {
                    const el = blockEls.current.get(prev.id);
                    if (el) el.focus();
                  }
                }}
              />
            ) : null}
          </>
        )}
      </div>

      {slash
        ? createPortal(
            <div
              ref={slashRef}
              className="slash-menu"
              role="listbox"
              style={{ left: 0, top: 0, visibility: "hidden" }}
            >
              <div className="slash-menu-header">Add a block</div>
              {slashResults.length ? (
                slashResults.map((item, i) => (
                  <button
                    key={item.type}
                    className="slash-item"
                    data-selected={String(i === slash.index)}
                    role="option"
                    onMouseMove={() =>
                      setSlash((prev) =>
                        prev ? Object.assign({}, prev, { index: i }) : prev
                      )
                    }
                    onClick={() => applySlashItem(item.type)}
                  >
                    <span className="slash-item-icon">{item.glyph}</span>
                    <span className="slash-item-body">
                      <div className="slash-item-label">{item.label}</div>
                      <div className="slash-item-desc">{item.desc}</div>
                    </span>
                  </button>
                ))
              ) : (
                <div className="slash-empty">
                  {"No results for \u201C" + slash.query + "\u201D"}
                </div>
              )}
            </div>,
            document.body
          )
        : null}

      {format
        ? createPortal(
            <div
              ref={formatRef}
              className="format-toolbar"
              role="toolbar"
              aria-label="Text formatting"
              style={{ left: 0, top: 0, opacity: 0 }}
            >
              {FORMAT_BUTTONS.map((b, i) =>
                b.sep ? (
                  <span className="fmt-sep" key={"sep" + i} />
                ) : (
                  <button
                    key={b.cmd}
                    className="fmt-btn"
                    title={b.title}
                    aria-label={b.title}
                    data-cmd={b.cmd}
                    data-active={String(!!format.active[b.cmd])}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      document.execCommand(b.cmd, false, b.extra || null);
                      syncSelection();
                    }}
                  >
                    <Icon name={b.icon} />
                  </button>
                )
              )}
              <div className="format-arrow" />
            </div>,
            document.body
          )
        : null}

      <Dialog
        open={imageFor !== null}
        title="Insert image"
        size="modal-sm"
        onClose={() => {
          setImageFor(null);
          setImageError("");
        }}
        footer={
          <>
            <button
              className="btn btn-secondary"
              type="button"
              disabled={imageBusy}
              onClick={() => fileRef.current && fileRef.current.click()}
            >
              {imageBusy ? "Reading…" : "Choose file"}
            </button>
            <button
              className="btn btn-primary"
              type="submit"
              form="image-form"
              disabled={imageBusy || !imageUrl.trim()}
            >
              Insert
            </button>
          </>
        }
      >
        <form
          id="image-form"
          className="dialog-form"
          ref={imageFormRef}
          noValidate
          aria-busy={imageBusy}
          onSubmit={(e) => {
            e.preventDefault();
            insertImage();
          }}
        >
          <p id="image-url-help">
            Paste an image URL below, or choose an image file under 1.5 MB.
          </p>
          <label className="dialog-label" htmlFor="image-url">
            Image URL
          </label>
          <input
            id="image-url"
            className="dialog-input"
            type="text"
            name="image-url"
            placeholder="https://example.com/image.png"
            value={imageUrl}
            autoFocus
            aria-invalid={!!imageError}
            aria-describedby={imageError ? "image-url-help image-url-error" : "image-url-help"}
            onChange={(e) => {
              setImageUrl(e.target.value);
              if (imageError) setImageError("");
            }}
          />
          {imageError ? (
            <p className="field-error" id="image-url-error" role="alert">
              {imageError}
            </p>
          ) : null}
          <input
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            ref={fileRef}
            onChange={onImageFile}
          />
          <p className="form-hint">
            Files are stored with the page, so they survive a reload.
          </p>
        </form>
      </Dialog>
    </div>
  );
}
