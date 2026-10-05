/* ============================================================
   Lumen — API client.

   One place that knows about HTTP: base URL, the bearer token, the
   { success, data } envelope and the { success, error } error envelope.
   Everything else in the app awaits these functions and deals in plain
   domain objects.
   ============================================================ */

(function () {
  "use strict";

  const TOKEN_KEY = "lumen.token.v1";
  const BASE_KEY = "lumen.apiBase.v1";

  /* The Express app serves this same folder, so the API is same-origin by
     default. Override with localStorage["lumen.apiBase.v1"] (or
     window.Lumen.API_BASE) when the frontend is served separately. */
  function baseUrl() {
    if (window.Lumen && window.Lumen.API_BASE) return String(window.Lumen.API_BASE).replace(/\/$/, "");
    try {
      const stored = localStorage.getItem(BASE_KEY);
      if (stored) return stored.replace(/\/$/, "");
    } catch (e) {
      /* private mode / storage disabled — fall through to same-origin */
    }
    return "/api";
  }

  function setBaseUrl(url) {
    try {
      if (url) localStorage.setItem(BASE_KEY, String(url).replace(/\/$/, ""));
      else localStorage.removeItem(BASE_KEY);
    } catch (e) {
      /* ignore */
    }
  }

  /* ---------- token ---------- */
  function getToken() {
    try {
      return localStorage.getItem(TOKEN_KEY) || null;
    } catch (e) {
      return null;
    }
  }

  function setToken(token) {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch (e) {
      /* ignore */
    }
  }

  /* ---------- error type ---------- */
  function ApiError(message, status, details) {
    const err = new Error(message);
    err.name = "ApiError";
    err.status = status || 0;
    err.details = details || null;
    err.isApiError = true;
    return err;
  }

  function query(params) {
    if (!params) return "";
    const pairs = [];
    Object.keys(params).forEach((key) => {
      const value = params[key];
      if (value === undefined || value === null || value === "") return;
      pairs.push(encodeURIComponent(key) + "=" + encodeURIComponent(value));
    });
    return pairs.length ? "?" + pairs.join("&") : "";
  }

  /**
   * Perform a request and unwrap the envelope.
   * @returns {Promise<any>} the `data` payload
   * @throws  {ApiError} on any non-2xx response or transport failure
   */
  async function request(method, path, options) {
    const opts = options || {};
    const url = baseUrl() + path + query(opts.query);

    const headers = {};
    if (opts.body !== undefined) headers["Content-Type"] = "application/json";
    const token = opts.token === undefined ? getToken() : opts.token;
    if (token) headers.Authorization = "Bearer " + token;

    let res;
    try {
      res = await fetch(url, {
        method: method,
        headers: headers,
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      });
    } catch (networkError) {
      throw ApiError(
        "Cannot reach the Lumen server. Is it running on port " +
          (baseUrl() === "/api" ? window.location.port || "4000" : baseUrl()) +
          "?",
        0
      );
    }

    const text = await res.text();
    let payload = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch (e) {
        payload = null;
      }
    }

    if (!res.ok) {
      const info = (payload && payload.error) || {};
      const err = ApiError(
        info.message || "Request failed (" + res.status + ")",
        info.status || res.status,
        info.details || null
      );
      err.code = info.code || null;
      // A rejected token is a session problem, not a request problem: drop it
      // and let the app fall back to the landing page exactly once.
      if (err.status === 401 && token && !opts.skipAuthEvent) {
        setToken(null);
        window.dispatchEvent(new CustomEvent("lumen:unauthorized"));
      }
      throw err;
    }

    if (payload && payload.success === false) {
      const info = payload.error || {};
      throw ApiError(info.message || "Request failed", info.status || res.status, info.details || null);
    }

    return payload && Object.prototype.hasOwnProperty.call(payload, "data") ? payload.data : payload;
  }

  const get = (path, queryParams, opts) => request("GET", path, Object.assign({ query: queryParams }, opts));
  const post = (path, body, opts) => request("POST", path, Object.assign({ body: body || {} }, opts));
  const patch = (path, body, opts) => request("PATCH", path, Object.assign({ body: body || {} }, opts));
  const del = (path, opts) => request("DELETE", path, opts);

  /* ---------- resources ---------- */
  const auth = {
    // A failed login is a 401 too, so it must not trigger the session-expiry
    // handler.
    register: (payload) => post("/auth/register", payload, { token: null, skipAuthEvent: true }),
    login: (payload) => post("/auth/login", payload, { token: null, skipAuthEvent: true }),
    logout: () => post("/auth/logout", {}, { token: null, skipAuthEvent: true }),
    me: () => get("/auth/me"),
    updateProfile: (patch) => patch("/auth/me", patch),
  };

  const workspaces = {
    list: () => get("/workspaces"),
    create: (payload) => post("/workspaces", payload),
    get: (id) => get("/workspaces/" + id),
    update: (id, patchBody) => patch("/workspaces/" + id, patchBody),
    remove: (id) => del("/workspaces/" + id),
    members: (id) => get("/workspaces/" + id + "/members"),
    addMember: (id, payload) => post("/workspaces/" + id + "/members", payload),
    updateMember: (id, memberId, role) => patch("/workspaces/" + id + "/members/" + memberId, { role: role }),
    removeMember: (id, memberId) => del("/workspaces/" + id + "/members/" + memberId),
  };

  const pages = {
    list: (workspaceId, opts) =>
      get("/workspaces/" + workspaceId + "/pages", { includeArchived: opts && opts.includeArchived ? "true" : undefined }),
    create: (workspaceId, payload) => post("/workspaces/" + workspaceId + "/pages", payload),
    get: (pageId) => get("/pages/" + pageId),
    update: (pageId, patchBody) => patch("/pages/" + pageId, patchBody),
    remove: (pageId) => del("/pages/" + pageId),
    duplicate: (pageId) => post("/pages/" + pageId + "/duplicate", {}),
    children: (pageId) => get("/pages/" + pageId + "/children"),
    search: (workspaceId, q) => get("/workspaces/" + workspaceId + "/pages/search", { q: q }),
  };

  const blocks = {
    list: (pageId) => get("/pages/" + pageId + "/blocks"),
    create: (pageId, payload) => post("/pages/" + pageId + "/blocks", payload),
    get: (blockId) => get("/blocks/" + blockId),
    update: (blockId, patchBody) => patch("/blocks/" + blockId, patchBody),
    remove: (blockId) => del("/blocks/" + blockId),
    reorder: (pageId, orderedIds) => post("/pages/" + pageId + "/blocks/reorder", { orderedIds: orderedIds }),
    search: (workspaceId, q) => get("/workspaces/" + workspaceId + "/blocks/search", { q: q }),
  };

  const dataTables = {
    listForPage: (pageId) => get("/pages/" + pageId + "/data-tables"),
    create: (pageId, payload) => post("/pages/" + pageId + "/data-tables", payload),
    get: (id) => get("/data-tables/" + id),
    update: (id, patchBody) => patch("/data-tables/" + id, patchBody),
    remove: (id) => del("/data-tables/" + id),
    addRow: (id, values) => post("/data-tables/" + id + "/rows", { values: values }),
    updateRow: (id, rowId, values) => patch("/data-tables/" + id + "/rows/" + rowId, { values: values }),
    deleteRow: (id, rowId) => del("/data-tables/" + id + "/rows/" + rowId),
  };

  const health = () => get("/health", null, { token: null });

  window.Lumen = window.Lumen || {};
  window.Lumen.api = {
    baseUrl,
    setBaseUrl,
    getToken,
    setToken,
    request,
    get,
    post,
    patch,
    delete: del,
    health,
    auth,
    workspaces,
    pages,
    blocks,
    dataTables,
    ApiError,
  };
})();
