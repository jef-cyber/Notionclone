/**
 * Page — maps to the canonical `pages` collection.
 *
 * Pages form their own hierarchy through `parentPageId`. There is no separate
 * folders collection: a folder is simply a page that has children.
 *   parentPageId: null  -> top-level page inside the workspace
 *   parentPageId: <id>  -> nested page
 */
const { Schema, model } = require("mongoose");

const pageSchema = new Schema(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
    },
    parentPageId: {
      type: Schema.Types.ObjectId,
      ref: "Page",
      default: null,
    },
    title: {
      type: String,
      default: "",
      trim: true,
      maxlength: 300,
    },
    icon: {
      type: String,
      default: "\uD83D\uDCDD", // \uD83D\uDCDD
      trim: true,
      maxlength: 16,
    },
    cover: {
      type: String,
      default: "",
      trim: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    /** Ordering among siblings that share the same parentPageId. */
    position: {
      type: Number,
      default: 0,
    },
    isArchived: {
      type: Boolean,
      default: false,
    },
    isFavorite: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    collection: "pages",
  }
);

pageSchema.index({ workspaceId: 1 });
pageSchema.index({ parentPageId: 1 });
pageSchema.index({ workspaceId: 1, parentPageId: 1 });
pageSchema.index({ createdBy: 1 });
pageSchema.index({ workspaceId: 1, isFavorite: 1 });
pageSchema.index({ title: "text" });

module.exports = model("Page", pageSchema, "pages");
