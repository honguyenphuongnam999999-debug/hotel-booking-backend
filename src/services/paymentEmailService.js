const nodemailer = require("nodemailer");

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function formatDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? ""));
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "Chưa có thông tin";
}

function createTransporter() {
  const port = positiveInteger(process.env.SMTP_PORT, 587);
  const secureSetting = process.env.SMTP_SECURE?.trim().toLowerCase();
  const secure = secureSetting === undefined || secureSetting === ""
    ? port === 465
    : ["true", "1", "yes"].includes(secureSetting);

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port,
    secure,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_APP_PASSWORD || process.env.SMTP_PASSWORD,
    },
    connectionTimeout: positiveInteger(process.env.SMTP_CONNECTION_TIMEOUT_MS, 10000),
    socketTimeout: positiveInteger(process.env.SMTP_SOCKET_TIMEOUT_MS, 20000),
  });
}

async function sendPaymentSuccessEmail({ to, customerName, bookingCode, paymentId, amount, hotelName, roomTypes, checkIn, checkOut, paymentStatus }) {
  if (process.env.EMAIL_ENABLED?.trim().toLowerCase() === "false") {
    const error = new Error("Email sending is disabled");
    error.code = "EMAIL_DISABLED";
    throw error;
  }

  const recipient = typeof to === "string" ? to.trim() : "";
  if (!recipient || recipient.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
    const error = new Error("A valid booking email is required");
    error.code = "BOOKING_EMAIL_INVALID";
    throw error;
  }
  const smtpUser = process.env.SMTP_USER;
  const smtpPassword = process.env.SMTP_APP_PASSWORD || process.env.SMTP_PASSWORD;
  if (!smtpUser || !smtpPassword) {
    const error = new Error("SMTP configuration is missing");
    error.code = "SMTP_CONFIG_MISSING";
    throw error;
  }
  if (paymentStatus !== "paid") {
    const error = new Error("Payment must be successful before sending confirmation email");
    error.code = "PAYMENT_NOT_PAID";
    throw error;
  }

  const booking = escapeHtml(bookingCode || "Chưa có thông tin");
  const payment = escapeHtml(paymentId || "Chưa có thông tin");
  const name = escapeHtml(customerName || "Quý khách");
  const hotel = escapeHtml(hotelName || "Chưa có thông tin");
  const rooms = escapeHtml(roomTypes || "Chưa có thông tin loại phòng");
  const arrival = escapeHtml(formatDate(checkIn));
  const departure = escapeHtml(formatDate(checkOut));
  const numericAmount = Number(amount);
  const money = Number.isFinite(numericAmount)
    ? new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(numericAmount)
    : "Chưa có thông tin";
  const paymentState = "Đã thanh toán (mô phỏng)";
  const html = `<!doctype html>
<html lang="vi"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:#203047;background:#f2f5f8">
  <main style="max-width:600px;margin:auto;background:#fff;padding:24px;border-radius:12px">
    <p style="margin:0 0 18px;padding:10px 12px;border-radius:6px;background:#fff4d6;color:#805b00;font-size:14px"><strong>[TEST/SANDBOX]</strong> Đây là giao dịch kiểm thử, không phải xác nhận thanh toán thật.</p>
    <h1 style="margin:0 0 16px;color:#17324d;font-size:24px">Thông báo thanh toán</h1>
    <p>Xin chào ${name},</p>
    <p>Thông tin đặt phòng trong môi trường kiểm thử:</p>
    <div style="line-height:1.65">
      <p><strong>Mã đặt phòng:</strong> ${booking}</p>
      <p><strong>Khách sạn:</strong> ${hotel}</p>
      <p><strong>Loại phòng:</strong> ${rooms}</p>
      <p><strong>Ngày nhận phòng:</strong> ${arrival}</p>
      <p><strong>Ngày trả phòng:</strong> ${departure}</p>
      <p><strong>Số tiền:</strong> ${escapeHtml(money)}</p>
      <p><strong>Trạng thái:</strong> ${escapeHtml(paymentState)}</p>
    </div>
    <p style="color:#718096;font-size:13px">Mã thanh toán: ${payment}</p>
  </main>
</body></html>`;
  const text = [
    "[TEST/SANDBOX] Thông báo thanh toán",
    "Đây là giao dịch kiểm thử, không phải xác nhận thanh toán thật.",
    `Khách hàng: ${customerName || "Quý khách"}`,
    `Mã đặt phòng: ${bookingCode || "Chưa có thông tin"}`,
    `Khách sạn: ${hotelName || "Chưa có thông tin"}`,
    `Loại phòng: ${roomTypes || "Chưa có thông tin loại phòng"}`,
    `Ngày nhận phòng: ${formatDate(checkIn)}`,
    `Ngày trả phòng: ${formatDate(checkOut)}`,
    `Số tiền: ${money}`,
    `Trạng thái: ${paymentState}`,
    `Mã thanh toán: ${paymentId || "Chưa có thông tin"}`,
  ].join("\n\n");

  const info = await createTransporter().sendMail({
    from: process.env.SMTP_FROM || `"FomoGO" <${smtpUser}>`,
    to: recipient,
    subject: `[TEST/SANDBOX] Thanh toán - ${bookingCode || "đặt phòng"}`,
    text,
    html,
    textEncoding: "quoted-printable",
  });
  const accepted = Array.isArray(info.accepted) ? info.accepted : [];
  const wasAccepted = accepted.some((address) => {
    const acceptedAddress = typeof address === "string" ? address : address?.address;
    return typeof acceptedAddress === "string" && acceptedAddress.trim().toLowerCase() === recipient.toLowerCase();
  });
  if (!wasAccepted) {
    const error = new Error("SMTP did not accept the booking email recipient");
    error.code = "SMTP_RECIPIENT_REJECTED";
    throw error;
  }
  return { messageId: info.messageId, accepted: info.accepted, rejected: info.rejected };
}

module.exports = { sendPaymentSuccessEmail };
