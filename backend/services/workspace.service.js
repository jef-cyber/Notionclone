/**
 * Workspace service — workspaces and their membership records.
 */
const { Workspace, WorkspaceMember, User } = require("../models");
const ApiError = require("../utils/ApiError");
const { assertObjectId } = require("../utils/objectId");
const { ROLES } = require("../config/constants");
const { getMembership } = require("./access.service");

/** Every workspace the user belongs to, with their role attached. */
async function listForUser(userId) {
  const memberships = await WorkspaceMember.find({ userId }).sort({ createdAt: -1 }).lean();
  if (!memberships.length) return [];

  const workspaces = await Workspace.find({
    _id: { $in: memberships.map((m) => m.workspaceId) },
  })
    .populate("ownerId", "name email avatar")
    .lean();

  const byId = new Map(workspaces.map((w) => [String(w._id), w]));

  return memberships
    .map((m) => {
      const workspace = byId.get(String(m.workspaceId));
      if (!workspace) return null;
      return { ...workspace, role: m.role };
    })
    .filter(Boolean);
}

/**
 * Create a workspace and enrol the creator as owner. The membership record is
 * required for the workspace to be usable, so a failure there must not leave
 * an orphan workspace behind.
 */
async function createForUser(userId, { name, icon }) {
  const workspace = await Workspace.create({
    name,
    icon: icon || "\u25C8",
    ownerId: userId,
  });

  try {
    await WorkspaceMember.create({ workspaceId: workspace._id, userId, role: "owner" });
  } catch (err) {
    await Workspace.deleteOne({ _id: workspace._id });
    throw err;
  }

  return { ...workspace.toObject(), role: "owner" };
}

async function getById(workspaceId) {
  assertObjectId(workspaceId, "workspaceId");
  const workspace = await Workspace.findById(workspaceId)
    .populate("ownerId", "name email avatar")
    .lean();
  if (!workspace) throw ApiError.notFound("Workspace not found");
  return workspace;
}

async function update(workspaceId, patch, userId) {
  await getMembership(workspaceId, userId, "admin");

  const allowed = {};
  if (patch.name !== undefined) allowed.name = patch.name;
  if (patch.icon !== undefined) allowed.icon = patch.icon;
  if (Object.keys(allowed).length === 0) {
    throw ApiError.badRequest("Nothing to update");
  }

  const workspace = await Workspace.findByIdAndUpdate(workspaceId, allowed, {
    new: true,
    runValidators: true,
  });
  if (!workspace) throw ApiError.notFound("Workspace not found");
  return workspace.toObject();
}

/** Only the owner can delete a workspace. Cascades to everything inside it. */
async function remove(workspaceId, userId) {
  const membership = await getMembership(workspaceId, userId, "owner");

  const { Page, Block, DataTable } = require("../models");
  const pages = await Page.find({ workspaceId }).select("_id").lean();
  const pageIds = pages.map((p) => p._id);

  await Promise.all([
    Block.deleteMany({ pageId: { $in: pageIds } }),
    DataTable.deleteMany({ workspaceId }),
    Page.deleteMany({ workspaceId }),
    WorkspaceMember.deleteMany({ workspaceId }),
  ]);
  await Workspace.deleteOne({ _id: workspaceId });

  return { deleted: true, workspaceId, removedPages: pageIds.length, role: membership.role };
}

/* ---------------- members ---------------- */

async function listMembers(workspaceId, userId) {
  await getMembership(workspaceId, userId, "viewer");

  const members = await WorkspaceMember.find({ workspaceId })
    .populate("userId", "name email avatar")
    .sort({ createdAt: 1 })
    .lean();

  return members.map((m) => ({
    _id: m._id,
    workspaceId: m.workspaceId,
    role: m.role,
    createdAt: m.createdAt,
    user: m.userId,
  }));
}

/** Invite an existing user by email. Creates the join record only. */
async function addMember(workspaceId, { email, role }, actorId) {
  await getMembership(workspaceId, actorId, "admin");

  const cleanEmail = String(email || "").trim().toLowerCase();
  if (!cleanEmail) throw ApiError.badRequest("Email is required");

  const targetRole = role || "member";
  if (!ROLES.includes(targetRole)) {
    throw ApiError.badRequest(`Role must be one of: ${ROLES.join(", ")}`);
  }
  if (targetRole === "owner") {
    throw ApiError.badRequest("Ownership cannot be granted through an invite");
  }

  const user = await User.findOne({ email: cleanEmail });
  if (!user) throw ApiError.notFound(`No account found for ${cleanEmail}`);

  const existing = await WorkspaceMember.findOne({ workspaceId, userId: user._id });
  if (existing) {
    throw ApiError.conflict("That person is already a member of this workspace");
  }

  const member = await WorkspaceMember.create({
    workspaceId,
    userId: user._id,
    role: targetRole,
  });

  return { _id: member._id, workspaceId, role: member.role, user: user.toJSON() };
}

async function updateMemberRole(workspaceId, memberId, role, actorId) {
  await getMembership(workspaceId, actorId, "admin");
  assertObjectId(memberId, "memberId");

  if (!ROLES.includes(role)) {
    throw ApiError.badRequest(`Role must be one of: ${ROLES.join(", ")}`);
  }
  if (role === "owner") {
    throw ApiError.badRequest("Ownership cannot be assigned through this endpoint");
  }

  const member = await WorkspaceMember.findById(memberId);
  if (!member || String(member.workspaceId) !== String(workspaceId)) {
    throw ApiError.notFound("Member not found in this workspace");
  }
  if (member.role === "owner") {
    throw ApiError.forbidden("The workspace owner's role cannot be changed");
  }
  if (String(member.userId) === String(actorId) && !isManager(role)) {
    // Guard against an admin demoting themselves out of the workspace.
    const admins = await WorkspaceMember.countDocuments({ workspaceId, role: "admin" });
    if (admins <= 1) throw ApiError.badRequest("You cannot remove your own admin access");
  }

  member.role = role;
  await member.save();

  const user = await User.findById(member.userId).select("name email avatar").lean();
  return { _id: member._id, workspaceId, role: member.role, user };
}

async function removeMember(workspaceId, memberId, actorId) {
  await getMembership(workspaceId, actorId, "admin");
  assertObjectId(memberId, "memberId");

  const member = await WorkspaceMember.findById(memberId);
  if (!member || String(member.workspaceId) !== String(workspaceId)) {
    throw ApiError.notFound("Member not found in this workspace");
  }
  if (member.role === "owner") {
    throw ApiError.forbidden("The workspace owner cannot be removed");
  }
  if (String(member.userId) === String(actorId) && member.role === "admin") {
    // Don't let the last admin lock everyone out of the workspace.
    const admins = await WorkspaceMember.countDocuments({ workspaceId, role: "admin" });
    if (admins <= 1) {
      throw ApiError.badRequest("You cannot remove your own admin access");
    }
  }

  await member.deleteOne();
  return { deleted: true, memberId };
}

module.exports = {
  listForUser,
  createForUser,
  getById,
  update,
  remove,
  listMembers,
  addMember,
  updateMemberRole,
  removeMember,
};
