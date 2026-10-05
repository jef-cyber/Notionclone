/**
 * Page routes.
 *   GET    /api/workspaces/:workspaceId/pages
 *   POST   /api/workspaces/:workspaceId/pages
 *   GET    /api/workspaces/:workspaceId/pages/search?q=
 *   GET    /api/workspaces/:workspaceId/blocks/search?q=
 *   GET    /api/pages/:pageId
 *   PATCH  /api/pages/:pageId
 *   DELETE /api/pages/:pageId
 *   POST   /api/pages/:pageId/duplicate
 *   GET    /api/pages/:pageId/children
 */
const router = require("express").Router();
const pageController = require("../controllers/page.controller");
const blockController = require("../controllers/block.controller");
const asyncHandler = require("../utils/asyncHandler");
const { requireAuth, requireWorkspaceRole } = require("../middleware/auth.middleware");

router.use(requireAuth);

// Workspace-scoped listings.
router.get(
  "/workspaces/:workspaceId/pages",
  requireWorkspaceRole("workspaceId", "viewer"),
  asyncHandler(pageController.list)
);
router.post(
  "/workspaces/:workspaceId/pages",
  requireWorkspaceRole("workspaceId", "member"),
  asyncHandler(pageController.create)
);
router.get(
  "/workspaces/:workspaceId/pages/search",
  requireWorkspaceRole("workspaceId", "viewer"),
  asyncHandler(pageController.search)
);
router.get(
  "/workspaces/:workspaceId/blocks/search",
  requireWorkspaceRole("workspaceId", "viewer"),
  asyncHandler(blockController.search)
);

// Page-scoped. These resolve the workspace from the page itself, so no
// workspaceId is needed in the URL.
router.get("/pages/:pageId", asyncHandler(pageController.getOne));
router.patch("/pages/:pageId", asyncHandler(pageController.update));
router.delete("/pages/:pageId", asyncHandler(pageController.remove));
router.post("/pages/:pageId/duplicate", asyncHandler(pageController.duplicate));
router.get("/pages/:pageId/children", asyncHandler(pageController.children));

module.exports = router;
