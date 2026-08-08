/* ============================================================
   Lumen — mock auth (Phase 1, frontend only).
   Validation + session helpers backed by the store's local state.
   There is no real backend: any valid-looking credentials work.
   ============================================================ */

(function () {
  "use strict";

  const { store } = window.Lumen;

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const PASSWORD_MIN = 8;

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

  /** Mock login: succeeds for any valid email + password. */
  function login(email, password) {
    const errors = validateLogin(email, password);
    if (Object.keys(errors).length) return { ok: false, errors };
    store.setLoggedIn(true);
    return { ok: true };
  }

  /** Mock register: validates, then creates/updates the local user. */
  function register(name, email, password, confirm) {
    const errors = validateRegister(name, email, password, confirm);
    if (Object.keys(errors).length) return { ok: false, errors };
    const cleanEmail = String(email || "").trim().toLowerCase();
    store.updateUser({
      name: String(name || "").trim(),
      email: cleanEmail,
      username: cleanEmail.split("@")[0] || "user",
    });
    store.setLoggedIn(true);
    return { ok: true };
  }

  /** Mock "Continue with Google" — signs in as a demo user. */
  function googleLogin() {
    const demo = {
      name: "Alex Rivera",
      email: "alex@lumen.space",
      username: "alexrivera",
    };
    store.updateUser(demo);
    store.setLoggedIn(true);
    return { ok: true };
  }

  function isLoggedIn() {
    return !!store.getState().loggedIn;
  }

  function logout() {
    store.setLoggedIn(false);
  }

  window.Lumen = window.Lumen || {};
  window.Lumen.auth = {
    validateLogin,
    validateRegister,
    login,
    register,
    googleLogin,
    logout,
    isLoggedIn,
    EMAIL_RE,
    PASSWORD_MIN,
  };
})();
