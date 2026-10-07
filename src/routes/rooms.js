const express = require("express");
const pool = require("../config/db");
const router = express.Router();
const validDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) && !Number.isNaN(Date.parse(v));

router.get("/available", async (req, res) => {
  const { hotel_id, room_type_id, check_in, check_out } = req.query;
  if (!hotel_id || !validDate(check_in) || !validDate(check_out) || check_out <= check_in) return res.status(400).json({ success: false, message: "hotel_id and valid check_in/check_out dates are required; check_out must be later" });
  try {
    const { rows } = await pool.query(`SELECT r.id,r.hotel_id,r.room_type_id,r.room_number,r.status,rt.name AS room_type_name,rt.max_guests,rt.base_price FROM rooms r JOIN room_types rt ON rt.id=r.room_type_id WHERE r.hotel_id=$1 AND r.status='active' AND ($2::varchar IS NULL OR r.room_type_id=$2) AND NOT EXISTS (SELECT 1 FROM booking_rooms br JOIN bookings b ON b.id=br.booking_id WHERE br.room_id=r.id AND b.status <> 'cancelled' AND b.check_in < $4::date AND b.check_out > $3::date) ORDER BY r.room_number`, [hotel_id, room_type_id || null, check_in, check_out]);
    res.json({ success: true, data: rows });
  } catch(e) { console.error(e); res.status(500).json({ success:false,message:"Unable to find available rooms" }); }
});
router.get("/", async (req,res)=>{
  const allowed = ["hotel_id","room_type_id","status"]; const clauses=[]; const values=[];
  for (const key of allowed) if (req.query[key]) { values.push(req.query[key]); clauses.push(`${key}=$${values.length}`); }
  try { const {rows}=await pool.query(`SELECT id,hotel_id,room_type_id,room_number,status FROM rooms ${clauses.length?`WHERE ${clauses.join(" AND ")}`:""} ORDER BY room_number`,values); res.json({success:true,data:rows}); }
  catch(e){console.error(e);res.status(500).json({success:false,message:"Unable to get rooms"});}
});
router.get("/:id",async(req,res)=>{try{const {rows}=await pool.query("SELECT id,hotel_id,room_type_id,room_number,status FROM rooms WHERE id=$1",[req.params.id]);if(!rows.length)return res.status(404).json({success:false,message:"Room not found"});res.json({success:true,data:rows[0]});}catch(e){console.error(e);res.status(500).json({success:false,message:"Unable to get room"});}});
module.exports=router;
