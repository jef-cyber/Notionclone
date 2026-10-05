/**
 * Auth routes.
 *   POST  /api/auth/register
 *   POST  /api/auth/login
 *   POST  /api/auth/logout
 *   GET   /api/auth/me
 *   PATCH /api/auth/me
 */
const router = require("express").Router();
const controller = require("../controllers/auth.controller");
const asyncHandler = require("../utils/asyncHandler");
const { requireAuth } = require("../middleware/auth.middleware");

router.post("/register", asyncHandler(controller.register));
router.post("/login", asyncHandler(controller.login));
router.post("/logout", asyncHandler(controller.logout));
router.get("/me", requireAuth, asyncHandler(controller.me));
router.patch("/me", requireAuth, asyncHandler(controller.updateMe));

module.exports = router;
