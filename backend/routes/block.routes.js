/**
 * Block routes.
 *   GET    /api/pages/:pageId/blocks
 *   POST   /api/pages/:pageId/blocks
 *   POST   /api/pages/:pageId/blocks/reorder
 *   GET    /api/blocks/:blockId
 *   PATCH  /api/blocks/:blockId
 *   DELETE /api/blocks/:blockId
 */
const router = require("express").Router();
const controller = require("../controllers/block.controller");
const asyncHandler = require("../utils/asyncHandler");
const { requireAuth } = require("../middleware/auth.middleware");

router.use(requireAuth);

router.get("/pages/:pageId/blocks", asyncHandler(controller.list));
router.post("/pages/:pageId/blocks", asyncHandler(controller.create));
router.post("/pages/:pageId/blocks/reorder", asyncHandler(controller.reorder));

router.get("/blocks/:blockId", asyncHandler(controller.getOne));
router.patch("/blocks/:blockId", asyncHandler(controller.update));
router.delete("/blocks/:blockId", asyncHandler(controller.remove));

module.exports = router;
