/* ============================================================
   Lumen — authentication.

   Real credentials now: every call goes to the Express API, which owns the
   users collection, hashes passwords with bcrypt and issues a JWT. Client
   side validation is only here to give instant feedback; the server is
   always the authority and its per-field errors are merged into the form.
   ============================================================ */

(function () {
  "use strict";

  const api = window.Lumen.api;

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const PASSWORD_MIN = 8;
  const TOKEN_KEY = "lumen.token.v1";

  function validateLogin(email, password) {
    const errors = {};
    const e = String(email || "").trim();
    const p = String(password || "");
    if (!e) errors.email = "Email is required.";
    else if (!EMAIL_RE.test(e)) errors.email = "Enter a valid email address.";
    if (!p) errors.password = "Password is required.";
    return errors;
  }

  function validateRegister(name, email, password, confirm) {
    const errors = {};
    const n = String(name || "").trim();
    const e = String(email || "").trim();
    const p = String(password || "");
    const c = String(confirm || "");
    if (!n) errors.name = "Name is required.";
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
   * Spread them into the shape the auth forms expect, and fall back to a
   * single message when the failure is not field-specific.
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
  async function login(email, password) {
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
   * Create an account. The server also creates the caller's first workspace,
   * so the app is usable the moment registration succeeds.
   */
  async function register(name, email, password, confirm) {
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

  function isLoggedIn() {
    return !!api.getToken();
  }

  function logout() {
    // The token is stateless, so this is a best-effort call; the local token
    // is cleared either way.
    const token = api.getToken();
    api.setToken(null);
    if (!token) return Promise.resolve();
    return api.auth
      .logout()
      .catch(() => null)
      .then(() => null);
  }

  window.Lumen = window.Lumen || {};
  window.Lumen.auth = {
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
})();
