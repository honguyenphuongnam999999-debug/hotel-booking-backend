// Kiểm tra email
const existingEmail = await pool.query(
    "SELECT id FROM users WHERE email = $1",
    [email]
);

if (existingEmail.rows.length > 0) {
    return res.status(409).json({
        success: false,
        message: "Email đã được sử dụng"
    });
}

// Kiểm tra số điện thoại
const existingPhone = await pool.query(
    "SELECT id FROM users WHERE phone = $1",
    [phone]
);

if (existingPhone.rows.length > 0) {
    return res.status(409).json({
        success: false,
        message: "Số điện thoại đã được sử dụng"
    });
}