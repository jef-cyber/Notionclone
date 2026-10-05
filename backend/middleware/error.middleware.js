/**
 * Centralized error handling.
 *
 * Every failure — thrown, rejected, or passed to next() — is turned into the
 * same JSON envelope so the frontend has exactly one error shape to parse:
 *
 *   { "success": false, "error": { "message": "...", "status": 400, "code": "..." } }
 */
const ApiError = require("../utils/ApiError");
const { isValidObjectId } = require("../utils/objectId");

/** 404 handler for unmatched routes. */
function notFound(req, _res, next) {
  next(ApiError.notFound(`No route matches ${req.method} ${req.originalUrl}`));
}

function normalize(err) {
  // CastError: a malformed ObjectId reached a query.
  if (err.name === "CastError") {
    if (err.kind === "ObjectId") {
      return ApiError.badRequest(`Invalid value for "${err.path}"`);
    }
    return ApiError.badRequest(`Invalid value for "${err.path}"`);
  }

  // Schema validation.
  if (err.name === "ValidationError") {
    const details = Object.values(err.errors).map((e) => e.message);
    return ApiError.badRequest(details[0] || "Validation failed", details);
  }

  // Unique index violation (e.g. duplicate email, duplicate membership).
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern || err.keyValue || {}).join(", ") || "value";
    return ApiError.conflict(`That ${field} is already taken`);
  }

  return err;
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  const error = normalize(err);
  const status = error instanceof ApiError ? error.status : err.status || 500;

  if (status >= 500) {
    console.error(`[error] ${req.method} ${req.originalUrl}`, err);
  }

  const body = {
    success: false,
    error: {
      message:
        status >= 500 ? "Something went wrong on our end" : error.message || "Request failed",
      status,
    },
  };

  if (error.details) body.error.details = error.details;
  if (error.code) body.error.code = error.code;
  // In development, surface the real message for 500s to speed up debugging.
  if (status >= 500 && process.env.NODE_ENV !== "production") {
    body.error.message = error.message;
    body.error.stack = err.stack;
  }

  res.status(status).json(body);
}

module.exports = { notFound, errorHandler, isValidObjectId };
