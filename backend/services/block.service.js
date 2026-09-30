/**
 * Block service — content inside a page.
 *
 * All block types live in the one `blocks` collection, ordered by `position`.
 * Authorization always flows through the owning page, so a block id alone can
 * never be used to reach a workspace the caller is not a member of.
 */
const { Block } = require("../models");
const ApiError = require("../utils/ApiError");
const { assertObjectId } = require("../utils/objectId");
const { requirePageAccess, requireBlockAccess } = require("./access.service");

/** Blocks of a page, in render order. Nested blocks come back too. */
async function listByPage(pageId, userId) {
  const { page } = await requirePageAccess(pageId, userId, "viewer");

  return Block.find({ pageId: page._id })
    .sort({ position: 1, createdAt: 1 })
    .populate("createdBy", "name avatar")
    .lean();
}

async function getById(blockId, userId) {
  const { block } = await requireBlockAccess(blockId, userId, "viewer");
  return block.toObject();
}

/** Normalize whatever the client sent into the canonical content/properties shape. */
function normalizePayload(body) {
  const content = {};
  const properties = { ...(body.properties || {}) };

  if (body.content !== undefined) {
    if (body.content !== null && typeof body.content === "object" && !Array.isArray(body.content)) {
      Object.assign(content, body.content);
    } else {
      // Legacy shape: a bare string. Treat it as the block's text.
      content.text = String(body.content);
    }
  }
  if (body.text !== undefined) content.text = String(body.text);

  // Common per-type extras are accepted at the top level for convenience.
  ["checked", "icon", "caption", "language", "table", "url", "color"].forEach((key) => {
    if (body[key] !== undefined) properties[key] = body[key];
  });

  return { content, properties };
}

async function create(pageId, userId, body) {
  const { page } = await requirePageAccess(pageId, userId, "member");

  const type = String(body.type || "paragraph").trim();
  if (!type || type.length > 40) {
    throw ApiError.badRequest("Block type must be a non-empty string of at most 40 characters");
  }

  const { content, properties } = normalizePayload(body);

  let position = body.position;
  if (position === undefined || position === null) {
    const last = await Block.findOne({ pageId: page._id, parentBlockId: null })
      .sort({ position: -1 })
      .select("position")
      .lean();
    position = last ? last.position + 1 : 0;
  }

  // A block's parent must be another block on the same page.
  let parentBlockId = null;
  if (body.parentBlockId) {
    assertObjectId(body.parentBlockId, "parentBlockId");
    const parent = await Block.findById(body.parentBlockId).select("pageId").lean();
    if (!parent) throw ApiError.notFound("Parent block not found");
    if (String(parent.pageId) !== String(page._id)) {
      throw ApiError.badRequest("Parent block belongs to a different page");
    }
    parentBlockId = parent._id;
  }

  const block = await Block.create({
    pageId: page._id,
    parentBlockId,
    type,
    content,
    properties,
    position,
    createdBy: userId,
  });

  return block.toObject();
}

async function update(blockId, patch, userId) {
  const { block } = await requireBlockAccess(blockId, userId, "member");

  if (patch.type !== undefined) {
    const type = String(patch.type).trim();
    if (!type || type.length > 40) {
      throw ApiError.badRequest("Block type must be a non-empty string of at most 40 characters");
    }
    block.type = type;
  }

  if (patch.content !== undefined || patch.text !== undefined || patch.properties !== undefined) {
    const incoming = normalizePayload(patch);
    // A partial update should merge, not wipe fields the client didn't send.
    block.content = { ...(block.content || {}), ...incoming.content };
    block.properties = { ...(block.properties || {}), ...incoming.properties };
  }

  if (patch.position !== undefined) block.position = Number(patch.position) || 0;

  await block.save();
  return block.toObject();
}

async function remove(blockId, userId) {
  const { block } = await requireBlockAccess(blockId, userId, "member");

  // Take any nested children with it.
  await Block.deleteMany({ parentBlockId: block._id });
  await block.deleteOne();

  return { deleted: true, blockId };
}

/**
 * Reorder blocks within a page.
 * @param {string} pageId
 * @param {string[]} orderedIds  block ids in their new display order
 */
async function reorder(pageId, orderedIds, userId) {
  const { page } = await requirePageAccess(pageId, userId, "member");

  if (!Array.isArray(orderedIds) || !orderedIds.length) {
    throw ApiError.badRequest("orderedIds must be a non-empty array of block ids");
  }

  const owned = await Block.find({ pageId: page._id, _id: { $in: orderedIds } })
    .select("_id")
    .lean();
  const ownedIds = new Set(owned.map((b) => String(b._id)));

  // Every id must belong to this page — otherwise ignore the whole request
  // rather than partially applying an ordering the client shouldn't control.
  const unknown = orderedIds.filter((id) => !ownedIds.has(String(id)));
  if (unknown.length) {
    throw ApiError.badRequest("One or more blocks do not belong to this page");
  }

  await Promise.all(
    orderedIds.map((id, index) =>
      Block.updateOne({ _id: id, pageId: page._id }, { $set: { position: index } })
    )
  );

  return listByPage(pageId, userId);
}

/** Full-text search across block content inside a workspace. */
async function search(workspaceId, userId, query, limit = 40) {
  const { Page } = require("../models");
  const { getMembership } = require("./access.service");
  await getMembership(workspaceId, userId, "viewer");

  const q = String(query || "").trim();
  if (!q) return [];

  const pages = await Page.find({ workspaceId, isArchived: false }).select("_id title").lean();
  if (!pages.length) return [];

  const blocks = await Block.find({
    pageId: { $in: pages.map((p) => p._id) },
    "content.text": { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" },
  })
    .select("pageId type content")
    .limit(limit)
    .lean();

  const titleById = new Map(pages.map((p) => [String(p._id), p.title]));

  return blocks.map((b) => ({
    _id: b._id,
    pageId: b.pageId,
    type: b.type,
    snippet: (b.content && b.content.text) || "",
    pageTitle: titleById.get(String(b.pageId)) || "Untitled",
  }));
}

module.exports = { listByPage, getById, create, update, remove, reorder, search };
