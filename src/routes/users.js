const express = require("express");
const pool = require("../config/db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.get("/search", requireAuth, async (req, res) => {
  const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (!query) return res.status(400).json({ success: false, message: "Please enter a search term" });
  try {
    const { rows } = await pool.query(
      "SELECT id,full_name,avatar FROM users WHERE id<>$1 AND full_name ILIKE $2 ORDER BY full_name LIMIT 20",
      [req.user.id, `%${query}%`]
    );
    return res.json({ success: true, data: rows });
  } catch (error) {
    console.error("User search failed:", error.code || "DB_ERROR");
    return res.status(500).json({ success: false, message: "Unable to search users" });
  }
});

router.get("/me", requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT id,email,full_name,phone,avatar,is_private,created_at FROM users WHERE id=$1",
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: "User not found" });
    return res.json({ success: true, data: rows[0] });
  } catch (error) {
    console.error("Profile retrieval failed:", error.code || "DB_ERROR");
    return res.status(500).json({ success: false, message: "Unable to get profile" });
  }
});

router.put("/me", requireAuth, async (req, res) => {
  const allowed = ["full_name", "phone", "avatar", "is_private"];
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body) || Object.keys(req.body).some((key) => !allowed.includes(key))) {
    return res.status(400).json({ success: false, message: "Only full_name, phone, avatar, and is_private can be updated" });
  }
  if (req.body.is_private !== undefined && typeof req.body.is_private !== "boolean") {
    return res.status(400).json({ success: false, message: "is_private must be a boolean" });
  }
  const { full_name, phone, avatar, is_private: isPrivate } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE users SET full_name=COALESCE($1,full_name), phone=COALESCE($2,phone),
       avatar=COALESCE($3,avatar), is_private=COALESCE($4,is_private)
       WHERE id=$5 RETURNING id,email,full_name,phone,avatar,is_private,created_at`,
      [full_name ?? null, phone ?? null, avatar ?? null, isPrivate ?? null, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: "User not found" });
    return res.json({ success: true, data: rows[0] });
  } catch (error) {
    console.error("Profile update failed:", error.code || "DB_ERROR");
    return res.status(500).json({ success: false, message: "Unable to update profile" });
  }
});

module.exports = router;
