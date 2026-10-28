/* Lumen — authentication.
   Client-side validation only gives instant feedback; the Express API owns
   users, password hashing and JWT issuance and is always the authority. */

import * as api from "./api.js";
import { EMAIL_RE, NAME_MAX, PASSWORD_MIN } from "./validation.js";

export { EMAIL_RE, PASSWORD_MIN };
export const TOKEN_KEY = "lumen.token.v1";

export function validateLogin(email, password) {
  const errors = {};
  const e = String(email || "").trim();
  const p = String(password || "");
  if (!e) errors.email = "Email is required.";
  else if (!EMAIL_RE.test(e)) errors.email = "Enter a valid email address.";
  if (!p) errors.password = "Password is required.";
  return errors;
}

export function validateRegister(name, email, password, confirm) {
  const errors = {};
  const n = String(name || "").trim();
  const e = String(email || "").trim();
  const p = String(password || "");
  const c = String(confirm || "");
  if (!n) errors.name = "Name is required.";
  else if (n.length > NAME_MAX) {
    errors.name = "Name must be " + NAME_MAX + " characters or fewer.";
  }
  if (!e) errors.email = "Email is required.";
  else if (!EMAIL_RE.test(e)) errors.email = "Enter a valid email address.";
  if (!p) errors.password = "Password is required.";
  else if (p.length < PASSWORD_MIN)
    errors.password = "Password must be at least " + PASSWORD_MIN + " characters.";
  if (!c) errors.confirm = "Please confirm your password.";
  else if (p !== c) errors.confirm = "Passwords do not match.";
  return errors;
}

/**
 * The server reports field problems as `{ error: { details: { email: "..." } } }`.
 * Spread them into the shape the auth forms expect, and fall back to a single
 * message when the failure is not field-specific.
 */
function toResult(payload) {
  if (payload && payload.ok) return { ok: true };

  const errors = {};
  const details = payload && payload.details;
  if (details && typeof details === "object" && !Array.isArray(details)) {
    Object.keys(details).forEach((key) => {
      if (typeof details[key] === "string") errors[key] = details[key];
    });
  }
  if (!Object.keys(errors).length) {
    const message = (payload && payload.message) || "Something went wrong. Please try again.";
    errors.form = message;
  }
  return { ok: false, errors };
}

/** Log in. @returns {Promise<{ok: boolean, errors?: object}>} */
export async function login(email, password) {
  const errors = validateLogin(email, password);
  if (Object.keys(errors).length) return { ok: false, errors };

  try {
    const data = await api.auth.login({
      email: String(email).trim().toLowerCase(),
      password: password,
    });
    api.setToken(data.token);
    return { ok: true, user: data.user, workspaces: data.workspaces };
  } catch (err) {
    return toResult({ message: err.message, details: err.details });
  }
}

/**
 * Create an account. The server also creates the caller's first workspace, so
 * the app is usable the moment registration succeeds.
 */
export async function register(name, email, password, confirm) {
  const errors = validateRegister(name, email, password, confirm);
  if (Object.keys(errors).length) return { ok: false, errors };

  try {
    const data = await api.auth.register({
      name: String(name).trim(),
      email: String(email).trim().toLowerCase(),
      password: password,
      confirmPassword: confirm,
    });
    api.setToken(data.token);
    return { ok: true, user: data.user, workspaces: data.workspaces };
  } catch (err) {
    // The server's confirmPassword key is called `confirmPassword` locally.
    const details = err.details || {};
    if (typeof details.confirmPassword === "string" && !details.confirm) {
      details.confirm = details.confirmPassword;
    }
    return toResult({ message: err.message, details: details });
  }
}

export function isLoggedIn() {
  return !!api.getToken();
}

export function logout() {
  // The token is stateless, so this is a best-effort call; the local token is
  // cleared either way.
  const token = api.getToken();
  api.setToken(null);
  if (!token) return Promise.resolve();
  return api.auth
    .logout()
    .catch(() => null)
    .then(() => null);
}

export const auth = {
  validateLogin,
  validateRegister,
  login,
  register,
  logout,
  isLoggedIn,
  EMAIL_RE,
  PASSWORD_MIN,
  TOKEN_KEY,
};

export default auth;
