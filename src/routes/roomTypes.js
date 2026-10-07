const express = require("express");
const router = express.Router();
const pool = require("../config/db");

// GET /api/room-types/:id
router.get("/:id", async (req, res) => {
    try {
        const { id } = req.params;

        const result = await pool.query(`
            SELECT
                rt.id,
                rt.hotel_id,
                rt.name,
                rt.description,
                rt.max_guests,
                rt.base_price
            FROM room_types rt
            WHERE rt.id = $1
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Không tìm thấy loại phòng"
            });
        }

        res.json({
            success: true,
            data: result.rows[0]
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: "Lỗi server"
        });
    }
});


// GET /api/room-types/:id/images
router.get("/:id/images", async (req, res) => {
    try {
        const { id } = req.params;

        const result = await pool.query(`
            SELECT
                id,
                room_type_id,
                image_url,
                ordering
            FROM room_type_images
            WHERE room_type_id = $1
            ORDER BY ordering ASC
        `, [id]);

        res.json({
            success: true,
            data: result.rows
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: "Lỗi server"
        });
    }
});


// GET /api/room-types/:id/rooms
router.get("/:id/rooms", async (req, res) => {
    try {
        const { id } = req.params;

        const result = await pool.query(`
            SELECT
                r.id,
                r.hotel_id,
                r.room_type_id,
                r.room_number,
                r.status
            FROM rooms r
            WHERE r.room_type_id = $1
            ORDER BY r.room_number
        `, [id]);

        res.json({
            success: true,
            data: result.rows
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: "Lỗi server"
        });
    }
});

module.exports = router;