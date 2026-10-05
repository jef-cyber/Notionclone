/**
 * ObjectId helpers — every :id in the API is validated before it reaches a
 * query, so a malformed id returns 400 instead of a confusing 500.
 */
const mongoose = require("mongoose");
const ApiError = require("./ApiError");

/**
 * True when `value` is a valid ObjectId.
 *
 * Accepts an ObjectId instance as well as a 24-character hex string: middleware
 * and services pass documents around internally (e.g. `req.workspaceId` comes
 * from a membership document), so requiring a string here would reject values
 * this app itself produced.
 */
function isValidObjectId(value) {
  if (value instanceof mongoose.Types.ObjectId) return true;
  return typeof value === "string" && mongoose.Types.ObjectId.isValid(value);
}

/**
 * Assert a route param is a valid ObjectId, or throw a 400.
 * @param {string} value
 * @param {string} label  param name used in the error message
 */
function assertObjectId(value, label = "id") {
  if (!isValidObjectId(value)) {
    throw ApiError.badRequest(`Invalid ${label}: "${String(value)}" is not a valid ObjectId`);
  }
  return value;
}

/** Convert to ObjectId, or null when the value is absent/invalid. */
function toObjectIdOrNull(value) {
  return isValidObjectId(value) ? new mongoose.Types.ObjectId(value) : null;
}

module.exports = { isValidObjectId, assertObjectId, toObjectIdOrNull };
