const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const { requireAuth } = require("../middleware/auth");


// PUT /api/guests/:id
router.put("/:id", requireAuth, async (req, res) => {
    try {
        const { id } = req.params;

        const {
            full_name,
            phone,
            email,
            identification_info
        } = req.body;

        // Kiểm tra guest thuộc booking của user
        const check = await pool.query(`
            SELECT g.id
            FROM guests g
            JOIN bookings b ON b.id = g.booking_id
            WHERE g.id = $1
              AND b.user_id = $2
        `, [id, req.user.id]);

        if (check.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Không tìm thấy khách"
            });
        }

        const result = await pool.query(`
            UPDATE guests
            SET
                full_name = COALESCE($1, full_name),
                phone = COALESCE($2, phone),
                email = COALESCE($3, email),
                identification_info = COALESCE($4, identification_info)
            WHERE id = $5
            RETURNING *
        `, [
            full_name,
            phone,
            email,
            identification_info,
            id
        ]);

        res.json({
            success: true,
            message: "Cập nhật thông tin khách thành công",
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


// DELETE /api/guests/:id
router.delete("/:id", requireAuth, async (req, res) => {
    try {
        const { id } = req.params;

        const check = await pool.query(`
            SELECT g.id
            FROM guests g
            JOIN bookings b ON b.id = g.booking_id
            WHERE g.id = $1
              AND b.user_id = $2
        `, [id, req.user.id]);

        if (check.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Không tìm thấy khách"
            });
        }

        await pool.query(`
            DELETE FROM guests
            WHERE id = $1
        `, [id]);

        res.json({
            success: true,
            message: "Xóa khách thành công"
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