/**
 * Block — maps to the canonical `blocks` collection.
 *
 * One collection for every content type. Paragraphs, headings, to-dos, lists,
 * quotes, code, dividers, images and databases are all rows here distinguished
 * by `type` — there are no per-type collections.
 *
 * `content` and `properties` are intentionally Mixed so the block schema stays
 * extensible: a new block type can carry whatever payload it needs without a
 * migration.
 *
 *   content:    { text: "Finish the project" }            // primary payload
 *   properties: { checked: false, icon: "\uD83D\uDCA1" }  // per-type extras
 */
const { Schema, model } = require("mongoose");

const blockSchema = new Schema(
  {
    pageId: {
      type: Schema.Types.ObjectId,
      ref: "Page",
      required: true,
    },
    /** Blocks may nest (toggle lists). null means top-level within the page. */
    parentBlockId: {
      type: Schema.Types.ObjectId,
      ref: "Block",
      default: null,
    },
    /**
     * Free-form on purpose: the frontend renderer owns the type list and can
     * add new types without a schema change.
     */
    type: {
      type: String,
      required: true,
      default: "paragraph",
      trim: true,
      maxlength: 40,
    },
    content: {
      type: Schema.Types.Mixed,
      default: () => ({}),
    },
    properties: {
      type: Schema.Types.Mixed,
      default: () => ({}),
    },
    /** Ordering among blocks that share the same parentBlockId. */
    position: {
      type: Number,
      default: 0,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
    collection: "blocks",
  }
);

blockSchema.index({ pageId: 1 });
blockSchema.index({ pageId: 1, position: 1 });
blockSchema.index({ parentBlockId: 1 });
blockSchema.index({ createdBy: 1 });
/** Full-text search over block text, used by the global search endpoint. */
blockSchema.index({ "content.text": "text" });

module.exports = model("Block", blockSchema, "blocks");
