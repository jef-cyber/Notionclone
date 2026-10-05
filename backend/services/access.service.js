/**
 * Access service — the single place that answers "may this user touch that?".
 *
 * Every protected read or write resolves the owning workspace *from the
 * resource itself*, then looks up the caller's membership. A workspaceId sent
 * by the browser is never trusted on its own, which is what stops a caller from
 * reaching another user's workspace by guessing ids.
 *
 * All other services funnel through here so the authorization rules stay
 * consistent.
 */
const { Page, Block, DataTable, WorkspaceMember } = require("../models");
const ApiError = require("../utils/ApiError");
const { assertObjectId } = require("../utils/objectId");
const { roleAtLeast } = require("../middleware/auth.middleware");

/** Fetch the caller's membership record, or throw 403. */
async function getMembership(workspaceId, userId, minimumRole = "viewer") {
  assertObjectId(workspaceId, "workspaceId");

  const membership = await WorkspaceMember.findOne({ workspaceId, userId });
  if (!membership) {
    throw ApiError.forbidden("You are not a member of this workspace");
  }
  if (!roleAtLeast(membership.role, minimumRole)) {
    throw ApiError.forbidden(`This action requires the ${minimumRole} role`);
  }
  return membership;
}

/** Assert access to a page. Returns { page, workspaceId, role }. */
async function requirePageAccess(pageId, userId, minimumRole = "viewer") {
  assertObjectId(pageId, "pageId");

  const page = await Page.findById(pageId);
  if (!page) throw ApiError.notFound("Page not found");

  const membership = await getMembership(page.workspaceId, userId, minimumRole);
  return { page, workspaceId: page.workspaceId, role: membership.role };
}

/** Assert access to a block, via its page. Returns { block, page, workspaceId, role }. */
async function requireBlockAccess(blockId, userId, minimumRole = "viewer") {
  assertObjectId(blockId, "blockId");

  const block = await Block.findById(blockId);
  if (!block) throw ApiError.notFound("Block not found");

  const page = await Page.findById(block.pageId);
  if (!page) throw ApiError.notFound("Page not found for this block");

  const membership = await getMembership(page.workspaceId, userId, minimumRole);
  return { block, page, workspaceId: page.workspaceId, role: membership.role };
}

/** Assert access to a data table, via its page. Returns { dataTable, page, workspaceId, role }. */
async function requireDataTableAccess(dataTableId, userId, minimumRole = "viewer") {
  assertObjectId(dataTableId, "dataTableId");

  const dataTable = await DataTable.findById(dataTableId);
  if (!dataTable) throw ApiError.notFound("Data table not found");

  const page = await Page.findById(dataTable.pageId);
  if (!page) throw ApiError.notFound("Page not found for this data table");

  const membership = await getMembership(page.workspaceId, userId, minimumRole);
  return { dataTable, page, workspaceId: page.workspaceId, role: membership.role };
}

/**
 * Guard against moving a page underneath itself.
 * Walks up from the prospective parent to the root looking for pageId.
 */
async function assertNoCycle(pageId, parentPageId) {
  if (!parentPageId) return;
  if (String(pageId) === String(parentPageId)) {
    throw ApiError.badRequest("A page cannot be nested inside itself");
  }

  let cursor = parentPageId;
  const seen = new Set();
  for (let depth = 0; depth < 100; depth += 1) {
    if (String(cursor) === String(pageId)) {
      throw ApiError.badRequest("A page cannot be nested inside one of its own descendants");
    }
    if (seen.has(String(cursor))) break; // defensive: existing cycle in the data
    seen.add(String(cursor));

    const parent = await Page.findById(cursor).select("parentPageId").lean();
    if (!parent || !parent.parentPageId) return;
    cursor = parent.parentPageId;
  }
}

module.exports = {
  getMembership,
  requirePageAccess,
  requireBlockAccess,
  requireDataTableAccess,
  assertNoCycle,
};
