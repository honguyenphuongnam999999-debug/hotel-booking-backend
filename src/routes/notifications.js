const express = require("express");
const { requireAuth } = require("../middleware/auth");
const { listNotificationsForUser } = require("../services/notificationService");

const router = express.Router();
router.use(requireAuth);

router.get("/", async (req, res) => {
  try {
    const rows = await listNotificationsForUser(req.user.id);
    return res.json({ success: true, data: rows });
  } catch (error) {
    console.error("Unable to get notifications:", {
      operation: error.operation || "list_user_notifications",
      table: error.table || "notifications",
      column: error.column || null,
      code: error.code || "DB_ERROR",
      message: error.message,
    });
    return res.status(500).json({ success: false, message: "Unable to get notifications" });
  }
});

module.exports = router;
