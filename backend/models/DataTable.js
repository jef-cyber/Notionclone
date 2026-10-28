/**
 * DataTable — maps to the canonical `dataTable` collection.
 *
 * The single generic Notion-style database. Every "different" database shape
 * is a DataTable plus a view configuration, never a new collection:
 *
 *   Roadmap     = DataTable with date columns, rendered as a timeline
 *   Kanban      = DataTable with a select column, grouped into board columns
 *   Calendar    = DataTable with a date column, rendered as a month grid
 *   Task list   = DataTable with Status / Priority / Assignee / Due Date
 *
 * `properties` holds flexible column definitions keyed by column name; `rows`
 * holds flat `{ [columnName]: value }` maps. A roadmap, a kanban board and a
 * table view of the same DataTable read the exact same rows.
 *
 * Note the collection name is singular and camelCase; Mongoose would otherwise
 * pluralize it to "datatables", so the name is pinned.
 */
const { Schema, model } = require("mongoose");

/** A row is an open map so any declared property can be stored on it. */
const rowSchema = new Schema({}, { strict: false, _id: false });

/** A persisted finish-to-start (or other) task dependency. */
const dependencySchema = new Schema(
  {
    id: { type: String, required: true },
    from: { type: String, required: true },
    to: { type: String, required: true },
    type: { type: String, default: "finish-to-start" },
  },
  { _id: false }
);

const dataTableSchema = new Schema(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
    },
    /** The page this database is embedded in. */
    pageId: {
      type: Schema.Types.ObjectId,
      ref: "Page",
      required: true,
    },
    name: {
      type: String,
      required: [true, "Data table name is required"],
      trim: true,
      maxlength: 200,
    },
    description: {
      type: String,
      default: "",
      trim: true,
      maxlength: 2000,
    },
    /**
     * { "Status": { type: "select", options: ["Todo", "In Progress", "Done"] } }
     */
    properties: {
      type: Schema.Types.Mixed,
      default: () => ({}),
    },
    /**
     * Which view is shown by default. "roadmap" is kept as a legacy alias for
     * "timeline" so databases created before the timeline upgrade keep opening.
     */
    defaultView: {
      type: String,
      enum: ["table", "board", "list", "gallery", "calendar", "timeline", "roadmap"],
      default: "table",
    },
    /** Per-view configuration (group-by column, timeline zoom/anchor...). */
    viewConfig: {
      type: Schema.Types.Mixed,
      default: () => ({}),
    },
    /** [{ id, from: "row_a", to: "row_b", type: "finish-to-start" }] */
    dependencies: {
      type: [dependencySchema],
      default: () => [],
    },
    /** [{ id: "row_1", Task: "Ship auth", Status: "Done" }] */
    rows: {
      type: [rowSchema],
      default: () => [],
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
    collection: "dataTable",
  }
);

dataTableSchema.index({ workspaceId: 1 });
dataTableSchema.index({ pageId: 1 });
dataTableSchema.index({ createdBy: 1 });

module.exports = model("DataTable", dataTableSchema, "dataTable");
