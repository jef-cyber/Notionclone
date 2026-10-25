/* Shared block vocabulary: the slash menu and the block type menu use the
   same list, exactly like the original editor. */

export const SLASH_ITEMS = [
  { type: "text", glyph: "T", label: "Text", desc: "Start writing with plain text" },
  { type: "heading1", glyph: "H1", label: "Heading 1", desc: "Big section heading" },
  { type: "heading2", glyph: "H2", label: "Heading 2", desc: "Medium section heading" },
  { type: "heading3", glyph: "H3", label: "Heading 3", desc: "Small section heading" },
  { type: "bulleted", glyph: "\u2022", label: "Bulleted list", desc: "Create a simple bulleted list" },
  { type: "numbered", glyph: "1.", label: "Numbered list", desc: "Create a list with numbering" },
  { type: "todo", glyph: "\u2611", label: "To-do list", desc: "Track tasks with checkboxes" },
  { type: "quote", glyph: "\u275D", label: "Quote", desc: "Capture a quote or highlight" },
  { type: "code", glyph: "</>", label: "Code", desc: "Capture a code snippet" },
  { type: "divider", glyph: "\u2014", label: "Divider", desc: "Visually divide blocks" },
  { type: "callout", glyph: "\uD83D\uDCA1", label: "Callout", desc: "Make writing stand out" },
  { type: "image", glyph: "\uD83D\uDDBC\uFE0F", label: "Image", desc: "Upload or embed an image" },
  { type: "database", glyph: "\u229E", label: "Database", desc: "Table, board, calendar or roadmap" },
  { type: "toggle", glyph: "\u25B8", label: "Toggle", desc: "Collapsible content" },
];

export const COMMON_ICONS = [
  "\uD83D\uDCDD", "\u2728", "\uD83D\uDCC6", "\uD83D\uDE80", "\uD83C\uDFAF", "\uD83D\uDCC5",
  "\uD83C\uDF93", "\uD83D\uDDA5\uFE0F", "\uD83D\uDCBE", "\uD83D\uDCC1", "\uD83D\uDCDA",
  "\uD83C\uDF10", "\uD83D\uDCA1", "\uD83D\uDD25", "\u2705", "\u23F0", "\uD83C\uDF89",
  "\uD83C\uDF38", "\uD83D\uDCE0", "\uD83D\uDCC8", "\uD83D\uDCC9", "\uD83E\uDD16",
];

export function slashItems(query) {
  if (!query) return SLASH_ITEMS;
  const q = query.toLowerCase();
  return SLASH_ITEMS.filter(
    (it) =>
      it.label.toLowerCase().includes(q) ||
      it.type.toLowerCase().includes(q) ||
      it.desc.toLowerCase().includes(q)
  );
}
