const express = require("express");
const router = express.Router();
const pool = require("../config/db");

// ================================
// REGISTER
// ================================
router.post("/register", async (req, res) => {
    try {
        const { email, password, full_name, phone } = req.body;

        // Kiểm tra dữ liệu bắt buộc
        if (!email || !password || !full_name || !phone) {
            return res.status(400).json({
                success: false,
                message: "Vui lòng nhập đầy đủ email, password, họ tên và số điện thoại"
            });
        }

        // ================================
// KIỂM TRA EMAIL + SỐ ĐIỆN THOẠI
// ================================

const existingEmail = await pool.query(
    "SELECT id FROM users WHERE email = $1",
    [email]
);

const existingPhone = await pool.query(
    "SELECT id FROM users WHERE phone = $1",
    [phone]
);

const emailExists = existingEmail.rows.length > 0;
const phoneExists = existingPhone.rows.length > 0;

// Cả email và số điện thoại đều trùng
if (emailExists && phoneExists) {
    return res.status(409).json({
        success: false,
        message: "Email và số điện thoại đã được sử dụng"
    });
}

// Chỉ email trùng
if (emailExists) {
    return res.status(409).json({
        success: false,
        message: "Email đã được sử dụng"
    });
}

// Chỉ số điện thoại trùng
if (phoneExists) {
    return res.status(409).json({
        success: false,
        message: "Số điện thoại đã được sử dụng"
    });
}

        // ================================
        // TẠO USER
        // ================================
        const result = await pool.query(
            `
            INSERT INTO users
                (email, password, full_name, phone, created_at)
            VALUES
                ($1, $2, $3, $4, CURRENT_TIMESTAMP)
            RETURNING id, email, full_name, phone, created_at
            `,
            [email, password, full_name, phone]
        );

        return res.status(201).json({
            success: true,
            message: "Đăng ký thành công",
            user: result.rows[0]
        });

    } catch (error) {
        console.error("REGISTER ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Đăng ký thất bại"
        });
    }
});

module.exports = router;