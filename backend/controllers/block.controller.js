/**
 * Block controller.
 */
const service = require("../services/block.service");
const { ok } = require("../utils/respond");

async function list(req, res) {
  const blocks = await service.listByPage(req.params.pageId, req.userId);
  return ok(res, { blocks });
}

async function getOne(req, res) {
  const block = await service.getById(req.params.blockId, req.userId);
  return ok(res, { block });
}

async function create(req, res) {
  const block = await service.create(req.params.pageId, req.userId, req.body || {});
  return ok(res, { block }, 201);
}

async function update(req, res) {
  const block = await service.update(req.params.blockId, req.body || {}, req.userId);
  return ok(res, { block });
}

async function remove(req, res) {
  const result = await service.remove(req.params.blockId, req.userId);
  return ok(res, result);
}

async function reorder(req, res) {
  const { orderedIds } = req.body || {};
  const blocks = await service.reorder(req.params.pageId, orderedIds, req.userId);
  return ok(res, { blocks });
}

async function search(req, res) {
  const results = await service.search(req.workspaceId, req.userId, req.query.q);
  return ok(res, { results });
}

module.exports = { list, getOne, create, update, remove, reorder, search };
