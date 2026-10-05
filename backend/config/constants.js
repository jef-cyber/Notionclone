/**
 * Shared constants.
 *
 * ROLES are ordered from most to least privileged; the authorization helpers in
 * middleware/auth.middleware.js compare against this ranking.
 */

const ROLES = ["owner", "admin", "member", "viewer"];

/** Higher number = more power. Used for "at least this role" checks. */
const ROLE_RANK = {
  owner: 4,
  admin: 3,
  member: 2,
  viewer: 1,
};

/**
 * The six canonical MongoDB collections. Models are pinned to these exact
 * names so Mongoose's pluralizer can never rename them.
 */
const COLLECTIONS = {
  users: "users",
  workspaces: "workspaces",
  workspaceMembers: "workspaceMembers",
  pages: "pages",
  blocks: "blocks",
  dataTable: "dataTable",
};

/**
 * Block types the editor knows how to render. The schema itself is
 * intentionally open (type is a free-form string) so new block types can be
 * added on the frontend without a migration — this list only drives the
 * slash-command menu.
 */
const BLOCK_TYPES = [
  "paragraph",
  "heading1",
  "heading2",
  "heading3",
  "bulleted_list",
  "numbered_list",
  "todo",
  "quote",
  "callout",
  "divider",
  "code",
  "image",
  "video",
  "link",
  "bookmark",
  "child_page",
  "database",
  // Legacy aliases kept so existing editor content keeps rendering.
  "text",
  "bulleted",
  "numbered",
  "toggle",
  "table",
];

/** Property types a DataTable column can declare. */
const PROPERTY_TYPES = [
  "title",
  "text",
  "number",
  "select",
  "multi_select",
  "checkbox",
  "date",
  "url",
  "email",
  "person",
  "relation",
];

module.exports = { ROLES, ROLE_RANK, COLLECTIONS, BLOCK_TYPES, PROPERTY_TYPES };
