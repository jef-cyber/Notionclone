/**
 * Workspace — maps to the canonical `workspaces` collection.
 * The top-level container: it owns pages, data tables, and members.
 */
const { Schema, model } = require("mongoose");

const workspaceSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, "Workspace name is required"],
      trim: true,
      maxlength: 120,
    },
    icon: {
      type: String,
      default: "\u25C8", // \u25C8
      trim: true,
      maxlength: 8,
    },
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
    collection: "workspaces",
  }
);

workspaceSchema.index({ ownerId: 1 });
workspaceSchema.index({ updatedAt: -1 });

module.exports = model("Workspace", workspaceSchema, "workspaces");
