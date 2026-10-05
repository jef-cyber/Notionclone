/**
 * DataTable routes.
 *   GET    /api/pages/:pageId/data-tables
 *   POST   /api/pages/:pageId/data-tables
 *   GET    /api/data-tables/:dataTableId
 *   PATCH  /api/data-tables/:dataTableId
 *   DELETE /api/data-tables/:dataTableId
 *   POST   /api/data-tables/:dataTableId/rows
 *   PATCH  /api/data-tables/:dataTableId/rows/:rowId
 *   DELETE /api/data-tables/:dataTableId/rows/:rowId
 *
 * A kanban board, calendar, roadmap and table are all views over the same
 * DataTable, so there is no separate route or collection per view.
 */
const router = require("express").Router();
const controller = require("../controllers/dataTable.controller");
const asyncHandler = require("../utils/asyncHandler");
const { requireAuth } = require("../middleware/auth.middleware");

router.use(requireAuth);

router.get("/pages/:pageId/data-tables", asyncHandler(controller.list));
router.post("/pages/:pageId/data-tables", asyncHandler(controller.create));

router.get("/data-tables/:dataTableId", asyncHandler(controller.getOne));
router.patch("/data-tables/:dataTableId", asyncHandler(controller.update));
router.delete("/data-tables/:dataTableId", asyncHandler(controller.remove));

router.post("/data-tables/:dataTableId/rows", asyncHandler(controller.addRow));
router.patch("/data-tables/:dataTableId/rows/:rowId", asyncHandler(controller.updateRow));
router.delete("/data-tables/:dataTableId/rows/:rowId", asyncHandler(controller.deleteRow));

module.exports = router;
