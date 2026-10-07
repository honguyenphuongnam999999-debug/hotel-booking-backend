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

      const checkUser = await pool.query(
    `
    SELECT
        EXISTS (
            SELECT 1
            FROM users
            WHERE email = $1
        ) AS email_exists,

        EXISTS (
            SELECT 1
            FROM users
            WHERE phone = $2
        ) AS phone_exists
    `,
    [email, phone]
);

const emailExists = checkUser.rows[0].email_exists;
const phoneExists = checkUser.rows[0].phone_exists;

console.log("CHECK REGISTER:", {
    email,
    phone,
    emailExists,
    phoneExists
});

if (emailExists && phoneExists) {
    return res.status(409).json({
        success: false,
        message: "Email và số điện thoại đã được sử dụng"
    });
}

if (emailExists) {
    return res.status(409).json({
        success: false,
        message: "Email đã được sử dụng"
    });
}

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