/**
 * JWT issuing and verification.
 *
 * The secret comes from JWT_SECRET in the environment. It is never defaulted
 * to a hardcoded value in production — booting without one is an error.
 */
const jwt = require("jsonwebtoken");
const ApiError = require("./ApiError");

const DEV_FALLBACK_SECRET = "lumen-insecure-dev-secret-do-not-use-in-production";

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (secret && secret.length >= 16) return secret;

  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET must be set to a strong value in production");
  }
  // Local development convenience only.
  return DEV_FALLBACK_SECRET;
}

function sign(userId, extra) {
  return jwt.sign({ sub: String(userId), ...(extra || {}) }, getSecret(), {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
}

function verify(token) {
  try {
    return jwt.verify(token, getSecret());
  } catch (err) {
    const message =
      err.name === "TokenExpiredError" ? "Session expired" : "Invalid authentication token";
    throw ApiError.unauthorized(message);
  }
}

module.exports = { sign, verify };
