/**
 * Page service — the primary document type.
 *
 * Pages form their own hierarchy via parentPageId (no folders collection), and
 * own both blocks and data tables. Deleting a page cascades to its descendants
 * so the collections never hold orphans.
 */
const { Page, Block, DataTable } = require("../models");
const ApiError = require("../utils/ApiError");
const { assertObjectId } = require("../utils/objectId");
const { requirePageAccess, getMembership, assertNoCycle } = require("./access.service");

/** Every page in a workspace, flat, ordered for tree building on the client. */
async function listByWorkspace(workspaceId, userId, { includeArchived = false } = {}) {
  await getMembership(workspaceId, userId, "viewer");

  const filter = { workspaceId };
  if (!includeArchived) filter.isArchived = false;

  return Page.find(filter)
    .sort({ position: 1, createdAt: 1 })
    .populate("createdBy", "name avatar")
    .lean();
}

/** Direct children of a page. */
async function listChildren(pageId, userId) {
  const { page } = await requirePageAccess(pageId, userId, "viewer");

  return Page.find({ workspaceId: page.workspaceId, parentPageId: pageId, isArchived: false })
    .sort({ position: 1, createdAt: 1 })
    .lean();
}

async function getById(pageId, userId) {
  const { page } = await requirePageAccess(pageId, userId, "viewer");
  return page.toObject ? page.toObject() : page;
}

/**
 * Create a page. When parentPageId is supplied it is validated against the
 * same workspace — a client cannot graft a page onto a parent in a workspace
 * it does not belong to.
 */
async function create(workspaceId, userId, { parentPageId, title, icon, position }) {
  await getMembership(workspaceId, userId, "member");

  let parent = null;
  if (parentPageId) {
    assertObjectId(parentPageId, "parentPageId");
    parent = await Page.findById(parentPageId);
    if (!parent) throw ApiError.notFound("Parent page not found");
    if (String(parent.workspaceId) !== String(workspaceId)) {
      throw ApiError.forbidden("That parent page belongs to a different workspace");
    }
  }

  let nextPosition = position;
  if (nextPosition === undefined || nextPosition === null) {
    const last = await Page.findOne({
      workspaceId,
      parentPageId: parent ? parent._id : null,
    })
      .sort({ position: -1 })
      .select("position")
      .lean();
    nextPosition = last ? last.position + 1 : 0;
  }

  const page = await Page.create({
    workspaceId,
    parentPageId: parent ? parent._id : null,
    title: title || "",
    icon: icon || "\uD83D\uDCDD",
    createdBy: userId,
    position: nextPosition,
  });

  return page.toObject();
}

const PAGE_FIELDS = ["title", "icon", "cover", "isFavorite", "isArchived", "position"];

async function update(pageId, patch, userId) {
  const { page } = await requirePageAccess(pageId, userId, "member");

  const allowed = {};
  PAGE_FIELDS.forEach((field) => {
    if (patch[field] !== undefined) allowed[field] = patch[field];
  });

  // Re-parenting is handled by move() so ordering and cycle checks stay together.
  const wantsMove =
    patch.parentPageId !== undefined && String(patch.parentPageId || "") !== String(page.parentPageId || "");

  if (Object.keys(allowed).length === 0 && !wantsMove) {
    throw ApiError.badRequest("Nothing to update");
  }

  if (Object.keys(allowed).length) Object.assign(page, allowed);
  await page.save();

  if (wantsMove) {
    await move(pageId, patch.parentPageId, patch.position, userId);
  }

  return page.toObject();
}

/**
 * Re-parent a page and/or reposition it among its siblings.
 * Rejects moves that would create a cycle.
 */
async function move(pageId, parentPageId, position, userId) {
  const { page } = await requirePageAccess(pageId, userId, "member");

  let newParent = null;
  if (parentPageId) {
    assertObjectId(parentPageId, "parentPageId");
    await assertNoCycle(pageId, parentPageId);

    newParent = await Page.findById(parentPageId);
    if (!newParent) throw ApiError.notFound("Target parent page not found");
    if (String(newParent.workspaceId) !== String(page.workspaceId)) {
      throw ApiError.forbidden("You cannot move a page into a different workspace");
    }
  }

  let nextPosition = position;
  if (nextPosition === undefined || nextPosition === null) {
    const last = await Page.findOne({
      workspaceId: page.workspaceId,
      parentPageId: newParent ? newParent._id : null,
      _id: { $ne: page._id },
    })
      .sort({ position: -1 })
      .select("position")
      .lean();
    nextPosition = last ? last.position + 1 : 0;
  }

  page.parentPageId = newParent ? newParent._id : null;
  page.position = nextPosition;
  await page.save();

  return page.toObject();
}

/** Collect a page and all of its descendants. */
async function collectSubtree(pageId) {
  // Load the whole workspace once; workspace sizes here are small and this
  // keeps the tree walk to a single round trip.
  const root = await Page.findById(pageId).select("workspaceId").lean();
  if (!root) return [];

  const all = await Page.find({ workspaceId: root.workspaceId })
    .select("_id parentPageId")
    .lean();
  const childrenOf = new Map();
  all.forEach((p) => {
    const key = String(p.parentPageId || "root");
    if (!childrenOf.has(key)) childrenOf.set(key, []);
    childrenOf.get(key).push(p._id);
  });

  const collected = [];
  const walk = (id) => {
    collected.push(id);
    (childrenOf.get(String(id)) || []).forEach(walk);
  };
  walk(pageId);
  return collected;
}

/** Delete a page, its descendants, their blocks, and their data tables. */
async function remove(pageId, userId) {
  const { page } = await requirePageAccess(pageId, userId, "admin");

  const subtree = await collectSubtree(page._id);

  await Promise.all([
    Block.deleteMany({ pageId: { $in: subtree } }),
    DataTable.deleteMany({ pageId: { $in: subtree } }),
  ]);
  await Page.deleteMany({ _id: { $in: subtree } });

  return { deleted: true, pageId, removedCount: subtree.length };
}

/** Duplicate a page, copying all of its blocks (nested ones included). */
async function duplicate(pageId, userId) {
  const { page } = await requirePageAccess(pageId, userId, "member");

  const last = await Page.findOne({ workspaceId: page.workspaceId, parentPageId: page.parentPageId })
    .sort({ position: -1 })
    .select("position")
    .lean();

  const copy = await Page.create({
    workspaceId: page.workspaceId,
    parentPageId: page.parentPageId,
    title: page.title ? `${page.title} (copy)` : "",
    icon: page.icon,
    cover: page.cover,
    createdBy: userId,
    position: last ? last.position + 1 : 0,
  });

  const blocks = await Block.find({ pageId: page._id }).sort({ position: 1 }).lean();

  if (blocks.length) {
    // Two passes: create the copies first, then repoint parentBlockIds using
    // the old -> new id map so nested blocks keep their structure.
    const inserted = await Block.insertMany(
      blocks.map((b) => ({
        pageId: copy._id,
        parentBlockId: null,
        type: b.type,
        content: b.content,
        properties: b.properties,
        position: b.position,
        createdBy: userId,
      }))
    );

    const idMap = new Map(blocks.map((old, i) => [String(old._id), inserted[i]._id]));
    await Promise.all(
      inserted.map((created, i) => {
        const originalParent = blocks[i].parentBlockId;
        if (!originalParent || !idMap.has(String(originalParent))) return null;
        return Block.updateOne(
          { _id: created._id },
          { $set: { parentBlockId: idMap.get(String(originalParent)) } }
        );
      })
    );
  }

  return copy.toObject();
}

/** Free-text search across page titles inside a workspace. */
async function search(workspaceId, userId, query) {
  await getMembership(workspaceId, userId, "viewer");

  const q = String(query || "").trim();
  if (!q) return [];

  return Page.find({
    workspaceId,
    isArchived: false,
    title: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" },
  })
    .sort({ updatedAt: -1 })
    .limit(50)
    .lean();
}

module.exports = {
  listByWorkspace,
  listChildren,
  getById,
  create,
  update,
  move,
  remove,
  duplicate,
  search,
};
