/**
 * Central model registry.
 *
 * Every model is required here once, and each is pinned to its canonical
 * MongoDB collection name. Mongoose's default pluralizer would otherwise turn
 * "WorkspaceMember" into "workspacemembers" and "DataTable" into "datatables",
 * so each `model()` call passes the collection name explicitly.
 *
 * assertCollectionNames() runs at boot and throws if any model ever drifts away
 * from its canonical name — a hard failure is much better than silently
 * writing to a stray collection.
 */
const { COLLECTIONS } = require("../config/constants");

const User = require("./User"); // -> users
const Workspace = require("./Workspace"); // -> workspaces
const WorkspaceMember = require("./WorkspaceMember"); // -> workspaceMembers
const Page = require("./Page"); // -> pages
const Block = require("./Block"); // -> blocks
const DataTable = require("./DataTable"); // -> dataTable

const models = { User, Workspace, WorkspaceMember, Page, Block, DataTable };

const expected = {
  User: COLLECTIONS.users,
  Workspace: COLLECTIONS.workspaces,
  WorkspaceMember: COLLECTIONS.workspaceMembers,
  Page: COLLECTIONS.pages,
  Block: COLLECTIONS.blocks,
  DataTable: COLLECTIONS.dataTable,
};

function assertCollectionNames() {
  const wrong = Object.entries(expected)
    .filter(([name, collection]) => models[name].collection.name !== collection)
    .map(
      ([name, collection]) =>
        `${name} -> "${models[name].collection.name}" (expected "${collection}")`
    );

  if (wrong.length) {
    throw new Error(
      `Mongoose collection name mismatch. Refusing to start:\n  ${wrong.join("\n  ")}`
    );
  }
}

module.exports = { ...models, assertCollectionNames, expected };
