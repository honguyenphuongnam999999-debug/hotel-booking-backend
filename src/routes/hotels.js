const express = require("express");
const pool = require("../config/db");
const { optionalAuth } = require("../middleware/auth");
const { requireAuth } = require("../middleware/auth");
const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT id,name,description,address,city,latitude,longitude,star_rating,created_at FROM hotels ORDER BY id");
    res.json({ success: true, data: rows });
  } catch (e) { console.error(e); res.status(500).json({ success: false, message: "Unable to get hotels" }); }
});
router.get("/:id/images", async (req, res) => {
  try { const { rows } = await pool.query("SELECT id,hotel_id,image_url,ordering FROM hotel_images WHERE hotel_id=$1 ORDER BY ordering", [req.params.id]); res.json({ success: true, data: rows }); }
  catch (e) { console.error(e); res.status(500).json({ success: false, message: "Unable to get hotel images" }); }
});
router.get("/:id/amenities", async (req, res) => {
  try { const { rows } = await pool.query("SELECT a.id,a.name,a.description FROM amenities a JOIN hotel_amenities ha ON ha.amenity_id=a.id WHERE ha.hotel_id=$1 ORDER BY a.name", [req.params.id]); res.json({ success: true, data: rows }); }
  catch (e) { console.error(e); res.status(500).json({ success: false, message: "Unable to get hotel amenities" }); }
});
router.get("/:id/vibes", async (req, res) => {
  try { const { rows } = await pool.query("SELECT v.id,v.name,v.description FROM vibe_tags v JOIN hotel_vibes hv ON hv.vibe_id=v.id WHERE hv.hotel_id=$1 ORDER BY v.name", [req.params.id]); res.json({ success: true, data: rows }); }
  catch (e) { console.error(e); res.status(500).json({ success: false, message: "Unable to get hotel vibes" }); }
});
router.get("/:id/room-types", async (req, res) => {
  try { const { rows } = await pool.query("SELECT id,hotel_id,name,description,max_guests,base_price FROM room_types WHERE hotel_id=$1 ORDER BY name", [req.params.id]); res.json({ success: true, data: rows }); }
  catch (e) { console.error(e); res.status(500).json({ success: false, message: "Unable to get room types" }); }
});
router.get("/:id/reviews", optionalAuth, async (req, res) => {
  try { const { rows } = await pool.query("SELECT r.id,r.user_id,r.hotel_id,r.booking_id,r.rating,r.comment,r.created_at,u.full_name,u.avatar FROM reviews r JOIN users u ON u.id=r.user_id WHERE r.hotel_id=$1 ORDER BY r.created_at DESC", [req.params.id]); res.json({ success: true, data: rows }); }
  catch (e) { console.error(e); res.status(500).json({ success: false, message: "Unable to get hotel reviews" }); }
});
router.post("/:id/reviews", requireAuth, async (req, res) => {
  const { booking_id, rating, comment } = req.body;
  if (!booking_id || !Number.isInteger(Number(rating)) || Number(rating) < 1 || Number(rating) > 5) return res.status(400).json({ success: false, message: "booking_id and rating from 1 to 5 are required" });
  try {
    const booking = await pool.query("SELECT id FROM bookings WHERE id=$1 AND hotel_id=$2 AND user_id=$3 AND status IN ('completed','checked_in')", [booking_id, req.params.id, req.user.id]);
    if (!booking.rows.length) return res.status(403).json({ success: false, message: "A completed booking owned by this user is required" });
    const reviewId = "REV" + require("crypto").randomUUID().replace(/-/g, "").slice(0, 17);
    const { rows } = await pool.query("INSERT INTO reviews(id,user_id,hotel_id,booking_id,rating,comment) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,user_id,hotel_id,booking_id,rating,comment,created_at", [reviewId, req.user.id, req.params.id, booking_id, Number(rating), comment || null]);
    res.status(201).json({ success: true, data: rows[0] });
  } catch (e) { if (e.code === "23505") return res.status(409).json({ success: false, message: "This booking already has a review" }); console.error(e); res.status(500).json({ success: false, message: "Unable to create review" }); }
});
router.get("/:id", async (req, res) => {
  try { const { rows } = await pool.query("SELECT id,name,description,address,city,latitude,longitude,star_rating,created_at FROM hotels WHERE id=$1", [req.params.id]); if (!rows.length) return res.status(404).json({ success: false, message: "Hotel not found" }); res.json({ success: true, data: rows[0] }); }
  catch (e) { console.error(e); res.status(500).json({ success: false, message: "Unable to get hotel" }); }
});
module.exports = router;
