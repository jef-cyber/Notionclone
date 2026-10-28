/* ============================================================
   Shared database helpers.

   Every data-table view (table, board, list, gallery, calendar,
   timeline) reads the same `properties` and `rows`. Keep the
   column/date logic here so the views cannot drift apart.
   ============================================================ */

export const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export const PROPERTY_TYPE_LABELS = {
  title: "Title",
  text: "Text",
  number: "Number",
  select: "Select",
  multi_select: "Multi-select",
  checkbox: "Checkbox",
  date: "Date",
  url: "URL",
  email: "Email",
  person: "Person",
  relation: "Relation",
};

export function columns(dataTable) {
  return Object.keys(dataTable.properties || {});
}

export function titleColumn(dataTable) {
  const props = dataTable.properties || {};
  const found = columns(dataTable).find((c) => props[c].type === "title");
  return found || columns(dataTable)[0] || "Name";
}

export function columnOfType(dataTable, type) {
  const props = dataTable.properties || {};
  return columns(dataTable).find((c) => props[c].type === type) || null;
}

export function groupColumn(dataTable) {
  const props = dataTable.properties || {};
  const names = columns(dataTable);
  const named = names.find(
    (c) => props[c].type === "select" && /status|stage|state/i.test(c)
  );
  return named || columnOfType(dataTable, "select") || titleColumn(dataTable);
}

export function statusColumnOf(dataTable) {
  const props = dataTable.properties || {};
  return columns(dataTable).find((c) => (props[c] || {}).type === "select") || null;
}

export function optionsFor(dataTable, column) {
  const spec = (dataTable.properties || {})[column];
  if (spec && Array.isArray(spec.options) && spec.options.length) {
    return spec.options;
  }
  const seen = [];
  (dataTable.rows || []).forEach((row) => {
    const value = row[column];
    if (value && seen.indexOf(value) === -1) seen.push(value);
  });
  return seen.length ? seen : ["None"];
}

export function toDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

/** yyyy-mm-dd in local time (toISOString would shift the day). */
export function dayKey(date) {
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return date.getFullYear() + "-" + m + "-" + d;
}

export function fromDayKey(key) {
  const parts = String(key || "").split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

/** Stable integer day index; avoids DST bugs when subtracting dates. */
export function dayNumber(value) {
  const d = value instanceof Date ? value : fromDayKey(value);
  if (!d || isNaN(d.getTime())) return null;
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
}

export function diffDays(fromKey, toKey) {
  return dayNumber(toKey) - dayNumber(fromKey);
}

export function addDays(key, amount) {
  const d = fromDayKey(key);
  if (!d) return key;
  d.setDate(d.getDate() + amount);
  return dayKey(d);
}

/** Add calendar months without letting Jan 31 + 1 month overflow into March. */
export function addMonthsClamped(key, amount) {
  const d = fromDayKey(key);
  if (!d || !amount) return d ? dayKey(d) : key;
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + amount);
  const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, monthEnd));
  return dayKey(d);
}

/** Average month length used only to convert a pixel delta into month steps. */
const DAYS_PER_MONTH = 30.4375;

/**
 * Snap a proposed drag/resize to the active timeline scale.
 * `mode` is "move" | "left" | "right". The returned range is inclusive.
 *
 * Moving preserves the original duration in days. Resizing keeps the opposite
 * edge fixed and never lets a task collapse below one inclusive day.
 */
export function snapDragRange(mode, startKey, endKey, deltaDays, zoomId) {
  const duration = Math.max(0, diffDays(startKey, endKey));
  const monthsPerStep = zoomId === "quarter" ? 3 : zoomId === "month" ? 1 : 0;

  if (monthsPerStep) {
    const months =
      Math.round(deltaDays / (DAYS_PER_MONTH * monthsPerStep)) * monthsPerStep;

    if (mode === "move") {
      const nextStart = addMonthsClamped(startKey, months);
      return { startKey: nextStart, endKey: addDays(nextStart, duration) };
    }
    if (mode === "left") {
      let nextStart = addMonthsClamped(startKey, months);
      if (diffDays(nextStart, endKey) < 0) nextStart = endKey;
      return { startKey: nextStart, endKey };
    }
    let nextEnd = addMonthsClamped(endKey, months);
    if (diffDays(startKey, nextEnd) < 0) nextEnd = startKey;
    return { startKey, endKey: nextEnd };
  }

  const step = zoomId === "week" ? 7 : 1;
  const days = Math.round(deltaDays / step) * step;

  if (mode === "move") {
    const nextStart = addDays(startKey, days);
    return { startKey: nextStart, endKey: addDays(nextStart, duration) };
  }
  if (mode === "left") {
    let nextStart = addDays(startKey, days);
    if (diffDays(nextStart, endKey) < 0) nextStart = endKey;
    return { startKey: nextStart, endKey };
  }
  let nextEnd = addDays(endKey, days);
  if (diffDays(startKey, nextEnd) < 0) nextEnd = startKey;
  return { startKey, endKey: nextEnd };
}

export function snapLabel(zoomId) {
  if (zoomId === "week") return "1 week";
  if (zoomId === "month") return "1 month";
  if (zoomId === "quarter") return "1 quarter";
  return "1 day";
}

export function cellText(value) {
  if (value === null || value === undefined || value === "") return "";
  if (Array.isArray(value)) return value.join(", ");
  if (value instanceof Date) return dayKey(value);
  return String(value);
}

/* ---------- status colours ---------- */
const STATUS_COLORS = ["", "blue", "green", "yellow", "red", "purple", "pink", "orange", "gray"];

const STATUS_KEYWORDS = [
  { re: /done|complete|shipped|finished|closed|resolved|success/i, color: "green" },
  { re: /in.?progress|doing|active|started|ongoing|current|review/i, color: "yellow" },
  { re: /todo|to.?do|backlog|not.?started|pending|open|new|plan/i, color: "gray" },
  { re: /block|stuck|hold|paused|fail|error|cancel|reject|overdue|urgent|critical/i, color: "red" },
  { re: /high|important/i, color: "orange" },
  { re: /medium|normal/i, color: "blue" },
  { re: /low|minor/i, color: "purple" },
];

export function statusColor(value) {
  const v = cellText(value).trim();
  if (!v) return "";
  for (let i = 0; i < STATUS_KEYWORDS.length; i += 1) {
    if (STATUS_KEYWORDS[i].re.test(v)) return STATUS_KEYWORDS[i].color;
  }
  let hash = 0;
  for (let i = 0; i < v.length; i += 1) hash = (hash * 31 + v.charCodeAt(i)) >>> 0;
  return STATUS_COLORS[(hash % (STATUS_COLORS.length - 1)) + 1];
}

/** The date column used as a task start date. */
export function startDateColumn(dataTable) {
  const props = dataTable.properties || {};
  const dateCols = columns(dataTable).filter((c) => (props[c] || {}).type === "date");
  return dateCols.find((c) => /start|begin|from/i.test(c)) || dateCols[0] || null;
}

/** The optional date column used as a task end date. */
export function endDateColumn(dataTable, startColumn) {
  const props = dataTable.properties || {};
  const dateCols = columns(dataTable).filter((c) => (props[c] || {}).type === "date");
  return (
    dateCols.find(
      (c) => c !== startColumn && /end|due|finish|until|complete|to$/i.test(c)
    ) ||
    dateCols.find((c) => c !== startColumn) ||
    null
  );
}

/** Inclusive start/end keys for a row. A missing end means a one-day task. */
export function rowDates(dataTable, row, startCol, endCol) {
  const start = toDate(row[startCol]);
  if (!start) return null;
  const startKey = dayKey(start);
  const end = endCol ? toDate(row[endCol]) : null;
  let endKey = end ? dayKey(end) : startKey;
  if (dayNumber(endKey) < dayNumber(startKey)) endKey = startKey;
  return { startKey, endKey };
}

/* ---------- timeline dependencies ---------- */
export const DEPENDENCY_TYPES = {
  "finish-to-start": "Finish → start",
  "start-to-start": "Start → start",
  "finish-to-finish": "Finish → finish",
  "start-to-finish": "Start → finish",
};

export const DEPENDENCY_TYPE_SHORT = {
  "finish-to-start": "FS",
  "start-to-start": "SS",
  "finish-to-finish": "FF",
  "start-to-finish": "SF",
};

export function dependencyTypeOf(dep) {
  return dep && DEPENDENCY_TYPES[dep.type] ? dep.type : "finish-to-start";
}

export function dependencyExists(dependencies, from, to) {
  return (dependencies || []).some(
    (dep) => String(dep.from) === String(from) && String(dep.to) === String(to)
  );
}

/**
 * Validate the dates of an existing dependency. The predecessor/successor are
 * explicit, so moving either task can be checked before it is saved.
 *
 * FS is strict (the successor must start after the predecessor ends). SS and
 * FF permit the same day because they say "cannot start/finish before".
 */
export function dependencyScheduleError(type, sourceRange, targetRange) {
  if (!sourceRange || !targetRange) return "";
  const key = DEPENDENCY_TYPES[type] ? type : "finish-to-start";
  const sourceStart = dayNumber(sourceRange.startKey);
  const sourceEnd = dayNumber(sourceRange.endKey);
  const targetStart = dayNumber(targetRange.startKey);
  const targetEnd = dayNumber(targetRange.endKey);

  if (key === "finish-to-start" && !(targetStart > sourceEnd)) {
    return "Finish-to-start requires the successor to start after the predecessor ends";
  }
  if (key === "start-to-start" && !(targetStart >= sourceStart)) {
    return "Start-to-start requires the successor to start on or after the predecessor starts";
  }
  if (key === "finish-to-finish" && !(targetEnd >= sourceEnd)) {
    return "Finish-to-finish requires the successor to finish on or after the predecessor finishes";
  }
  if (key === "start-to-finish" && !(targetEnd >= sourceStart)) {
    return "Start-to-finish requires the successor to finish on or after the predecessor starts";
  }
  return "";
}

/** Human-readable scheduling policy for the dependency editor. */
export function dependencyDescription(type) {
  const key = DEPENDENCY_TYPES[type] ? type : "finish-to-start";
  if (key === "start-to-start") {
    return "The successor cannot start before the predecessor starts.";
  }
  if (key === "finish-to-finish") {
    return "The successor cannot finish before the predecessor finishes.";
  }
  if (key === "start-to-finish") {
    return "The successor cannot finish before the predecessor starts.";
  }
  return "The predecessor must finish before the successor starts.";
}

/** Which edge of each bar a connector should attach to. */
export function dependencyEdges(type) {
  const key = DEPENDENCY_TYPES[type] ? type : "finish-to-start";
  return {
    source: key.indexOf("finish") === 0 ? "right" : "left",
    target: key.indexOf("finish", key.indexOf("-to-") + 4) !== -1 ? "right" : "left",
  };
}

/** True when adding from -> to would close an existing to -> ... -> from path. */
export function wouldCreateCycle(dependencies, from, to) {
  if (String(from) === String(to)) return true;
  const graph = new Map();
  (dependencies || []).forEach((dep) => {
    const key = String(dep.from);
    if (!graph.has(key)) graph.set(key, []);
    graph.get(key).push(String(dep.to));
  });
  const seen = new Set();
  const stack = [String(to)];
  while (stack.length) {
    const current = stack.pop();
    if (current === String(from)) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    (graph.get(current) || []).forEach((next) => stack.push(next));
  }
  return false;
}

export function makeDependency(from, to, type = "finish-to-start") {
  return {
    id: `dep_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    from: String(from),
    to: String(to),
    type,
  };
}

