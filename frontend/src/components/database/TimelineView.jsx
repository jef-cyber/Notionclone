/* ============================================================
   Interactive roadmap / timeline.

   Every database view shares one rows array. This component owns only
   viewport preferences (persisted in viewConfig) and transient drag/link
   state. Task dates are written on pointer-up through the parent's row queue;
   dependencies are persisted on the DataTable document by the parent.
   ============================================================ */
import React, { useEffect, useMemo, useRef, useState } from "react";

import { Icon, showToast } from "../ui/index.jsx";
import {
  addDays,
  cellText,
  dayKey,
  dependencyDescription,
  dependencyEdges,
  dependencyExists,
  dependencyScheduleError,
  dependencyTypeOf,
  DEPENDENCY_TYPE_SHORT,
  DEPENDENCY_TYPES,
  diffDays,
  endDateColumn,
  fromDayKey,
  groupColumn,
  makeDependency,
  MONTHS,
  optionsFor,
  rowDates,
  snapDragRange,
  snapLabel,
  startDateColumn,
  statusColor,
  statusColumnOf,
  titleColumn,
  wouldCreateCycle,
} from "./databaseUtils.js";

const LABEL_W = 190;
const ROW_H = 38;
const GROUP_H = 28;
const AUTO_SCROLL_EDGE = 56;
const AUTO_SCROLL_MIN = 6;
const AUTO_SCROLL_MAX = 26;
const BAR_HIT_MIN = 32;
const RESIZE_MIN_WIDTH = 28;

const ZOOMS = [
  { id: "day", label: "Day", dayWidth: 30, days: 42, step: 7 },
  { id: "week", label: "Week", dayWidth: 14, days: 140, step: 28 },
  { id: "month", label: "Month", dayWidth: 5, days: 365, step: 90 },
  { id: "quarter", label: "Quarter", dayWidth: 2, days: 730, step: 180 },
];

function zoomConfig(id) {
  return ZOOMS.find((z) => z.id === id) || ZOOMS[2];
}

function validDayKey(key) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(key || "")) && !!fromDayKey(key);
}

function alignAnchor(key, zoom) {
  const d = fromDayKey(validDayKey(key) ? key : dayKey(new Date()));
  if (!d) return dayKey(new Date());
  if (zoom === "week") {
    const offset = (d.getDay() + 6) % 7; // Monday-first
    d.setDate(d.getDate() - offset);
  } else if (zoom === "month") {
    d.setDate(1);
  } else if (zoom === "quarter") {
    d.setMonth(Math.floor(d.getMonth() / 3) * 3, 1);
  }
  return dayKey(d);
}

function shortDate(key) {
  const d = fromDayKey(key);
  if (!d) return key;
  return MONTHS[d.getMonth()].slice(0, 3) + " " + d.getDate();
}

function dependencyKey(dep) {
  return String(dep.id || `${dep.from}->${dep.to}`);
}

/** Header cells clipped to the visible range. */
function buildAxis(startKey, totalDays, zoom, dayWidth) {
  const cells = [];
  let cursor = 0;

  if (zoom === "day") {
    for (let i = 0; i < totalDays; i += 1) {
      const key = addDays(startKey, i);
      cells.push({
        key,
        label: String(fromDayKey(key).getDate()),
        width: dayWidth,
        offset: i * dayWidth,
      });
    }
    return cells;
  }

  if (zoom === "week") {
    for (let i = 0; i < totalDays; i += 7) {
      const key = addDays(startKey, i);
      const d = fromDayKey(key);
      const length = Math.min(7, totalDays - i);
      cells.push({
        key,
        label: MONTHS[d.getMonth()].slice(0, 3) + " " + d.getDate(),
        width: length * dayWidth,
        offset: i * dayWidth,
      });
    }
    return cells;
  }

  while (cursor < totalDays) {
    const d = fromDayKey(addDays(startKey, cursor));
    let length;
    let label;
    if (zoom === "quarter") {
      const monthEnd = Math.floor(d.getMonth() / 3) * 3 + 3;
      const end = new Date(d.getFullYear(), monthEnd, 1);
      length = Math.round((end - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
      label = "Q" + (Math.floor(d.getMonth() / 3) + 1) + " " + d.getFullYear();
    } else {
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      length = Math.round((end - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
      label = MONTHS[d.getMonth()].slice(0, 3) + " " + String(d.getFullYear()).slice(2);
    }
    length = Math.max(1, Math.min(length, totalDays - cursor));
    cells.push({ key: dayKey(d), label, width: length * dayWidth, offset: cursor * dayWidth });
    cursor += length;
  }
  return cells;
}

function buildLayout(dataTable, startCol, endCol) {
  const rows = dataTable.rows || [];
  const select = groupColumn(dataTable);
  const props = dataTable.properties || {};
  const hasSelect = props[select] && props[select].type === "select";
  const groupCol = hasSelect ? select : null;
  const groups = groupCol ? optionsFor(dataTable, groupCol).slice() : ["Tasks"];

  const dated = [];
  const undated = [];
  const groupOfRow = new Map();

  rows.forEach((row) => {
    if (!rowDates(dataTable, row, startCol, endCol)) {
      undated.push(row);
      return;
    }
    dated.push(row);
    const value = groupCol ? cellText(row[groupCol]) || "No value" : "Tasks";
    groupOfRow.set(String(row.id), value);
    if (groups.indexOf(value) === -1) groups.push(value);
  });

  const nodes = [];
  const rowTops = new Map();
  let y = 0;

  groups.forEach((group) => {
    const groupRows = dated.filter((row) => groupOfRow.get(String(row.id)) === group);
    if (!groupRows.length) return;

    nodes.push({ kind: "group", key: "group-" + group, label: group, y });
    y += GROUP_H;

    groupRows.forEach((row) => {
      rowTops.set(String(row.id), y);
      nodes.push({ kind: "row", key: String(row.id), row, y });
      y += ROW_H;
    });
  });

  return { nodes, rowTops, groups, dated, undated, groupCol, height: y };
}

/** A simple cubic connector; the arrow is added by the SVG marker. */
function dependencyPath(fromX, fromY, toX, toY, fromSide, targetSide) {
  const bend = Math.max(28, Math.abs(toX - fromX) * 0.35);
  const c1 = fromX + (fromSide === "right" ? bend : -bend);
  const c2 = toX + (targetSide === "right" ? bend : -bend);
  return `M ${fromX} ${fromY} C ${c1} ${fromY}, ${c2} ${toY}, ${toX} ${toY}`;
}

export default function TimelineView({
  dataTable,
  setCells,
  addRow,
  openSettings,
  openRow,
  onConfigChange,
  onDependenciesChange,
  revision = 0,
}) {
  const scrollRef = useRef(null);
  const dragRef = useRef(null);
  const autoScrollRef = useRef({ raf: 0, clientX: 0, active: false });
  const lastDragAt = useRef(0);
  const linkModeRef = useRef(false);

  const [drag, setDrag] = useState(null);
  const [linkMode, setLinkMode] = useState(false);
  const [linkFrom, setLinkFrom] = useState(null);
  const [linkType, setLinkType] = useState("finish-to-start");
  const [linkHover, setLinkHover] = useState(null);
  const [linkPointer, setLinkPointer] = useState(null);
  const [selectedDependencyId, setSelectedDependencyId] = useState(null);
  const [scrolled, setScrolled] = useState(false);

  const startCol = startDateColumn(dataTable);
  const endCol = endDateColumn(dataTable, startCol);
  const titleCol = titleColumn(dataTable);
  const statusCol = statusColumnOf(dataTable);
  const dependencies = dataTable.dependencies || [];
  const config = dataTable.viewConfig || {};
  const zoom = zoomConfig(config.timelineZoom);
  const todayKey = dayKey(new Date());

  const datedRows = useMemo(() => {
    if (!startCol) return [];
    return (dataTable.rows || []).filter((row) => rowDates(dataTable, row, startCol, endCol));
  }, [dataTable, revision, startCol, endCol]);

  const firstDate = useMemo(() => {
    if (!datedRows.length) return todayKey;
    return datedRows
      .map((row) => rowDates(dataTable, row, startCol, endCol).startKey)
      .sort()[0];
  }, [datedRows, dataTable, startCol, endCol, todayKey]);

  const anchorSource = validDayKey(config.timelineAnchor)
    ? config.timelineAnchor
    : firstDate;
  const viewStart = alignAnchor(anchorSource, zoom.id);
  const canvasWidth = zoom.days * zoom.dayWidth;
  const axis = useMemo(
    () => buildAxis(viewStart, zoom.days, zoom.id, zoom.dayWidth),
    [viewStart, zoom.days, zoom.id, zoom.dayWidth]
  );
  const layout = useMemo(
    () =>
      startCol
        ? buildLayout(dataTable, startCol, endCol)
        : { nodes: [], rowTops: new Map(), dated: [], undated: [], height: 0 },
    [dataTable, revision, startCol, endCol]
  );
  const rowById = useMemo(
    () => new Map((dataTable.rows || []).map((row) => [String(row.id), row])),
    [dataTable, revision]
  );

  const todayOffset = diffDays(viewStart, todayKey);
  const totalWidth = LABEL_W + canvasWidth;
  const scheduleOf = (row) => rowDates(dataTable, row, startCol, endCol);
  const rowTitle = (row) =>
    (row && (cellText(row[titleCol]) || "Untitled")) || "Deleted task";

  const saveView = (patch) => {
    if (onConfigChange) onConfigChange(patch);
  };

  const moveRange = (direction) => {
    saveView({ timelineAnchor: addDays(viewStart, direction * zoom.step) });
  };

  const setZoom = (id) => {
    saveView({ timelineZoom: id, timelineAnchor: viewStart });
  };

  const previewFor = (row) => {
    if (!drag || String(drag.rowId) !== String(row.id)) return scheduleOf(row);
    return { startKey: drag.startKey, endKey: drag.endKey };
  };

  const rangeGeometry = (range) => {
    const startIndex = diffDays(viewStart, range.startKey);
    const endIndex = diffDays(viewStart, range.endKey);
    return {
      startIndex,
      endIndex,
      rawLeft: startIndex * zoom.dayWidth,
      rawRight: (endIndex + 1) * zoom.dayWidth,
    };
  };

  const rawBarGeometry = (row) => {
    const range = previewFor(row);
    if (!range) return null;
    return { ...rangeGeometry(range), range };
  };

  const barGeometry = (row) => {
    const raw = rawBarGeometry(row);
    if (!raw) return null;
    const visibleStart = Math.max(0, raw.startIndex);
    const visibleEnd = Math.min(zoom.days - 1, raw.endIndex);
    if (visibleEnd < 0 || visibleStart >= zoom.days) return null;
    return {
      ...raw,
      left: visibleStart * zoom.dayWidth,
      width: Math.max(
        zoom.dayWidth,
        (visibleEnd - visibleStart + 1) * zoom.dayWidth
      ),
    };
  };

  const dependencyError = (row, nextStart, nextEnd) => {
    for (let i = 0; i < dependencies.length; i += 1) {
      const dep = dependencies[i];
      if (String(dep.from) !== String(row.id) && String(dep.to) !== String(row.id)) {
        continue;
      }
      const source = rowById.get(String(dep.from));
      const target = rowById.get(String(dep.to));
      if (!source || !target) continue;
      const sourceRange =
        String(source.id) === String(row.id)
          ? { startKey: nextStart, endKey: nextEnd }
          : scheduleOf(source);
      const targetRange =
        String(target.id) === String(row.id)
          ? { startKey: nextStart, endKey: nextEnd }
          : scheduleOf(target);
      const error = dependencyScheduleError(
        dependencyTypeOf(dep),
        sourceRange,
        targetRange
      );
      if (error) return error;
    }
    return "";
  };

  const checkDependency = (from, to, type) => {
    if (String(from) === String(to)) {
      return { ok: false, kind: "error", message: "A task cannot depend on itself" };
    }
    const source = rowById.get(String(from));
    const target = rowById.get(String(to));
    if (!source || !target) {
      return {
        ok: false,
        kind: "error",
        message: "Both tasks must still exist before they can be linked",
      };
    }
    if (source.__pending || target.__pending) {
      return {
        ok: false,
        kind: "info",
        message: "Wait for the new task to finish saving before linking it",
      };
    }
    if (dependencyExists(dependencies, from, to)) {
      return {
        ok: false,
        kind: "info",
        message: "Those tasks are already linked",
      };
    }
    if (wouldCreateCycle(dependencies, from, to)) {
      return {
        ok: false,
        kind: "error",
        message: "That link would create a dependency cycle",
      };
    }
    const scheduleError = dependencyScheduleError(
      type,
      scheduleOf(source),
      scheduleOf(target)
    );
    if (scheduleError) {
      return { ok: false, kind: "error", message: scheduleError };
    }
    return { ok: true };
  };

  const linkStateFor = (row) => {
    if (!linkMode || !linkFrom) return "";
    if (String(row.id) === String(linkFrom)) return "source";
    return checkDependency(linkFrom, row.id, linkType).ok ? "valid" : "invalid";
  };

  const stopAutoScroll = () => {
    const state = autoScrollRef.current;
    state.active = false;
    state.clientX = 0;
    state.lastTime = 0;
    if (state.raf) {
      cancelAnimationFrame(state.raf);
      state.raf = 0;
    }
  };

  const updateDragAt = (clientX) => {
    const current = dragRef.current;
    if (!current) return;
    const scroller = scrollRef.current;
    const scrollDelta = scroller ? scroller.scrollLeft - current.startScrollLeft : 0;
    const deltaPx = clientX - current.startX + scrollDelta;
    const deltaDays = Math.round(deltaPx / zoom.dayWidth);
    const next = snapDragRange(
      current.mode,
      current.originalStart,
      current.originalEnd,
      deltaDays,
      zoom.id
    );

    if (Math.abs(deltaPx) > 3) current.moved = true;
    current.preview = next;
    setDrag((previous) => {
      if (
        previous &&
        previous.rowId === current.row.id &&
        previous.mode === current.mode &&
        previous.startKey === next.startKey &&
        previous.endKey === next.endKey
      ) {
        return previous;
      }
      return {
        rowId: current.row.id,
        mode: current.mode,
        startKey: next.startKey,
        endKey: next.endKey,
      };
    });
  };

  const autoScrollTick = (timestamp) => {
    const current = dragRef.current;
    const state = autoScrollRef.current;
    if (!current || !state.active) {
      state.raf = 0;
      state.lastTime = 0;
      return;
    }
    const scroller = scrollRef.current;
    if (!scroller) {
      state.raf = 0;
      state.lastTime = 0;
      return;
    }

    const now = typeof timestamp === "number" ? timestamp : performance.now();
    const previousTime = state.lastTime || now;
    state.lastTime = now;
    const elapsed = Math.max(8, Math.min(40, now - previousTime)) / 16.667;
    const rect = scroller.getBoundingClientRect();
    const edge = Math.min(AUTO_SCROLL_EDGE, rect.width / 3);
    let direction = 0;
    let intensity = 0;
    if (state.clientX < rect.left + edge) {
      direction = -1;
      intensity = (rect.left + edge - state.clientX) / edge;
    } else if (state.clientX > rect.right - edge) {
      direction = 1;
      intensity = (state.clientX - (rect.right - edge)) / edge;
    }
    intensity = Math.max(0, Math.min(1, intensity));
    if (!direction) {
      state.raf = 0;
      state.lastTime = 0;
      return;
    }

    const before = scroller.scrollLeft;
    const max = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
    const speed = AUTO_SCROLL_MIN + (AUTO_SCROLL_MAX - AUTO_SCROLL_MIN) * intensity;
    const target = before + direction * speed * elapsed;
    scroller.scrollLeft = Math.max(0, Math.min(max, target));
    if (Math.abs(scroller.scrollLeft - before) < 0.5) {
      state.raf = 0;
      state.lastTime = 0;
      return;
    }
    updateDragAt(state.clientX);
    state.raf = requestAnimationFrame(autoScrollTick);
  };

  const armAutoScroll = (clientX) => {
    const state = autoScrollRef.current;
    state.clientX = clientX;
    const scroller = scrollRef.current;
    if (!scroller) {
      stopAutoScroll();
      return;
    }
    const rect = scroller.getBoundingClientRect();
    const edge = Math.min(AUTO_SCROLL_EDGE, rect.width / 3);
    const nearEdge =
      clientX < rect.left + edge || clientX > rect.right - edge;
    if (!nearEdge) {
      stopAutoScroll();
      return;
    }
    state.active = true;
    if (!state.lastTime) state.lastTime = performance.now();
    if (!state.raf) state.raf = requestAnimationFrame(autoScrollTick);
  };

  /* Coalesce high-frequency pointer events to one React update per frame. */
  const scheduleDragUpdate = (clientX) => {
    const current = dragRef.current;
    if (!current) return;
    current.lastClientX = clientX;
    if (current.frame) return;
    current.frame = requestAnimationFrame(() => {
      if (dragRef.current !== current) return;
      current.frame = 0;
      updateDragAt(current.lastClientX);
      armAutoScroll(current.lastClientX);
    });
  };

  const cancelScheduledDrag = () => {
    const current = dragRef.current;
    if (!current || !current.frame) return;
    cancelAnimationFrame(current.frame);
    current.frame = 0;
  };

  const syncDragToScroll = () => {
    const current = dragRef.current;
    if (!current) return;
    scheduleDragUpdate(current.lastClientX);
  };

  const beginDrag = (event, row, mode) => {
    if (linkMode) return;
    if (event.button !== undefined && event.button !== 0) return;
    const range = scheduleOf(row);
    if (!range) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.currentTarget.setPointerCapture) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    dragRef.current = {
      row,
      mode,
      startX: event.clientX,
      startScrollLeft: scrollRef.current ? scrollRef.current.scrollLeft : 0,
      originalStart: range.startKey,
      originalEnd: range.endKey,
      preview: { startKey: range.startKey, endKey: range.endKey },
      lastClientX: event.clientX,
      frame: 0,
      moved: false,
    };
    setDrag({
      rowId: row.id,
      mode,
      startKey: range.startKey,
      endKey: range.endKey,
    });
  };

  const updateDrag = (event) => {
    if (!dragRef.current) return;
    scheduleDragUpdate(event.clientX);
  };

  const cancelDrag = () => {
    cancelScheduledDrag();
    stopAutoScroll();
    if (dragRef.current) lastDragAt.current = Date.now();
    dragRef.current = null;
    setDrag(null);
  };

  const finishDrag = (event) => {
    const current = dragRef.current;
    if (!current) return;
    if (event && typeof event.clientX === "number") {
      updateDragAt(event.clientX);
    }
    cancelScheduledDrag();
    stopAutoScroll();
    dragRef.current = null;
    setDrag(null);

    const preview = current.preview || {
      startKey: current.originalStart,
      endKey: current.originalEnd,
    };
    if (!current.moved) return;

    // Suppress the synthetic click that follows pointer-up. This must be set
    // before validation so an invalid drop does not accidentally open the row.
    lastDragAt.current = Date.now();

    const changed =
      preview.startKey !== current.originalStart ||
      preview.endKey !== current.originalEnd;
    if (!changed) return;

    const error = dependencyError(current.row, preview.startKey, preview.endKey);
    if (error) {
      showToast(error, "error");
      return;
    }

    const patch = { [startCol]: preview.startKey };
    if (endCol) patch[endCol] = preview.endKey;
    setCells(current.row.id, patch);
  };

  const addDependency = (from, to) => {
    const result = checkDependency(from, to, linkType);
    if (!result.ok) {
      showToast(result.message, result.kind || "error");
      return;
    }

    onDependenciesChange(dependencies.concat(makeDependency(from, to, linkType))).then(
      (ok) => {
        if (ok) {
          setLinkFrom(null);
          setLinkHover(null);
          setLinkPointer(null);
          showToast("Dependency added", "success");
        }
      }
    );
  };

  const clickBar = (row) => {
    if (Date.now() - lastDragAt.current < 250) return;
    if (linkMode) {
      if (!linkFrom) {
        setLinkFrom(String(row.id));
      } else if (String(linkFrom) === String(row.id)) {
        setLinkFrom(null);
        setLinkHover(null);
        setLinkPointer(null);
      } else {
        addDependency(linkFrom, row.id);
      }
      return;
    }
    openRow(row);
  };

  const removeDependency = (dep) => {
    const key = dependencyKey(dep);
    const next = dependencies.filter(
      (item) =>
        !(String(item.from) === String(dep.from) && String(item.to) === String(dep.to))
    );
    setSelectedDependencyId((current) => (current === key ? null : current));
    return onDependenciesChange(next);
  };

  const selectDependency = (dep) => {
    const key = dependencyKey(dep);
    setSelectedDependencyId((current) => (current === key ? null : key));
  };

  const handleLinkPointerMove = (event) => {
    if (!linkMode || !linkFrom) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left - LABEL_W;
    const y = event.clientY - rect.top;
    setLinkPointer((previous) =>
      previous && Math.abs(previous.x - x) < 0.5 && Math.abs(previous.y - y) < 0.5
        ? previous
        : { x, y }
    );
    const bar =
      event.target && event.target.closest ? event.target.closest(".tl-bar") : null;
    const id = bar ? bar.getAttribute("data-row-id") : null;
    setLinkHover((previous) => (previous === id ? previous : id));
  };

  const clearLinkPointer = () => {
    setLinkPointer(null);
    setLinkHover(null);
  };

  /* Keep the latest link-mode value available to the one-time Escape listener. */
  useEffect(() => {
    linkModeRef.current = linkMode;
  }, [linkMode]);

  useEffect(() => {
    if (scrolled || !scrollRef.current || !startCol) return;
    if (todayOffset >= 0 && todayOffset < zoom.days) {
      scrollRef.current.scrollLeft = Math.max(
        0,
        todayOffset * zoom.dayWidth - scrollRef.current.clientWidth / 2
      );
    }
    setScrolled(true);
  }, [scrolled, startCol, todayOffset, zoom.days, zoom.dayWidth]);

  /* Escape cancels an in-flight drag without saving. */
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key !== "Escape") return;
      const hadDrag = !!dragRef.current;
      if (hadDrag) cancelDrag();
      if (linkModeRef.current) {
        setLinkMode(false);
        setLinkFrom(null);
        setSelectedDependencyId(null);
        clearLinkPointer();
      }
      if (hadDrag) event.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  /* Losing focus on the tab should not leave a preview or auto-scroll running. */
  useEffect(() => {
    const abortDrag = () => {
      const current = dragRef.current;
      if (!current) return;
      lastDragAt.current = Date.now();
      if (current.frame) cancelAnimationFrame(current.frame);
      dragRef.current = null;
      stopAutoScroll();
      setDrag(null);
    };
    const onVisibilityChange = () => {
      if (document.hidden) abortDrag();
    };
    window.addEventListener("blur", abortDrag);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("blur", abortDrag);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      const state = autoScrollRef.current;
      if (state.raf) {
        cancelAnimationFrame(state.raf);
        state.raf = 0;
      }
      const current = dragRef.current;
      if (current && current.frame) cancelAnimationFrame(current.frame);
      dragRef.current = null;
    };
  }, []);

  /* Selecting a connector/chip provides a keyboard delete path. */
  useEffect(() => {
    if (!selectedDependencyId) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setSelectedDependencyId(null);
        return;
      }
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      const tag = document.activeElement && document.activeElement.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        (document.activeElement && document.activeElement.isContentEditable)
      ) {
        return;
      }
      const dep = dependencies.find(
        (item) => dependencyKey(item) === selectedDependencyId
      );
      if (!dep) return;
      event.preventDefault();
      removeDependency(dep);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedDependencyId, dependencies, onDependenciesChange]);

  const selectedDependency = selectedDependencyId
    ? dependencies.find((dep) => dependencyKey(dep) === selectedDependencyId)
    : null;

  const connectors = dependencies
    .map((dep) => {
      const type = dependencyTypeOf(dep);
      const source = rowById.get(String(dep.from));
      const target = rowById.get(String(dep.to));
      if (!source || !target) return null;
      const sourceTop = layout.rowTops.get(String(dep.from));
      const targetTop = layout.rowTops.get(String(dep.to));
      const sourceBar = rawBarGeometry(source);
      const targetBar = rawBarGeometry(target);
      if (
        sourceTop === undefined ||
        targetTop === undefined ||
        !sourceBar ||
        !targetBar
      ) {
        return null;
      }
      const edges = dependencyEdges(type);
      const id = dependencyKey(dep);
      return {
        id,
        type,
        selected: id === selectedDependencyId,
        label: `${rowTitle(source)} — ${DEPENDENCY_TYPES[type]} — ${rowTitle(target)}`,
        d: dependencyPath(
          edges.source === "right" ? sourceBar.rawRight : sourceBar.rawLeft,
          sourceTop + ROW_H / 2,
          edges.target === "right" ? targetBar.rawRight : targetBar.rawLeft,
          targetTop + ROW_H / 2,
          edges.source,
          edges.target
        ),
      };
    })
    .filter(Boolean);

  let draftLink = null;
  if (linkMode && linkFrom) {
    const source = rowById.get(String(linkFrom));
    const sourceTop = layout.rowTops.get(String(linkFrom));
    const sourceBar = source ? rawBarGeometry(source) : null;
    if (source && sourceBar && sourceTop !== undefined) {
      const hovered = linkHover ? rowById.get(String(linkHover)) : null;
      const hoveredTop = hovered ? layout.rowTops.get(String(hovered.id)) : undefined;
      const hoveredBar = hovered ? rawBarGeometry(hovered) : null;
      let targetX = null;
      let targetY = null;
      let targetSide = "left";
      let invalid = false;

      if (hovered && hoveredBar && hoveredTop !== undefined) {
        const edges = dependencyEdges(linkType);
        targetSide = edges.target;
        targetX =
          edges.target === "right" ? hoveredBar.rawRight : hoveredBar.rawLeft;
        targetY = hoveredTop + ROW_H / 2;
        invalid = !checkDependency(linkFrom, hovered.id, linkType).ok;
      } else if (linkPointer) {
        targetX = linkPointer.x;
        targetY = linkPointer.y;
      }

      if (targetX !== null) {
        const edges = dependencyEdges(linkType);
        draftLink = {
          invalid,
          d: dependencyPath(
            edges.source === "right" ? sourceBar.rawRight : sourceBar.rawLeft,
            sourceTop + ROW_H / 2,
            targetX,
            targetY,
            edges.source,
            targetSide
          ),
        };
      }
    }
  }

  const sourceLabel = linkFrom ? rowTitle(rowById.get(String(linkFrom))) : "";
  const typeLabel = DEPENDENCY_TYPES[linkType];

  if (!startCol) {
    return (
      <div className="db-empty">
        <Icon name="clock" />
        <p>A timeline needs a date property. Add one to place tasks on the axis.</p>
        <button className="btn btn-secondary btn-sm" onClick={openSettings}>
          Add a date property
        </button>
      </div>
    );
  }

  if (!datedRows.length) {
    return (
      <div className="db-empty">
        <Icon name="zap" />
        <p>Add a date to at least one row and it will appear on the timeline.</p>
        <button className="btn btn-secondary btn-sm" onClick={openSettings}>
          Add a date property
        </button>
      </div>
    );
  }

  return (
    <div className="tl">
      <div className="tl-toolbar">
        <div className="tl-nav">
          <button
            className="db-icon-btn tl-icon"
            aria-label="Previous period"
            onClick={() => moveRange(-1)}
          >
            <Icon name="chevron-left" />
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => saveView({ timelineAnchor: todayKey })}>
            Today
          </button>
          <button
            className="db-icon-btn tl-icon"
            aria-label="Next period"
            onClick={() => moveRange(1)}
          >
            <Icon name="chevron-right" />
          </button>
        </div>

        <div className="tl-zooms" role="group" aria-label="Timeline zoom">
          {ZOOMS.map((item) => (
            <button
              key={item.id}
              className="tl-zoom"
              data-active={String(item.id === zoom.id)}
              onClick={() => setZoom(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        {linkMode ? (
          <label className="tl-link-type">
            <span>Type</span>
            <select
              className="select"
              value={linkType}
              aria-label="Dependency type"
              onChange={(event) => setLinkType(event.target.value)}
            >
              {Object.entries(DEPENDENCY_TYPES).map(([id, label]) => (
                <option value={id} key={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <button
          className="btn btn-ghost btn-sm"
          data-active={String(linkMode)}
          aria-pressed={linkMode}
          onClick={() => {
            setLinkMode((value) => !value);
            setLinkFrom(null);
            setSelectedDependencyId(null);
            clearLinkPointer();
          }}
        >
          <Icon name="link" /> Link tasks
        </button>
        <button
          className="btn btn-ghost btn-sm tl-add"
          onClick={() => addRow({ [startCol]: todayKey })}
        >
          + Task
        </button>
      </div>

      {linkMode ? (
        <div className="tl-link-hint" role="status" aria-live="polite">
          <span>
            {linkFrom ? (
              <>
                <strong>{sourceLabel}</strong> selected. Choose a successor. Valid
                targets are highlighted green, invalid targets red. Escape cancels.
              </>
            ) : (
              "Choose the predecessor task, then the successor. Tab to a bar and press Enter to select it. Escape exits."
            )}
          </span>
          <span className="tl-link-hint-type">{typeLabel}</span>
        </div>
      ) : null}

      <div className="tl-scroll" ref={scrollRef} onScroll={syncDragToScroll}>
        <div className="tl-inner" style={{ width: totalWidth }}>
          <div className="tl-head">
            <div className="tl-corner">Task</div>
            <div className="tl-axis" style={{ width: canvasWidth }}>
              {axis.map((cell) => (
                <div
                  className="tl-axis-cell"
                  key={cell.key}
                  style={{ width: cell.width }}
                  title={cell.key}
                >
                  {cell.label}
                </div>
              ))}
            </div>
          </div>

          <div
            className="tl-content"
            style={{ height: layout.height }}
            onPointerMove={handleLinkPointerMove}
            onPointerLeave={clearLinkPointer}
          >
            {layout.nodes.map((node) =>
              node.kind === "group" ? (
                <div
                  className="tl-group"
                  key={node.key}
                  style={{ height: GROUP_H }}
                >
                  <div className="tl-group-label">{node.label}</div>
                  <div className="tl-group-track" style={{ width: canvasWidth }}>
                    {node.label}
                  </div>
                </div>
              ) : (
                <TimelineRow
                  key={node.key}
                  row={node.row}
                  top={node.y}
                  range={previewFor(node.row)}
                  label={rowTitle(node.row)}
                  zoom={zoom}
                  canvasWidth={canvasWidth}
                  geometry={barGeometry(node.row)}
                  dragging={drag && String(drag.rowId) === String(node.row.id)}
                  dragMode={drag && drag.rowId === node.row.id ? drag.mode : ""}
                  linkMode={linkMode}
                  linkFrom={linkFrom}
                  linkType={linkType}
                  linkState={linkStateFor(node.row)}
                  statusColorValue={statusColor(statusCol ? node.row[statusCol] || "" : "")}
                  dependencies={dependencies}
                  revision={revision}
                  onBarPointerDown={beginDrag}
                  onBarPointerMove={updateDrag}
                  onBarPointerUp={finishDrag}
                  onBarPointerCancel={cancelDrag}
                  onBarClick={clickBar}
                  onOpen={() => openRow(node.row)}
                />
              )
            )}

            <svg
              className="tl-links"
              width={canvasWidth}
              height={layout.height}
              style={{ left: LABEL_W, top: 0 }}
              aria-label="Task dependencies"
            >
              <defs>
                <marker
                  id="tl-arrow"
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto"
                >
                  <path d="M0,0 L10,5 L0,10 z" fill="currentColor" />
                </marker>
              </defs>
              {connectors.map((link) => (
                <g key={link.id}>
                  <path
                    className="tl-link-hit"
                    d={link.d}
                    fill="none"
                    stroke="transparent"
                    strokeWidth="14"
                    onClick={() =>
                      setSelectedDependencyId((current) =>
                        current === link.id ? null : link.id
                      )
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelectedDependencyId((current) =>
                          current === link.id ? null : link.id
                        );
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    aria-label={`Inspect dependency ${link.label}`}
                  />
                  <path
                    className={
                      "tl-link-path" + (link.selected ? " is-selected" : "")
                    }
                    d={link.d}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    markerEnd="url(#tl-arrow)"
                  />
                </g>
              ))}
              {draftLink ? (
                <path
                  className={"tl-draft-link" + (draftLink.invalid ? " is-invalid" : "")}
                  d={draftLink.d}
                  fill="none"
                  markerEnd="url(#tl-arrow)"
                />
              ) : null}
            </svg>

            {todayOffset >= 0 && todayOffset < zoom.days ? (
              <div
                className="tl-today-line"
                style={{ left: LABEL_W + todayOffset * zoom.dayWidth }}
                title={"Today · " + todayKey}
              >
                <span>Today</span>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {layout.undated.length ? (
        <div className="tl-unscheduled">
          <span>{layout.undated.length} task{layout.undated.length === 1 ? "" : "s"} without dates</span>
          {layout.undated.slice(0, 6).map((row) => (
            <button key={row.id} className="btn btn-ghost btn-sm" onClick={() => openRow(row)}>
              {cellText(row[titleCol]) || "Untitled"}
            </button>
          ))}
        </div>
      ) : null}

      {dependencies.length ? (
        <div className="tl-deps" aria-label="Task dependencies">
          <span className="tl-deps-title">Dependencies</span>
          {dependencies.map((dep) => {
            const id = dependencyKey(dep);
            const type = dependencyTypeOf(dep);
            const source = rowById.get(String(dep.from));
            const target = rowById.get(String(dep.to));
            const selected = selectedDependencyId === id;
            return (
              <span
                className={"tl-dep-chip" + (selected ? " is-selected" : "")}
                key={id}
              >
                <button
                  type="button"
                  className="tl-dep-select"
                  aria-pressed={selected}
                  onClick={() => selectDependency(dep)}
                >
                  <span className="tl-dep-type" title={DEPENDENCY_TYPES[type]}>
                    {DEPENDENCY_TYPE_SHORT[type]}
                  </span>
                  <span className="tl-dep-names">
                    {rowTitle(source)} → {rowTitle(target)}
                  </span>
                </button>
                <button
                  type="button"
                  className="tl-dep-remove"
                  aria-label={`Remove dependency from ${rowTitle(source)} to ${rowTitle(target)}`}
                  onClick={() => removeDependency(dep)}
                >
                  <Icon name="close" />
                </button>
              </span>
            );
          })}
          {selectedDependency ? (
            <div className="tl-dep-detail" role="status">
              <span>
                <strong>{rowTitle(rowById.get(String(selectedDependency.from)))}</strong>{" "}
                {DEPENDENCY_TYPES[dependencyTypeOf(selectedDependency)]}{" "}
                <strong>{rowTitle(rowById.get(String(selectedDependency.to)))}</strong>
                {" — "}
                {dependencyDescription(dependencyTypeOf(selectedDependency))}
              </span>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => removeDependency(selectedDependency)}
              >
                Delete link
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      <p className="db-note tl-note">
        Dates are inclusive · drag anywhere on a bar to move it · drag either edge
        to resize · snaps to {snapLabel(zoom.id)} · Escape cancels a drag ·
        {endCol ? ` bars span ${startCol} to ${endCol}` : " add an end date column to resize ranges"}.
      </p>
    </div>
  );
}

/* ============================================================
   One timeline row. Memoized so a drag only re-renders the moving bar
   (and the connector layer), not every other task row.
   ============================================================ */
const TimelineRow = React.memo(function TimelineRow({
  row,
  top,
  range,
  label,
  zoom,
  canvasWidth,
  geometry,
  dragging,
  dragMode,
  linkMode,
  linkFrom,
  linkType,
  linkState,
  statusColorValue,
  dependencies,
  revision,
  onBarPointerDown,
  onBarPointerMove,
  onBarPointerUp,
  onBarPointerCancel,
  onBarClick,
  onOpen,
}) {
  const start = fromDayKey(range.startKey);
  const end = fromDayKey(range.endKey);
  const duration = diffDays(range.startKey, range.endKey) + 1;
  const dateLabel =
    range.endKey !== range.startKey
      ? MONTHS[start.getMonth()].slice(0, 3) +
        " " +
        start.getDate() +
        " – " +
        MONTHS[end.getMonth()].slice(0, 3) +
        " " +
        end.getDate()
      : MONTHS[start.getMonth()].slice(0, 3) + " " + start.getDate();

  const linkClass =
    linkState === "source"
      ? " is-link-source"
      : linkState === "valid"
        ? " is-link-valid"
        : linkState === "invalid"
          ? " is-link-invalid"
          : "";

  // Tiny bars at month/week scale are all handle and no grip. Keep them
  // movable; the user can zoom in to resize a task narrower than 28px.
  const canResize = !!geometry && geometry.width >= RESIZE_MIN_WIDTH;
  const hitWidth = geometry ? Math.max(geometry.width, BAR_HIT_MIN) : 0;
  const hitLeft = geometry
    ? Math.max(
        0,
        Math.min(
          canvasWidth - hitWidth,
          geometry.left - (hitWidth - geometry.width) / 2
        )
      )
    : 0;
  const hitOffset = geometry ? hitLeft - geometry.left : 0;
  const moveHandlers = {
    onPointerMove: onBarPointerMove,
    onPointerUp: onBarPointerUp,
    onPointerCancel: onBarPointerCancel,
  };

  return (
    <div className="tl-row" style={{ top, height: ROW_H }}>
      <div className="tl-label">
        <button type="button" className="tl-label-button" onClick={onOpen}>
          <span className="tl-label-title">{label}</span>
          <span className="tl-label-dates">{dateLabel}</span>
        </button>
      </div>
      <div
        className="tl-track"
        style={{
          width: canvasWidth,
          backgroundSize: `${zoom.dayWidth * 7}px 100%`,
        }}
        onPointerMove={onBarPointerMove}
        onPointerUp={onBarPointerUp}
        onPointerCancel={onBarPointerCancel}
      >
        {geometry ? (
          <div
            className={
              "tl-bar" +
              (dragging ? " is-dragging" : "") +
              (linkMode ? " is-linking" : "") +
              linkClass
            }
            style={{ left: geometry.left, width: geometry.width }}
            data-color={statusColorValue}
            data-row-id={row.id}
            data-drag-mode={dragMode || undefined}
            data-duration={duration}
            title={
              label +
              " · " +
              range.startKey +
              " → " +
              range.endKey +
              " · " +
              duration +
              (duration === 1 ? " day" : " days") +
              (canResize
                ? " · drag to move; drag an edge to resize"
                : " · drag to move; zoom in to resize")
            }
            onPointerDown={(event) => onBarPointerDown(event, row, "move")}
            {...moveHandlers}
            onClick={() => onBarClick(row)}
            role="button"
            tabIndex={0}
            aria-disabled={linkState === "invalid"}
            aria-label={
              label +
              ", " +
              dateLabel +
              (linkState === "valid"
                ? ", valid dependency target"
                : linkState === "invalid"
                  ? ", invalid dependency target"
                  : "")
            }
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onBarClick(row);
              }
            }}
          >
            <span
              className="tl-bar-hit"
              style={{ left: hitOffset, width: hitWidth }}
              aria-hidden="true"
            />
            {canResize ? (
              <span
                className="tl-resize tl-resize-left"
                onPointerDown={(event) => {
                  event.stopPropagation();
                  onBarPointerDown(event, row, "left");
                }}
                aria-hidden="true"
              />
            ) : null}
            <span className="tl-bar-label">
              {dragging
                ? `${shortDate(range.startKey)} – ${shortDate(range.endKey)} · ${duration}d`
                : label}
            </span>
            {canResize ? (
              <span
                className="tl-resize tl-resize-right"
                onPointerDown={(event) => {
                  event.stopPropagation();
                  onBarPointerDown(event, row, "right");
                }}
                aria-hidden="true"
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}, function sameTimelineRow(previous, next) {
  if (
    previous.row !== next.row ||
    previous.top !== next.top ||
    previous.label !== next.label ||
    previous.canvasWidth !== next.canvasWidth ||
    previous.zoom !== next.zoom ||
    previous.dragging !== next.dragging ||
    previous.dragMode !== next.dragMode ||
    previous.linkMode !== next.linkMode ||
    previous.linkFrom !== next.linkFrom ||
    previous.linkType !== next.linkType ||
    previous.linkState !== next.linkState ||
    previous.statusColorValue !== next.statusColorValue ||
    previous.dependencies !== next.dependencies ||
    previous.revision !== next.revision
  ) {
    return false;
  }
  if (previous.range.startKey !== next.range.startKey) return false;
  if (previous.range.endKey !== next.range.endKey) return false;

  const a = previous.geometry;
  const b = next.geometry;
  if (!a || !b) return a === b;
  return (
    a.left === b.left &&
    a.width === b.width &&
    a.rawLeft === b.rawLeft &&
    a.rawRight === b.rawRight
  );
});
