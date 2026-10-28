/* Client-side field rules shared by every submitted form.
   The API remains authoritative; these rules only prevent avoidable requests
   and expose the same messages inline. */

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PASSWORD_MIN = 8;
export const NAME_MAX = 80;
export const PAGE_TITLE_MAX = 120;

export function validateEmail(email, options = {}) {
  const value = String(email || "").trim();
  if (!value) return options.required || "Enter your email address.";
  if (!EMAIL_RE.test(value)) return options.invalid || "Enter a valid email address.";
  return "";
}

export function validateProfile(name, email) {
  const errors = {};
  const cleanName = String(name || "").trim();
  if (!cleanName) errors.name = "Enter your name.";
  else if (cleanName.length > NAME_MAX) {
    errors.name = "Name must be " + NAME_MAX + " characters or fewer.";
  }
  const emailError = validateEmail(email);
  if (emailError) errors.email = emailError;
  return errors;
}

export function validatePageTitle(title) {
  const value = String(title || "").trim();
  if (!value) return "Give the page a name.";
  if (value.length > PAGE_TITLE_MAX) {
    return "Page names must be " + PAGE_TITLE_MAX + " characters or fewer.";
  }
  return "";
}

export function validateWorkspaceName(name) {
  const value = String(name || "").trim();
  if (!value) return "Enter a workspace name.";
  if (value.length > PAGE_TITLE_MAX) {
    return "Workspace names must be " + PAGE_TITLE_MAX + " characters or fewer.";
  }
  return "";
}

/** Focus the first field React marked invalid after the next paint. */
export function focusFirstInvalid(container) {
  if (!container || typeof requestAnimationFrame !== "function") return;
  requestAnimationFrame(() => {
    const field = container.querySelector('[aria-invalid="true"]');
    if (field && typeof field.focus === "function") field.focus();
  });
}
