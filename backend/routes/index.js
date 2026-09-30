/**
 * API router — mounts every versioned resource under /api.
 */
const router = require("express").Router();

router.get("/health", (_req, res) => {
  res.json({
    success: true,
    data: {
      status: "ok",
      collections: ["users", "workspaces", "workspaceMembers", "pages", "blocks", "dataTable"],
    },
  });
});

router.use("/auth", require("./auth.routes"));
router.use("/workspaces", require("./workspace.routes"));
router.use("/", require("./page.routes"));
router.use("/", require("./block.routes"));
router.use("/", require("./dataTable.routes"));

module.exports = router;
