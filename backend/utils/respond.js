/**
 * Consistent success envelope, so the frontend has one response shape:
 *   { "success": true, "data": ... }
 */
function ok(res, data, status = 200) {
  return res.status(status).json({ success: true, data });
}

module.exports = { ok };
