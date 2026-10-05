/**
 * DataTable service — the generic Notion-style database.
 *
 * One collection backs every "database" shape. A roadmap, a kanban board, a
 * calendar and a plain table are all the same rows viewed differently, so
 * nothing here is specialized per view.
 */
const crypto = require("crypto");
const { DataTable } = require("../models");
const ApiError = require("../utils/ApiError");
const { assertObjectId } = require("../utils/objectId");
const { PROPERTY_TYPES } = require("../config/constants");
const { requirePageAccess, requireDataTableAccess } = require("./access.service");

/** A sensible starting column so a new table is usable immediately. */
function defaultProperties(name) {
  return {
    [name || "Name"]: { type: "title" },
    Status: { type: "select", options: ["Todo", "In Progress", "Done"] },
  };
}

function newRowId() {
  return `row_${crypto.randomBytes(8).toString("hex")}`;
}

/**
 * Validate a property-definition map.
 * Shape: { "Status": { type: "select", options: ["Todo", "Done"] } }
 */
function validateProperties(properties) {
  if (properties === undefined) return undefined;
  if (properties === null || typeof properties !== "object" || Array.isArray(properties)) {
    throw ApiError.badRequest("properties must be an object keyed by column name");
  }

  const out = {};
  Object.entries(properties).forEach(([name, def]) => {
    const column = String(name).trim();
    if (!column || column.length > 100) {
      throw ApiError.badRequest("Property names must be 1-100 characters");
    }
    if (!def || typeof def !== "object" || Array.isArray(def)) {
      throw ApiError.badRequest(`Property "${column}" must be an object like { type: "text" }`);
    }

    const type = def.type || "text";
    if (!PROPERTY_TYPES.includes(type)) {
      throw ApiError.badRequest(
        `Property "${column}" has unsupported type "${type}". Allowed: ${PROPERTY_TYPES.join(", ")}`
      );
    }

    const spec = { type };
    if (type === "select" || type === "multi_select") {
      const options = def.options;
      if (!Array.isArray(options)) {
        throw ApiError.badRequest(`Property "${column}" of type ${type} needs an options array`);
      }
      spec.options = options.map((o) => String(o).trim()).filter(Boolean);
    }
    // Carry through any extra config (e.g. relation target, date format).
    Object.entries(def).forEach(([key, value]) => {
      if (key !== "type" && key !== "options") spec[key] = value;
    });

    out[column] = spec;
  });

  return out;
}

/** Coerce a row's values against the declared property types. */
function coerceRow(values, properties) {
  if (values === null || typeof values !== "object" || Array.isArray(values)) {
    throw ApiError.badRequest("Row values must be an object keyed by column name");
  }

  const row = {};
  Object.entries(values).forEach(([column, value]) => {
    if (column === "id") return; // ids are server-managed

    const spec = properties[column];
    if (!spec) {
      // Undeclared columns are still allowed (the schema is flexible) but
      // stored as-is rather than rejected.
      row[column] = value;
      return;
    }

    switch (spec.type) {
      case "number": {
        if (value === null || value === undefined || value === "") {
          row[column] = null;
        } else {
          const num = Number(value);
          if (Number.isNaN(num)) {
            throw ApiError.badRequest(`"${column}" expects a number`);
          }
          row[column] = num;
        }
        break;
      }
      case "checkbox":
        row[column] = value === true || value === "true" || value === 1 || value === "1";
        break;
      case "multi_select":
        row[column] = Array.isArray(value) ? value.map(String) : value ? [String(value)] : [];
        break;
      case "select": {
        const picked = value === null || value === undefined || value === "" ? null : String(value);
        if (picked && Array.isArray(spec.options) && spec.options.length) {
          if (!spec.options.includes(picked)) {
            throw ApiError.badRequest(
              `"${picked}" is not an option for "${column}". Allowed: ${spec.options.join(", ")}`
            );
          }
        }
        row[column] = picked;
        break;
      }
      case "date": {
        row[column] = value === null || value === undefined || value === "" ? null : new Date(value);
        break;
      }
      default:
        row[column] = value === null || value === undefined ? "" : String(value);
    }
  });

  return row;
}

async function listByPage(pageId, userId) {
  const { page } = await requirePageAccess(pageId, userId, "viewer");

  return DataTable.find({ pageId: page._id }).sort({ createdAt: 1 }).lean();
}

async function getById(dataTableId, userId) {
  const { dataTable } = await requireDataTableAccess(dataTableId, userId, "viewer");
  return dataTable.toObject();
}

async function create(pageId, userId, body) {
  const { page } = await requirePageAccess(pageId, userId, "member");

  const name = String(body.name || "").trim();
  if (!name) throw ApiError.badRequest("Data table name is required");

  const properties = validateProperties(body.properties) || defaultProperties(name);
  const rows = Array.isArray(body.rows)
    ? body.rows.map((values) => ({ id: newRowId(), ...coerceRow(values, properties) }))
    : [];

  const dataTable = await DataTable.create({
    workspaceId: page.workspaceId,
    pageId: page._id,
    name,
    description: body.description || "",
    properties,
    rows,
    defaultView: body.defaultView || "table",
    viewConfig: body.viewConfig || {},
    createdBy: userId,
  });

  return dataTable.toObject();
}

const TABLE_FIELDS = ["name", "description", "defaultView", "viewConfig"];

async function update(dataTableId, patch, userId) {
  const { dataTable } = await requireDataTableAccess(dataTableId, userId, "member");

  TABLE_FIELDS.forEach((field) => {
    if (patch[field] !== undefined) dataTable[field] = patch[field];
  });

  if (patch.properties !== undefined) {
    dataTable.properties = validateProperties(patch.properties);
  }

  if (patch.rows !== undefined) {
    if (!Array.isArray(patch.rows)) throw ApiError.badRequest("rows must be an array");
    dataTable.rows = patch.rows.map((values) => {
      const { id, ...rest } = values || {};
      return { id: id || newRowId(), ...coerceRow(rest, dataTable.properties) };
    });
  }

  await dataTable.save();
  return dataTable.toObject();
}

async function remove(dataTableId, userId) {
  const { dataTable } = await requireDataTableAccess(dataTableId, userId, "member");
  await dataTable.deleteOne();
  return { deleted: true, dataTableId };
}

/* ---------------- rows ---------------- */

async function addRow(dataTableId, userId, body = {}) {
  const { dataTable } = await requireDataTableAccess(dataTableId, userId, "member");

  const values = body.values || body;
  const row = { id: newRowId(), ...coerceRow(values, dataTable.properties) };

  dataTable.rows.push(row);
  await dataTable.save();

  return row;
}

async function updateRow(dataTableId, rowId, userId, patch = {}) {
  const { dataTable } = await requireDataTableAccess(dataTableId, userId, "member");

  const index = dataTable.rows.findIndex((r) => String(r.id) === String(rowId));
  if (index === -1) throw ApiError.notFound("Row not found");

  const values = patch.values || patch;
  const { id, ...rest } = values;

  // A patch is partial: keep every column the client did not send. (The spread
  // needs its own parentheses — `...x ? a : b` would spread the *function*.)
  const current = dataTable.rows[index];
  dataTable.rows[index] = {
    ...(typeof current.toObject === "function" ? current.toObject() : current),
    ...coerceRow(rest, dataTable.properties),
  };
  await dataTable.save();

  return dataTable.rows[index];
}

async function deleteRow(dataTableId, rowId, userId) {
  const { dataTable } = await requireDataTableAccess(dataTableId, userId, "member");

  const before = dataTable.rows.length;
  dataTable.rows = dataTable.rows.filter((r) => String(r.id) !== String(rowId));
  if (dataTable.rows.length === before) throw ApiError.notFound("Row not found");

  await dataTable.save();
  return { deleted: true, rowId, remaining: dataTable.rows.length };
}

module.exports = {
  listByPage,
  getById,
  create,
  update,
  remove,
  addRow,
  updateRow,
  deleteRow,
  validateProperties,
  defaultProperties,
};
