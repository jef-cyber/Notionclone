/**
 * Starter content for a brand-new workspace.
 *
 * A new account should not open onto an empty screen. This creates one page
 * and a small data table, using only the pages and dataTable collections —
 * no extra collections and no new models.
 */
const { Page, Block, DataTable } = require("../models");

const PAGE = {
  title: "Getting Started",
  icon: "\uD83D\uDCDD",
  blocks: [
    { type: "paragraph", content: { text: "Welcome to Lumen. This page is yours \u2014 edit it, delete it, or ignore it." } },
    { type: "heading2", content: { text: "Try these" } },
    { type: "todo", content: { text: "Click a line and start typing", properties: { checked: false } } },
    { type: "todo", content: { text: "Type / in an empty block to insert a heading, list, quote, code, or a database", properties: { checked: false } } },
    { type: "todo", content: { text: "Drag a page in the sidebar to nest it under another", properties: { checked: false } } },
    { type: "todo", content: { text: "Search with Ctrl/Cmd + K \u2014 it looks inside page content too", properties: { checked: false } } },
    { type: "heading2", content: { text: "How your data is stored" } },
    { type: "paragraph", content: { text: "Everything lives in six MongoDB collections: users, workspaces, workspaceMembers, pages, blocks, and dataTable. Pages nest through parentPageId, and a table, board, calendar, and roadmap are all just different views of the same dataTable rows." } },
  ],
};

const TABLE = {
  name: "Sprint Board",
  description: "A kanban board, calendar, and table are four views of these same rows.",
  defaultView: "board",
  properties: {
    Task: { type: "title" },
    Status: { type: "select", options: ["Todo", "In Progress", "Done"] },
    Priority: { type: "select", options: ["Low", "Medium", "High"] },
    StartDate: { type: "date" },
    DueDate: { type: "date" },
    Completed: { type: "checkbox" },
  },
  rows: [
    { Task: "Explore the editor", Status: "Done", Priority: "Medium", Completed: true },
    { Task: "Build a kanban board", Status: "In Progress", Priority: "High", Completed: false },
    { Task: "Share the workspace", Status: "Todo", Priority: "Low", Completed: false },
  ],
};

/**
 * @param {string} workspaceId
 * @param {string} userId
 * @returns {Promise<{page: object, dataTable: object}>}
 */
async function seedWorkspace(workspaceId, userId) {
  const page = await Page.create({
    workspaceId,
    parentPageId: null,
    title: PAGE.title,
    icon: PAGE.icon,
    createdBy: userId,
    position: 0,
  });

  await Block.insertMany(
    PAGE.blocks.map((block, index) =>
      Object.assign(
        {
          pageId: page._id,
          parentBlockId: null,
          position: index,
          createdBy: userId,
        },
        block
      )
    )
  );

  const dataTable = await DataTable.create(
    Object.assign(
      {
        workspaceId,
        pageId: page._id,
        createdBy: userId,
        rows: TABLE.rows.map((values, i) => Object.assign({ id: `row_seed_${i}` }, values)),
      },
      TABLE
    )
  );

  return { page, dataTable };
}

module.exports = { seedWorkspace };
