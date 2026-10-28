import React from "react";

/* ============================================================
   Landing and authentication screens.
   ============================================================ */

import { Icon } from "../ui/index.jsx";
import * as auth from "../../core/auth.js";
import theme from "../../core/theme.js";
import { focusFirstInvalid } from "../../core/validation.js";

function ThemeGlyph() {
  return <Icon name={theme.current() === "dark" ? "sun" : "moon"} />;
}

export function Landing({ onLogin, onSignup }) {
  return (
    <section className="landing">
      <header className="landing-header">
        <div className="brand">
          <img className="brand-logo" src="/assets/icons/logo.svg" alt="" aria-hidden="true" />
          <span className="brand-name">Lumen</span>
        </div>
        <div className="landing-header-actions">
          <button
            id="landing-theme"
            className="icon-btn"
            type="button"
            aria-label="Toggle theme"
            data-theme-toggle-icon=""
            onClick={() => theme.toggleTheme()}
          >
            <ThemeGlyph />
          </button>
          <button id="landing-login" className="btn btn-ghost" type="button" onClick={onLogin}>
            Log in
          </button>
          <button id="landing-signup" className="btn btn-primary" type="button" onClick={onSignup}>
            Sign up
          </button>
        </div>
      </header>

      <main className="landing-main">
        <div className="landing-copy">
          <h1 className="landing-title">
            All your notes, projects,
            <br />
            and ideas in <span className="text-accent">one place</span>.
          </h1>
          <p className="landing-tagline">
            A fast, minimal workspace for notes, docs, tasks, and databases. Built to feel like a
            real productivity app — your content is saved to your own workspace, not your browser.
          </p>
          <div className="landing-cta">
            <button id="landing-signup-2" className="btn btn-primary btn-lg" type="button" onClick={onSignup}>
              Get Started
            </button>
            <button id="landing-login-2" className="btn btn-secondary btn-lg" type="button" onClick={onLogin}>
              Log in
            </button>
          </div>
          <div className="landing-features">
            <span className="feature-pill">
              <span className="icon icon-check" aria-hidden="true" />
              Notes &amp; docs
            </span>
            <span className="feature-pill">
              <span className="icon icon-check" aria-hidden="true" />
              Tasks &amp; lists
            </span>
            <span className="feature-pill">
              <span className="icon icon-check" aria-hidden="true" />
              Databases &amp; boards
            </span>
            <span className="feature-pill">
              <span className="icon icon-check" aria-hidden="true" />
              Light &amp; dark mode
            </span>
          </div>
        </div>

        <div className="landing-visual">
          <img
            src="/assets/images/illustration.svg"
            alt="Illustration of an organized digital workspace with cards and lists"
          />
        </div>
      </main>

      <footer className="landing-footer">
        <span>Lumen</span>
        <span className="landing-footer-dot">·</span>
        <span>Connected to the Lumen API</span>
        <span className="landing-footer-dot">·</span>
        <span>
          Tip: press <kbd>Ctrl</kbd> + <kbd>K</kbd> to search anywhere
        </span>
      </footer>
    </section>
  );
}

const EMPTY_ERRORS = {};

function Field({
  id,
  label,
  type,
  placeholder,
  autoComplete,
  value,
  onChange,
  error,
  name,
  disabled,
}) {
  return (
    <div className={"auth-field" + (error ? " has-error" : "")}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        name={name || id}
        type={type}
        placeholder={placeholder}
        autoComplete={autoComplete}
        value={value}
        required
        disabled={disabled}
        aria-invalid={!!error}
        aria-describedby={id + "-error"}
        onChange={(e) => onChange(e.target.value)}
      />
      <div className="auth-error" id={id + "-error"} aria-live="polite">
        {error || ""}
      </div>
    </div>
  );
}

export function AuthView({ mode, onSwitch, onAuthenticated }) {
  const isLogin = mode === "login";
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [errors, setErrors] = React.useState(EMPTY_ERRORS);
  const [busy, setBusy] = React.useState(false);
  const formRef = React.useRef(null);

  // React state is already stable; this tiny alias keeps the form readable.
  // (Declared inline rather than as a wrapper so React can track the hooks.)
  function clearFieldError(key) {
    setErrors((prev) => {
      if (!prev[key] && !prev.form) return prev;
      const next = Object.assign({}, prev);
      delete next[key];
      delete next.form;
      return next;
    });
  }

  async function submit(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (busy) return;

    const clientErrors = isLogin
      ? auth.validateLogin(email, password)
      : auth.validateRegister(name, email, password, confirm);
    if (Object.keys(clientErrors).length) {
      setErrors(clientErrors);
      focusFirstInvalid(formRef.current);
      return;
    }

    setErrors(EMPTY_ERRORS);
    setBusy(true);
    let res;
    try {
      res = isLogin
        ? await auth.login(email, password)
        : await auth.register(name, email, password, confirm);
    } catch (err) {
      setErrors({ form: err.message || "Something went wrong. Please try again." });
      return;
    } finally {
      setBusy(false);
    }
    if (!res.ok) {
      setErrors(res.errors || EMPTY_ERRORS);
      if (res.errors && !res.errors.form) focusFirstInvalid(formRef.current);
      return;
    }
    if (onAuthenticated) await onAuthenticated(res, isLogin);
  }

  function switchMode(e) {
    e.preventDefault();
    setErrors(EMPTY_ERRORS);
    onSwitch(isLogin ? "register" : "login");
  }

  return (
    <section className={"auth-view" + (isLogin ? "" : " auth-view-register")}>
      <div className="auth-card">
        <div className="auth-brand">
          <img className="brand-logo" src="/assets/icons/logo.svg" alt="" aria-hidden="true" />
          <span className="brand-name">Lumen</span>
        </div>
        <h1 className="auth-title">{isLogin ? "Welcome back" : "Create your account"}</h1>
        <p className="auth-sub">
          {isLogin ? "Log in to your workspace." : "Start your workspace in seconds."}
        </p>
        <form
          className="auth-form"
          ref={formRef}
          noValidate
          aria-busy={busy}
          onSubmit={submit}
        >
          {!isLogin ? (
            <Field
              id="reg-name"
              label="Name"
              type="text"
              placeholder="Alex Rivera"
              autoComplete="name"
              value={name}
              onChange={(v) => {
                setName(v);
                clearFieldError("name");
              }}
              error={errors.name}
              disabled={busy}
            />
          ) : null}
          <Field
            id={isLogin ? "login-email" : "reg-email"}
            label="Email"
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            value={email}
            onChange={(v) => {
              setEmail(v);
              clearFieldError("email");
            }}
            error={errors.email}
            disabled={busy}
          />
          <Field
            id={isLogin ? "login-password" : "reg-password"}
            label="Password"
            type="password"
            placeholder={isLogin ? "Your password" : "At least 8 characters"}
            autoComplete={isLogin ? "current-password" : "new-password"}
            value={password}
            onChange={(v) => {
              setPassword(v);
              clearFieldError("password");
            }}
            error={errors.password}
            disabled={busy}
          />
          {!isLogin ? (
            <Field
              id="reg-confirm"
              label="Confirm password"
              type="password"
              placeholder="Repeat your password"
              autoComplete="new-password"
              value={confirm}
              onChange={(v) => {
                setConfirm(v);
                clearFieldError("confirm");
              }}
              error={errors.confirm}
              disabled={busy}
            />
          ) : null}
          {errors.form ? <p className="auth-error-banner">{errors.form}</p> : null}
          <button
            id={isLogin ? "login-submit" : "reg-submit"}
            className="btn btn-primary btn-block"
            type="submit"
            disabled={busy}
          >
            {busy ? "Working…" : isLogin ? "Log in" : "Create account"}
          </button>
          <p className="auth-switch">
            {isLogin ? (
              <>
                Don’t have an account?{" "}
                <button
                  id="login-to-register"
                  className="auth-link"
                  type="button"
                  disabled={busy}
                  onClick={switchMode}
                >
                  Sign up
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button
                  id="reg-to-login"
                  className="auth-link"
                  type="button"
                  disabled={busy}
                  onClick={switchMode}
                >
                  Log in
                </button>
              </>
            )}
          </p>
        </form>
        <p className="auth-hint">
          {isLogin
            ? "Your account and workspace live in the Lumen database."
            : "We’ll create your first workspace and a starter page for you."}
        </p>
      </div>
    </section>
  );
}

export default Landing;
