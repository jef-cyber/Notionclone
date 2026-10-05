/**
 * Page controller.
 */
const service = require("../services/page.service");
const { ok } = require("../utils/respond");

async function list(req, res) {
  const includeArchived = req.query.includeArchived === "true";
  const pages = await service.listByWorkspace(req.workspaceId, req.userId, { includeArchived });
  return ok(res, { pages });
}

async function create(req, res) {
  const page = await service.create(req.workspaceId, req.userId, req.body || {});
  return ok(res, { page }, 201);
}

async function getOne(req, res) {
  const page = await service.getById(req.params.pageId, req.userId);
  return ok(res, { page });
}

async function update(req, res) {
  const page = await service.update(req.params.pageId, req.body || {}, req.userId);
  return ok(res, { page });
}

async function remove(req, res) {
  const result = await service.remove(req.params.pageId, req.userId);
  return ok(res, result);
}

async function children(req, res) {
  const pages = await service.listChildren(req.params.pageId, req.userId);
  return ok(res, { pages });
}

async function duplicate(req, res) {
  const page = await service.duplicate(req.params.pageId, req.userId);
  return ok(res, { page }, 201);
}

async function search(req, res) {
  const pages = await service.search(req.workspaceId, req.userId, req.query.q);
  return ok(res, { pages });
}

module.exports = { list, create, getOne, update, remove, children, duplicate, search };
