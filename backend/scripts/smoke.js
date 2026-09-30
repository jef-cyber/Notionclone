/**
 * End-to-end API smoke test.
 *
 *   npm run smoke
 *
 * Boots the real Express app in-process, talks to it over HTTP exactly like the
 * browser does, and exercises every resource in the six-collection model:
 * auth -> workspace -> members -> pages (nested) -> blocks -> dataTable -> rows,
 * plus the authorization checks that matter (no token, wrong workspace).
 *
 * Everything it creates is deleted again before it exits.
 */
require("dotenv").config();

const crypto = require("crypto");
const mongoose = require("mongoose");
const app = require("../app");
const db = require("../config/db");

const PORT = 0; // let the OS pick a free port

let BASE = "";

let passed = 0;
let failed = 0;

function check(label, condition, extra) {
  if (condition) {
    passed += 1;
    console.log(`  ok   ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL ${label}${extra ? `\n         -> ${extra}` : ""}`);
  }
}

async function call(method, path, { token, body } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (_err) {
    /* leave json null so the assertion message shows the raw body */
  }
  return { status: res.status, json, text };
}

async function run() {
  const email = `smoke-${crypto.randomBytes(6).toString("hex")}@lumen.test`;
  const password = "smoke-password-123";

  let token = null;
  let workspaceId = null;
  let pageId = null;
  let childPageId = null;
  let blockId = null;
  let dataTableId = null;
  let otherToken = null;
  let otherWorkspaceId = null;
  let otherEmail = null;

  /* ---------- health ---------- */
  console.log("\nhealth");
  {
    const res = await call("GET", "/api/health");
    check("GET /api/health -> 200", res.status === 200, res.text);
    check(
      "advertises the six canonical collections",
      ["users", "workspaces", "workspaceMembers", "pages", "blocks", "dataTable"].every((c) =>
        (res.json?.data?.collections || []).includes(c)
      )
    );
  }

  /* ---------- auth ---------- */
  console.log("\nauth");
  {
    const res = await call("POST", "/api/auth/register", {
      body: { name: "Smoke Tester", email, password },
    });
    check("POST /api/auth/register -> 201", res.status === 201, res.text);
    check("returns a token", !!res.json?.data?.token);
    check("never returns the password hash", !res.text.includes("$2"), res.text);
    token = res.json.data.token;
    workspaceId = res.json.data.workspace._id;
    check("auto-creates a workspace", !!workspaceId);
    check("creator is the owner", res.json.data.workspace.role === "owner");

    const dup = await call("POST", "/api/auth/register", {
      body: { name: "Smoke Tester", email, password },
    });
    check("duplicate email -> 409", dup.status === 409, dup.text);

    const shortPw = await call("POST", "/api/auth/register", {
      body: { name: "x", email: `x-${Date.now()}@lumen.test`, password: "short" },
    });
    check("short password -> 400", shortPw.status === 400, shortPw.text);

    const badLogin = await call("POST", "/api/auth/login", {
      body: { email, password: "wrong-password" },
    });
    check("wrong password -> 401", badLogin.status === 401, badLogin.text);

    const login = await call("POST", "/api/auth/login", { body: { email, password } });
    check("POST /api/auth/login -> 200", login.status === 200, login.text);

    const me = await call("GET", "/api/auth/me", { token });
    check("GET /api/auth/me -> 200", me.status === 200, me.text);
    check("me returns the workspaces list", (me.json?.data?.workspaces || []).length === 1);

    const noToken = await call("GET", "/api/auth/me");
    check("me without a token -> 401", noToken.status === 401, noToken.text);

    const badToken = await call("GET", "/api/auth/me", { token: "not-a-jwt" });
    check("me with a garbage token -> 401", badToken.status === 401, badToken.text);
  }

  /* ---------- workspaces ---------- */
  console.log("\nworkspaces + members");
  {
    const list = await call("GET", "/api/workspaces", { token });
    check("GET /api/workspaces -> 200", list.status === 200, list.text);
    check("lists one workspace", (list.json?.data?.workspaces || []).length === 1);

    const get = await call("GET", `/api/workspaces/${workspaceId}`, { token });
    check("GET /api/workspaces/:id -> 200", get.status === 200, get.text);
    check("includes the caller's role", get.json?.data?.workspace?.role === "owner");

    const renamed = await call("PATCH", `/api/workspaces/${workspaceId}`, {
      token,
      body: { name: "Smoke Workspace" },
    });
    check("PATCH workspace -> 200", renamed.status === 200, renamed.text);
    check("name is updated", renamed.json?.data?.workspace?.name === "Smoke Workspace");

    const members = await call("GET", `/api/workspaces/${workspaceId}/members`, { token });
    check("GET members -> 200", members.status === 200, members.text);
    check("owner is the only member", (members.json?.data?.members || []).length === 1);

    const profile = await call("PATCH", "/api/auth/me", { token, body: { name: "Smoke Tester" } });
    check("PATCH /api/auth/me -> 200", profile.status === 200, profile.text);
    check("profile name is updated", profile.json?.data?.user?.name === "Smoke Tester");

    const badProfile = await call("PATCH", "/api/auth/me", { token, body: { email: "nope" } });
    check("PATCH /api/auth/me with a bad email -> 400", badProfile.status === 400, badProfile.text);

    const badId = await call("GET", "/api/workspaces/not-an-id", { token });
    check("malformed ObjectId -> 400", badId.status === 400, badId.text);
  }

  /* ---------- pages ---------- */
  console.log("\npages (nested hierarchy via parentPageId)");
  {
    const created = await call("POST", `/api/workspaces/${workspaceId}/pages`, {
      token,
      body: { title: "Engineering", icon: "\u{1F4E5}" },
    });
    check("POST page -> 201", created.status === 201, created.text);
    pageId = created.json?.data?.page?._id;
    check("root page has parentPageId null", created.json?.data?.page?.parentPageId === null);

    const child = await call("POST", `/api/workspaces/${workspaceId}/pages`, {
      token,
      body: { title: "API Documentation", parentPageId: pageId },
    });
    check("POST nested page -> 201", child.status === 201, child.text);
    childPageId = child.json?.data?.page?._id;
    check("nested page keeps parentPageId", child.json?.data?.page?.parentPageId === pageId);

    const list = await call("GET", `/api/workspaces/${workspaceId}/pages`, { token });
    check("GET workspace pages -> 200", list.status === 200, list.text);
    const listed = list.json?.data?.pages || [];
    check("lists both new pages", listed.some((p) => p._id === pageId) && listed.some((p) => p._id === childPageId), JSON.stringify(listed.map((p) => p.title)));
    check("new accounts get a starter page", listed.some((p) => p.title === "Getting Started"));

    const children = await call("GET", `/api/pages/${pageId}/children`, { token });
    check("GET page children -> 200", children.status === 200, children.text);
    check("child is nested under its parent", (children.json?.data?.pages || []).length === 1);

    const renamed = await call("PATCH", `/api/pages/${pageId}`, {
      token,
      body: { title: "Backend", isFavorite: true },
    });
    check("PATCH page -> 200", renamed.status === 200, renamed.text);
    check("title updated", renamed.json?.data?.page?.title === "Backend");
    check("isFavorite updated", renamed.json?.data?.page?.isFavorite === true);

    const noop = await call("PATCH", `/api/pages/${pageId}`, { token, body: {} });
    check("empty PATCH -> 400", noop.status === 400, noop.text);

    const cycle = await call("PATCH", `/api/pages/${pageId}`, {
      token,
      body: { parentPageId: childPageId },
    });
    check("nesting under a descendant -> 400", cycle.status === 400, cycle.text);

    const search = await call(
      "GET",
      `/api/workspaces/${workspaceId}/pages/search?q=${encodeURIComponent("Document")}`,
      { token }
    );
    check("GET page search -> 200", search.status === 200, search.text);
    check("finds the nested page", (search.json?.data?.pages || []).length === 1);

    const dup = await call("POST", `/api/pages/${pageId}/duplicate`, { token });
    check("POST duplicate -> 201", dup.status === 201, dup.text);
    check("copy is titled '... (copy)'", dup.json?.data?.page?.title === "Backend (copy)");
    await call("DELETE", `/api/pages/${dup.json?.data?.page?._id}`, { token });
  }

  /* ---------- blocks ---------- */
  console.log("\nblocks (one collection, many types)");
  {
    const paragraph = await call("POST", `/api/pages/${pageId}/blocks`, {
      token,
      body: { type: "paragraph", content: { text: "Hello world" }, position: 0 },
    });
    check("POST paragraph block -> 201", paragraph.status === 201, paragraph.text);
    check("stores content.text", paragraph.json?.data?.block?.content?.text === "Hello world");
    blockId = paragraph.json?.data?.block?._id;

    const todo = await call("POST", `/api/pages/${pageId}/blocks`, {
      token,
      body: { type: "todo", content: { text: "Finish project" }, properties: { checked: false }, position: 1 },
    });
    check("POST todo block -> 201", todo.status === 201, todo.text);
    const todoId = todo.json?.data?.block?._id;

    const list = await call("GET", `/api/pages/${pageId}/blocks`, { token });
    check("GET page blocks -> 200", list.status === 200, list.text);
    check("returns both blocks in position order", (list.json?.data?.blocks || []).length === 2);

    // Per-type extras belong in `properties` (see models/Block.js), because that
    // is where the frontend reads `checked` back from. Sending it inside
    // `content` is accepted but would be invisible to the client.
    const patched = await call("PATCH", `/api/blocks/${todoId}`, {
      token,
      body: { properties: { checked: true } },
    });
    check("PATCH block -> 200", patched.status === 200, patched.text);
    check("partial patch keeps the text", patched.json?.data?.block?.content?.text === "Finish project");
    check("partial patch applies the change", patched.json?.data?.block?.properties?.checked === true);
    check(
      "checked is not smuggled into content",
      patched.json?.data?.block?.content?.checked === undefined,
      JSON.stringify(patched.json?.data?.block?.content)
    );

    const reordered = await call("POST", `/api/pages/${pageId}/blocks/reorder`, {
      token,
      body: { orderedIds: [todoId, blockId] },
    });
    check("POST reorder -> 200", reordered.status === 200, reordered.text);
    check("new order is applied", reordered.json?.data?.blocks?.[0]?._id === todoId);

    const bogus = await call("POST", `/api/pages/${pageId}/blocks/reorder`, {
      token,
      body: { orderedIds: [todoId, "6abd0fb9f6b24ed1f0f22bc3"] },
    });
    check("reorder with a foreign block id -> 400", bogus.status === 400, bogus.text);

    const removed = await call("DELETE", `/api/blocks/${todoId}`, { token });
    check("DELETE block -> 200", removed.status === 200, removed.text);

    const search = await call(
      "GET",
      `/api/workspaces/${workspaceId}/blocks/search?q=${encodeURIComponent("Hello")}`,
      { token }
    );
    check("GET block search -> 200", search.status === 200, search.text);
    check("finds the paragraph", (search.json?.data?.results || []).length === 1);
  }

  /* ---------- dataTable ---------- */
  console.log("\ndataTable (one collection: table / board / calendar / roadmap)");
  {
    const created = await call("POST", `/api/pages/${pageId}/data-tables`, {
      token,
      body: {
        name: "Roadmap",
        properties: {
          Task: { type: "title" },
          Status: { type: "select", options: ["Todo", "In Progress", "Done"] },
          Priority: { type: "select", options: ["Low", "Medium", "High"] },
          "Start Date": { type: "date" },
          DueDate: { type: "date" },
          Completed: { type: "checkbox" },
        },
      },
    });
    check("POST data table -> 201", created.status === 201, created.text);
    dataTableId = created.json?.data?.dataTable?._id;
    check("starts with no rows", (created.json?.data?.dataTable?.rows || []).length === 0);

    const badProp = await call("POST", `/api/pages/${pageId}/data-tables`, {
      token,
      body: { name: "Bad", properties: { X: { type: "not_a_real_type" } } },
    });
    check("unknown property type -> 400", badProp.status === 400, badProp.text);

    const badOption = await call("POST", `/api/data-tables/${dataTableId}/rows`, {
      token,
      body: { Task: "Ship auth", Status: "Nope" },
    });
    check("select value outside options -> 400", badOption.status === 400, badOption.text);

    const row = await call("POST", `/api/data-tables/${dataTableId}/rows`, {
      token,
      body: { Task: "Ship auth", Status: "Done", Priority: "High", DueDate: "2026-09-30" },
    });
    check("POST row -> 201", row.status === 201, row.text);
    const rowId = row.json?.data?.row?.id;
    check("row gets an id", !!rowId);

    await call("POST", `/api/data-tables/${dataTableId}/rows`, {
      token,
      body: { Task: "Write editor", Status: "In Progress", Priority: "Medium" },
    });

    const patched = await call("PATCH", `/api/data-tables/${dataTableId}/rows/${rowId}`, {
      token,
      body: { values: { Status: "In Progress" } },
    });
    check("PATCH row -> 200", patched.status === 200, patched.text);
    check("partial row patch keeps other columns", patched.json?.data?.row?.Task === "Ship auth");
    check("partial row patch applies the change", patched.json?.data?.row?.Status === "In Progress");

    const list = await call("GET", `/api/pages/${pageId}/data-tables`, { token });
    check("GET page data tables -> 200", list.status === 200, list.text);
    check("returns the table", (list.json?.data?.dataTables || []).length === 1);

    const get = await call("GET", `/api/data-tables/${dataTableId}`, { token });
    check("GET data table -> 200", get.status === 200, get.text);
    check("all four views read the same rows", (get.json?.data?.dataTable?.rows || []).length === 2);

    // The block is only a pointer to the table; the rows stay here. This is the
    // contract js/blockRenderer.js + js/database.js rely on to mount the views.
    const dbBlock = await call("POST", `/api/pages/${pageId}/blocks`, {
      token,
      body: {
        type: "database",
        content: { text: "Roadmap" },
        properties: { dataTableId },
        position: 2,
      },
    });
    check("POST database block -> 201", dbBlock.status === 201, dbBlock.text);
    check(
      "database block stores the dataTable pointer in properties",
      dbBlock.json?.data?.block?.properties?.dataTableId === dataTableId,
      JSON.stringify(dbBlock.json?.data?.block?.properties)
    );
    const dbBlockId = dbBlock.json?.data?.block?._id;

    // Switching view is a PATCH on the same document, not a new collection.
    const viewSwitch = await call("PATCH", `/api/data-tables/${dataTableId}`, {
      token,
      body: { defaultView: "roadmap" },
    });
    check("PATCH defaultView -> 200", viewSwitch.status === 200, viewSwitch.text);
    check("view switch keeps the rows", (viewSwitch.json?.data?.dataTable?.rows || []).length === 2);
    const badView = await call("PATCH", `/api/data-tables/${dataTableId}`, {
      token,
      body: { defaultView: "gantt" },
    });
    check("unsupported defaultView -> 400", badView.status === 400, badView.text);

    // A second property PATCH must merge, not replace.
    const mergePatch = await call("PATCH", `/api/blocks/${dbBlockId}`, {
      token,
      body: { properties: { caption: "Q4" } },
    });
    check("second property patch merges", mergePatch.json?.data?.block?.properties?.dataTableId === dataTableId);
    check("and adds the new key", mergePatch.json?.data?.block?.properties?.caption === "Q4");
    await call("DELETE", `/api/blocks/${dbBlockId}`, { token });

    const deleted = await call("DELETE", `/api/data-tables/${dataTableId}/rows/${rowId}`, {
      token,
    });
    check("DELETE row -> 200", deleted.status === 200, deleted.text);
    const missing = await call("PATCH", `/api/data-tables/${dataTableId}/rows/${rowId}`, {
      token,
      body: { values: { Status: "Todo" } },
    });
    check("patching a deleted row -> 404", missing.status === 404, missing.text);
  }

  /* ---------- authorization ---------- */
  console.log("\nauthorization");
  {
    const other = await call("POST", "/api/auth/register", {
      body: {
        name: "Other User",
        email: `other-${crypto.randomBytes(6).toString("hex")}@lumen.test`,
        password,
      },
    });
    otherToken = other.json.data.token;
    otherWorkspaceId = other.json.data.workspace._id;
    otherEmail = other.json.data.user.email;

    const anon = await call("GET", `/api/workspaces/${workspaceId}/pages`);
    check("anonymous page list -> 401", anon.status === 401, anon.text);

    const foreign = await call("GET", `/api/workspaces/${workspaceId}/pages`, {
      token: otherToken,
    });
    check("another user's workspace pages -> 403", foreign.status === 403, foreign.text);

    const foreignPage = await call("GET", `/api/pages/${pageId}`, { token: otherToken });
    check("another user's page by id -> 403", foreignPage.status === 403, foreignPage.text);

    const foreignBlock = await call("PATCH", `/api/blocks/${blockId}`, {
      token: otherToken,
      body: { content: { text: "hacked" } },
    });
    check("another user's block -> 403", foreignBlock.status === 403, foreignBlock.text);

    const foreignTable = await call("GET", `/api/data-tables/${dataTableId}`, {
      token: otherToken,
    });
    check("another user's data table -> 403", foreignTable.status === 403, foreignTable.text);

    const crossWorkspaceParent = await call(
      "POST",
      `/api/workspaces/${otherWorkspaceId}/pages`,
      { token: otherToken, body: { title: "Bad graft", parentPageId: pageId } }
    );
    check("nesting under a foreign parent -> 403", crossWorkspaceParent.status === 403, crossWorkspaceParent.text);

    const unknown = await call("GET", "/api/pages/6abd0fb9f6b24ed1f0f22bc3", { token });
    check("unknown page -> 404", unknown.status === 404, unknown.text);

    const badRoute = await call("GET", "/api/nope", { token });
    check("unknown route -> 404", badRoute.status === 404, badRoute.text);
  }

  /* ---------- cascade delete ---------- */
  console.log("\ncascade delete");
  {
    const del = await call("DELETE", `/api/pages/${pageId}`, { token });
    check("DELETE page -> 200", del.status === 200, del.text);
    check("reports the subtree size", del.json?.data?.removedCount === 2, del.text);

    const childGone = await call("GET", `/api/pages/${childPageId}`, { token });
    check("descendant page is gone -> 404", childGone.status === 404, childGone.text);

    const blocksGone = await call("GET", `/api/pages/${pageId}/blocks`, { token });
    check("orphan blocks are gone -> 404", blocksGone.status === 404, blocksGone.text);

    const tablesGone = await call("GET", `/api/pages/${pageId}/data-tables`, { token });
    check("orphan data tables are gone -> 404", tablesGone.status === 404, tablesGone.text);
  }

  /* ---------- cleanup ---------- */
  console.log("\ncleanup");
  {
    const del = await call("DELETE", `/api/workspaces/${workspaceId}`, { token });
    check("DELETE workspace -> 200", del.status === 200, del.text);

    await call("DELETE", `/api/workspaces/${otherWorkspaceId}`, { token: otherToken });

    const { User, Workspace, WorkspaceMember, Page, Block, DataTable } = require("../models");
    const ownerId = await User.findOne({ email }).select("_id").lean();
    const otherOwner = await User.findOne({ email: otherEmail }).select("_id").lean();

    // Cascade delete must leave nothing orphaned inside the collections.
    const leftovers = {
      workspaces: await Workspace.countDocuments({ ownerId: { $in: [ownerId?._id, otherOwner?._id].filter(Boolean) } }),
      workspaceMembers: await WorkspaceMember.countDocuments({
        userId: { $in: [ownerId?._id, otherOwner?._id].filter(Boolean) },
      }),
      pages: await Page.countDocuments({ workspaceId: { $in: [workspaceId, otherWorkspaceId] } }),
      blocks: await Block.countDocuments({ pageId: { $in: [pageId, childPageId] } }),
      dataTable: await DataTable.countDocuments({ workspaceId: { $in: [workspaceId, otherWorkspaceId] } }),
    };
    const dirty = Object.entries(leftovers).filter(([, n]) => n > 0);
    check("cascade left no orphans", dirty.length === 0, JSON.stringify(leftovers));

    // The two test accounts are removed last.
    await User.deleteMany({ email: { $in: [email, otherEmail].filter(Boolean) } });
    const usersLeft = await User.countDocuments({ email: { $in: [email, otherEmail].filter(Boolean) } });
    check("test accounts removed", usersLeft === 0, `${usersLeft} left`);
  }
}

async function main() {
  await db.connect();

  const server = await new Promise((resolve) => {
    const s = app.listen(PORT, "127.0.0.1", () => resolve(s));
  });
  BASE = `http://127.0.0.1:${server.address().port}`;
  console.log(`\nsmoke test -> ${BASE}`);

  try {
    await run();
  } catch (err) {
    failed += 1;
    console.error("\nunexpected error:", err);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await db.disconnect();
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
}

main();
