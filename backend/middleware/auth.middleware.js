/**
 * Authentication and authorization middleware.
 *
 * These are two different questions:
 *   authenticate -> "Who is this?"  (requireAuth)
 *   authorize    -> "May they?"      (requireWorkspaceRole, loadPageContext)
 *
 * Authorization always re-derives the workspace from the resource being
 * touched. A workspaceId sent by the browser is never trusted on its own.
 */
const ApiError = require("../utils/ApiError");
const { verify } = require("../utils/token");
const { User, WorkspaceMember } = require("../models");
const { ROLE_RANK } = require("../config/constants");
const { assertObjectId } = require("../utils/objectId");

/** Pull a bearer token from the Authorization header. */
function extractToken(req) {
  const header = req.headers.authorization || "";
  if (header.toLowerCase().startsWith("bearer ")) {
    return header.slice(7).trim();
  }
  return null;
}

/**
 * Requires a valid JWT. Attaches req.user (the full User document) and
 * req.userId.
 */
async function requireAuth(req, _res, next) {
  try {
    const token = extractToken(req);
    if (!token) throw ApiError.unauthorized("Missing authentication token");

    const payload = verify(token);
    const user = await User.findById(payload.sub);
    if (!user) throw ApiError.unauthorized("Account no longer exists");

    req.user = user;
    req.userId = user._id;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Attaches req.user when a valid token is present, but never rejects.
 * Useful for endpoints that behave differently for signed-in users.
 */
async function optionalAuth(req, _res, next) {
  const token = extractToken(req);
  if (!token) return next();
  try {
    const payload = verify(token);
    const user = await User.findById(payload.sub);
    if (user) {
      req.user = user;
      req.userId = user._id;
    }
  } catch (_err) {
    // Ignore: treated as anonymous.
  }
  next();
}

/**
 * Looks up the caller's membership in a workspace and enforces a minimum role.
 * Mount this after requireAuth.
 *
 * @param {string} param  route param holding the workspace id
 * @param {string} minimum  one of owner | admin | member | viewer
 */
function requireWorkspaceRole(param, minimum = "viewer") {
  const needed = ROLE_RANK[minimum];
  if (!needed) throw new Error(`Unknown role: ${minimum}`);

  return async function workspaceGuard(req, _res, next) {
    try {
      const workspaceId = assertObjectId(req.params[param], `${param}`);
      const membership = await WorkspaceMember.findOne({
        workspaceId,
        userId: req.userId,
      });

      if (!membership) {
        // Do not reveal whether the workspace exists to a non-member.
        throw ApiError.forbidden("You are not a member of this workspace");
      }
      if (ROLE_RANK[membership.role] < needed) {
        throw ApiError.forbidden(`This action requires the ${minimum} role`);
      }

      req.workspaceId = membership.workspaceId;
      req.membership = membership;
      req.role = membership.role;
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** True when the caller's role is at least `minimum`. */
function roleAtLeast(role, minimum) {
  return (ROLE_RANK[role] || 0) >= (ROLE_RANK[minimum] || 0);
}

/** Roles allowed to perform destructive or administrative actions. */
function isManager(role) {
  return roleAtLeast(role, "admin");
}

module.exports = {
  requireAuth,
  optionalAuth,
  requireWorkspaceRole,
  roleAtLeast,
  isManager,
};
