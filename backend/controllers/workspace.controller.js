/**
 * Workspace + membership controller.
 */
const service = require("../services/workspace.service");
const { ok } = require("../utils/respond");

async function list(req, res) {
  const workspaces = await service.listForUser(req.userId);
  return ok(res, { workspaces });
}

async function create(req, res) {
  const { name, icon } = req.body || {};
  const workspace = await service.createForUser(req.userId, { name, icon });
  return ok(res, { workspace }, 201);
}

async function getOne(req, res) {
  const workspace = await service.getById(req.workspaceId);
  return ok(res, { workspace: { ...workspace, role: req.role } });
}

async function update(req, res) {
  const workspace = await service.update(req.workspaceId, req.body || {}, req.userId);
  return ok(res, { workspace: { ...workspace, role: req.role } });
}

async function remove(req, res) {
  const result = await service.remove(req.workspaceId, req.userId);
  return ok(res, result);
}

/* ---------------- members ---------------- */

async function listMembers(req, res) {
  const members = await service.listMembers(req.workspaceId, req.userId);
  return ok(res, { members });
}

async function addMember(req, res) {
  const member = await service.addMember(req.workspaceId, req.body || {}, req.userId);
  return ok(res, { member }, 201);
}

async function updateMember(req, res) {
  const member = await service.updateMemberRole(
    req.workspaceId,
    req.params.memberId,
    req.body ? req.body.role : undefined,
    req.userId
  );
  return ok(res, { member });
}

async function removeMember(req, res) {
  const result = await service.removeMember(req.workspaceId, req.params.memberId, req.userId);
  return ok(res, result);
}

module.exports = {
  list,
  create,
  getOne,
  update,
  remove,
  listMembers,
  addMember,
  updateMember,
  removeMember,
};
