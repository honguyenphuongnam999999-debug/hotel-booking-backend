const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { requireAuth } = require("../middleware/auth");

const PUBLIC_USER_COLUMNS = "id, email, full_name, phone, avatar, created_at";

function getRequestBody(req) {
    return req.body && typeof req.body === "object" && !Array.isArray(req.body)
        ? req.body
        : {};
}

function conflictResponse(emailExists, phoneExists) {
    const errors = {};
    if (emailExists) errors.email = "Email đã được sử dụng.";
    if (phoneExists) errors.phone = "Số điện thoại đã được sử dụng.";

    let message = "Thông tin đăng ký đã tồn tại.";
    if (emailExists && phoneExists) {
        message = "Email và số điện thoại đã được sử dụng.";
    } else if (emailExists) {
        message = errors.email;
    } else if (phoneExists) {
        message = errors.phone;
    }

    return { success: false, message, errors };
}

async function findConflictingUser(email, phone) {
    const result = await pool.query(
        `SELECT
            EXISTS (SELECT 1 FROM users WHERE LOWER(email) = $1) AS email_exists,
            EXISTS (SELECT 1 FROM users WHERE phone = $2) AS phone_exists`,
        [email, phone]
    );
    return result.rows[0] || { email_exists: false, phone_exists: false };
}

router.post("/register", async (req, res) => {
    const body = getRequestBody(req);
    let { email, password, full_name, phone } = body;

    if (
        typeof email !== "string" ||
        typeof password !== "string" ||
        typeof full_name !== "string" ||
        typeof phone !== "string" ||
        !email.trim() ||
        !password ||
        !full_name.trim() ||
        !phone.trim()
    ) {
        return res.status(400).json({
            success: false,
            message: "Vui lòng nhập đầy đủ họ tên, email, số điện thoại và mật khẩu."
        });
    }

    email = email.trim().toLowerCase();
    full_name = full_name.trim();
    phone = phone.trim();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ success: false, message: "Email không hợp lệ." });
    }
    if (password.length < 8) {
        return res.status(400).json({
            success: false,
            message: "Mật khẩu phải có ít nhất 8 ký tự."
        });
    }

    try {
        const existing = await findConflictingUser(email, phone);
        if (existing.email_exists || existing.phone_exists) {
            return res.status(409).json(
                conflictResponse(existing.email_exists, existing.phone_exists)
            );
        }

        const passwordHash = await bcrypt.hash(password, 12);
        const result = await pool.query(
            `INSERT INTO users (email, password_hash, full_name, phone, created_at)
             VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
             RETURNING ${PUBLIC_USER_COLUMNS}`,
            [email, passwordHash, full_name, phone]
        );

        return res.status(201).json({
            success: true,
            message: "Đăng ký thành công.",
            user: result.rows[0]
        });
    } catch (error) {
        // If concurrent requests passed the pre-check, identify which unique
        // values now conflict instead of depending on database constraint names.
        if (error.code === "23505") {
            try {
                const existing = await findConflictingUser(email, phone);
                return res.status(409).json(
                    conflictResponse(existing.email_exists, existing.phone_exists)
                );
            } catch (lookupError) {
                console.error("REGISTER CONFLICT LOOKUP ERROR:", lookupError.code || "unknown");
                return res.status(409).json({
                    success: false,
                    message: "Thông tin tài khoản đã tồn tại."
                });
            }
        }

        console.error("REGISTER ERROR:", error.code || "unknown");
        return res.status(500).json({
            success: false,
            message: "Đăng ký thất bại. Vui lòng thử lại."
        });
    }
});

router.post("/login", async (req, res) => {
    const { email, password } = getRequestBody(req);
    if (typeof email !== "string" || !email.trim() || typeof password !== "string" || !password) {
        return res.status(400).json({
            success: false,
            message: "Vui lòng nhập email và mật khẩu."
        });
    }
    if (!process.env.JWT_SECRET) {
        console.error("LOGIN ERROR: JWT_SECRET is not configured");
        return res.status(500).json({ success: false, message: "Đăng nhập thất bại." });
    }

    try {
        const result = await pool.query(
            `SELECT id, email, full_name, phone, avatar, created_at, password_hash
             FROM users WHERE LOWER(email) = $1 LIMIT 1`,
            [email.trim().toLowerCase()]
        );
        const user = result.rows[0];
        const passwordMatches = user && typeof user.password_hash === "string"
            ? await bcrypt.compare(password, user.password_hash).catch(() => false)
            : false;

        if (!passwordMatches) {
            return res.status(401).json({ success: false, message: "Email hoặc mật khẩu không chính xác." });
        }

        await pool.query("UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1", [user.id]);
        const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: "7d" });
        const { password_hash, ...publicUser } = user;
        return res.status(200).json({ success: true, token, data: publicUser });
    } catch (error) {
        console.error("LOGIN ERROR:", error.code || "unknown");
        return res.status(500).json({ success: false, message: "Đăng nhập thất bại." });
    }
});

router.post("/logout", requireAuth, (req, res) => {
    return res.status(200).json({
        success: true,
        message: "Đăng xuất thành công. Vui lòng xóa token khỏi thiết bị."
    });
});

router.get("/me", requireAuth, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT ${PUBLIC_USER_COLUMNS} FROM users WHERE id = $1`,
            [req.user.id]
        );
        if (!result.rows.length) {
            return res.status(404).json({ success: false, message: "Không tìm thấy người dùng." });
        }
        return res.status(200).json({ success: true, data: result.rows[0] });
    } catch (error) {
        console.error("AUTH PROFILE ERROR:", error.code || "unknown");
        return res.status(500).json({ success: false, message: "Không thể lấy thông tin người dùng." });
    }
});

module.exports = router;
