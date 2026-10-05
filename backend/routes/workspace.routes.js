/**
 * Workspace and membership routes.
 *   GET    /api/workspaces
 *   POST   /api/workspaces
 *   GET    /api/workspaces/:workspaceId
 *   PATCH  /api/workspaces/:workspaceId
 *   DELETE /api/workspaces/:workspaceId
 *   GET    /api/workspaces/:workspaceId/members
 *   POST   /api/workspaces/:workspaceId/members
 *   PATCH  /api/workspaces/:workspaceId/members/:memberId
 *   DELETE /api/workspaces/:workspaceId/members/:memberId
 *
 * The requireWorkspaceRole guard re-derives access from the caller's
 * membership record; it never trusts a client-supplied userId.
 */
const router = require("express").Router();
const controller = require("../controllers/workspace.controller");
const asyncHandler = require("../utils/asyncHandler");
const { requireAuth, requireWorkspaceRole } = require("../middleware/auth.middleware");

router.use(requireAuth);

router.get("/", asyncHandler(controller.list));
router.post("/", asyncHandler(controller.create));

router.get("/:workspaceId", requireWorkspaceRole("workspaceId", "viewer"), asyncHandler(controller.getOne));
router.patch(
  "/:workspaceId",
  requireWorkspaceRole("workspaceId", "admin"),
  asyncHandler(controller.update)
);
router.delete(
  "/:workspaceId",
  requireWorkspaceRole("workspaceId", "owner"),
  asyncHandler(controller.remove)
);

router.get(
  "/:workspaceId/members",
  requireWorkspaceRole("workspaceId", "viewer"),
  asyncHandler(controller.listMembers)
);
router.post(
  "/:workspaceId/members",
  requireWorkspaceRole("workspaceId", "admin"),
  asyncHandler(controller.addMember)
);
router.patch(
  "/:workspaceId/members/:memberId",
  requireWorkspaceRole("workspaceId", "admin"),
  asyncHandler(controller.updateMember)
);
router.delete(
  "/:workspaceId/members/:memberId",
  requireWorkspaceRole("workspaceId", "admin"),
  asyncHandler(controller.removeMember)
);

module.exports = router;
