/**
 * WorkspaceMember — maps to the canonical `workspaceMembers` collection.
 * The user <-> workspace join. Role drives every authorization decision.
 *
 * Note the collection name is camelCase and irregular: Mongoose's default
 * pluralizer would produce "workspacemembers", so the name is pinned.
 */
const { Schema, model } = require("mongoose");
const { ROLES } = require("../config/constants");

const workspaceMemberSchema = new Schema(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    role: {
      type: String,
      enum: ROLES,
      default: "member",
    },
  },
  {
    timestamps: true,
    collection: "workspaceMembers",
  }
);

/** A user can only hold one role per workspace. */
workspaceMemberSchema.index({ workspaceId: 1, userId: 1 }, { unique: true });
workspaceMemberSchema.index({ userId: 1 });

module.exports = model("WorkspaceMember", workspaceMemberSchema, "workspaceMembers");
