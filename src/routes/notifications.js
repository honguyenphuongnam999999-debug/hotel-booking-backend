const express = require("express");
const pool = require("../config/db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

router.get("/", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT id,user_id,booking_id,title,content,type,created_at,is_read FROM notifications WHERE user_id=$1 ORDER BY created_at DESC",
      [req.user.id]
    );
    return res.json({ success: true, data: rows });
  } catch (error) {
    console.error("Unable to get notifications:", error);
    return res.status(500).json({ success: false, message: "Unable to get notifications" });
  }
});

module.exports = router;
