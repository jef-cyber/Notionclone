/**
 * Auth controller — registration, login, session, logout.
 *
 * Passwords are hashed with bcrypt (cost 12) and the plaintext never leaves
 * this function. The `password` field is also `select: false` on the schema,
 * so it cannot be read back by accident.
 */
const bcrypt = require("bcryptjs");
const { User, WorkspaceMember } = require("../models");
const ApiError = require("../utils/ApiError");
const { ok } = require("../utils/respond");
const { sign } = require("../utils/token");
const workspaceService = require("../services/workspace.service");
const { seedWorkspace } = require("../services/onboarding.service");

const BCRYPT_ROUNDS = 12;
const PASSWORD_MIN = 8;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateCredentials({ name, email, password, confirmPassword }, { isRegister }) {
  const errors = {};

  if (isRegister && !String(name || "").trim()) errors.name = "Name is required.";

  const cleanEmail = String(email || "").trim().toLowerCase();
  if (!cleanEmail) errors.email = "Email is required.";
  else if (!EMAIL_RE.test(cleanEmail)) errors.email = "Enter a valid email address.";

  const pass = String(password || "");
  if (!pass) errors.password = "Password is required.";
  else if (isRegister && pass.length < PASSWORD_MIN) {
    errors.password = `Password must be at least ${PASSWORD_MIN} characters.`;
  }

  if (isRegister && confirmPassword !== undefined) {
    if (!String(confirmPassword || "")) errors.confirmPassword = "Please confirm your password.";
    else if (pass !== String(confirmPassword)) errors.confirmPassword = "Passwords do not match.";
  }

  return { errors, cleanEmail, pass };
}

async function register(req, res) {
  const { name, email, password, confirmPassword } = req.body || {};
  const { errors, cleanEmail, pass } = validateCredentials(
    { name, email, password, confirmPassword },
    { isRegister: true }
  );
  if (Object.keys(errors).length) throw ApiError.badRequest("Please fix the highlighted fields", errors);

  const existing = await User.findOne({ email: cleanEmail });
  if (existing) throw ApiError.conflict("An account with that email already exists");

  const hashed = await bcrypt.hash(pass, BCRYPT_ROUNDS);

  let user;
  try {
    user = await User.create({ name: String(name).trim(), email: cleanEmail, password: hashed });
  } catch (err) {
    // Lost a race against a concurrent registration.
    if (err.code === 11000) throw ApiError.conflict("An account with that email already exists");
    throw err;
  }

  // Every new account gets its own workspace so the app is usable immediately.
  const workspace = await workspaceService.createForUser(user._id, {
    name: `${user.name}'s Workspace`,
    icon: "\u25C8",
  });

  // ...plus a page that shows what the app can do. A failure here must not
  // fail the registration: the account and workspace are already valid.
  try {
    await seedWorkspace(workspace._id, user._id);
  } catch (err) {
    console.error("[onboarding] could not seed starter page:", err.message);
  }

  return ok(
    res,
    {
      token: sign(user._id),
      user: user.toJSON(),
      workspace,
      workspaces: [workspace],
    },
    201
  );
}

async function login(req, res) {
  const { email, password } = req.body || {};
  const { errors, cleanEmail, pass } = validateCredentials({ email, password }, { isRegister: false });
  if (Object.keys(errors).length) throw ApiError.badRequest("Please fix the highlighted fields", errors);

  const user = await User.findOne({ email: cleanEmail }).select("+password");
  // Same message for "no such user" and "wrong password" — don't leak which emails exist.
  if (!user) throw ApiError.unauthorized("Incorrect email or password");

  const matches = await bcrypt.compare(pass, user.password);
  if (!matches) throw ApiError.unauthorized("Incorrect email or password");

  const memberships = await WorkspaceMember.find({ userId: user._id }).lean();
  const workspaces = await workspaceService.listForUser(user._id);

  return ok(res, {
    token: sign(user._id),
    user: user.toJSON(),
    workspaces,
    workspace: workspaces[0] || null,
    role: memberships[0] ? memberships[0].role : null,
  });
}

/** Logout is client-side (the token is stateless); the endpoint exists so the
 *  client has one consistent call and can later be swapped for token revocation. */
function logout(_req, res) {
  return ok(res, { loggedOut: true });
}

async function me(req, res) {
  const workspaces = await workspaceService.listForUser(req.userId);
  return ok(res, { user: req.user.toJSON(), workspaces });
}

/** Update the signed-in user's own profile. Email stays unique. */
async function updateMe(req, res) {
  const { name, email, avatar } = req.body || {};
  const user = req.user;

  if (name !== undefined) {
    const clean = String(name).trim();
    if (!clean) throw ApiError.badRequest("Please fix the highlighted fields", { name: "Name is required." });
    user.name = clean;
  }

  if (email !== undefined) {
    const clean = String(email).trim().toLowerCase();
    if (!EMAIL_RE.test(clean)) {
      throw ApiError.badRequest("Please fix the highlighted fields", { email: "Enter a valid email address." });
    }
    if (clean !== user.email) {
      const taken = await User.findOne({ email: clean }).select("_id").lean();
      if (taken) {
        throw ApiError.conflict("An account with that email already exists");
      }
      user.email = clean;
    }
  }

  if (avatar !== undefined) user.avatar = String(avatar).slice(0, 500);

  await user.save();
  return ok(res, { user: user.toJSON() });
}

module.exports = { register, login, logout, me, updateMe, PASSWORD_MIN, EMAIL_RE };
