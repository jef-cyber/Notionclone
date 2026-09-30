/**
 * DataTable controller.
 */
const service = require("../services/dataTable.service");
const { ok } = require("../utils/respond");

async function list(req, res) {
  const dataTables = await service.listByPage(req.params.pageId, req.userId);
  return ok(res, { dataTables });
}

async function getOne(req, res) {
  const dataTable = await service.getById(req.params.dataTableId, req.userId);
  return ok(res, { dataTable });
}

async function create(req, res) {
  const dataTable = await service.create(req.params.pageId, req.userId, req.body || {});
  return ok(res, { dataTable }, 201);
}

async function update(req, res) {
  const dataTable = await service.update(req.params.dataTableId, req.body || {}, req.userId);
  return ok(res, { dataTable });
}

async function remove(req, res) {
  const result = await service.remove(req.params.dataTableId, req.userId);
  return ok(res, result);
}

/* ---------------- rows ---------------- */

async function addRow(req, res) {
  const row = await service.addRow(req.params.dataTableId, req.userId, req.body || {});
  return ok(res, { row }, 201);
}

async function updateRow(req, res) {
  const row = await service.updateRow(
    req.params.dataTableId,
    req.params.rowId,
    req.userId,
    req.body || {}
  );
  return ok(res, { row });
}

async function deleteRow(req, res) {
  const result = await service.deleteRow(req.params.dataTableId, req.params.rowId, req.userId);
  return ok(res, result);
}

module.exports = { list, getOne, create, update, remove, addRow, updateRow, deleteRow };
