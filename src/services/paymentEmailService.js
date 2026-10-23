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

async function sendPaymentSuccessEmail({ to, bookingCode, paymentId, amount, hotelName, roomTypes, checkIn, checkOut, paymentStatus }) {
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

  const booking = escapeHtml(bookingCode || "Chưa có thông tin");
  const payment = escapeHtml(paymentId || "Chưa có thông tin");
  const hotel = escapeHtml(hotelName || "Chưa có thông tin");
  const rooms = escapeHtml(roomTypes || "Không có thông tin loại phòng");
  const arrival = escapeHtml(formatDate(checkIn));
  const departure = escapeHtml(formatDate(checkOut));
  const money = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(Number(amount));
  const paymentState = paymentStatus === "paid" ? "Đã thanh toán" : escapeHtml(paymentStatus || "Chưa có thông tin");
  const html = `<!doctype html>
<html lang="vi"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:Arial,Helvetica,sans-serif;color:#203047;background:#f2f5f8;padding:24px">
  <main style="max-width:600px;margin:auto;background:#fff;padding:28px;border-radius:12px">
    <h1 style="color:#17324d">Xác nhận đặt phòng</h1>
    <p>Thanh toán đã được xác nhận thành công. Thông tin đặt phòng của bạn:</p>
    <p><strong>Mã đặt phòng:</strong> ${booking}</p>
    <p><strong>Khách sạn:</strong> ${hotel}</p>
    <p><strong>Loại phòng:</strong> ${rooms}</p>
    <p><strong>Ngày nhận phòng:</strong> ${arrival}</p>
    <p><strong>Ngày trả phòng:</strong> ${departure}</p>
    <p><strong>Trạng thái thanh toán:</strong> ${paymentState}</p>
    <p><strong>Tổng thanh toán:</strong> ${escapeHtml(money)}</p>
    <p style="color:#718096">Mã thanh toán: ${payment}</p>
    <p>Cảm ơn bạn đã chọn FomoGO.</p>
  </main>
</body></html>`;
  const text = [
    "FomoGO — XÁC NHẬN ĐẶT PHÒNG",
    "Thanh toán đã được xác nhận thành công.",
    `Mã đặt phòng: ${bookingCode || "Chưa có thông tin"}`,
    `Khách sạn: ${hotelName || "Chưa có thông tin"}`,
    `Loại phòng: ${roomTypes || "Không có thông tin loại phòng"}`,
    `Ngày nhận phòng: ${formatDate(checkIn)}`,
    `Ngày trả phòng: ${formatDate(checkOut)}`,
    `Trạng thái thanh toán: ${paymentState}`,
    `Tổng thanh toán: ${money}`,
    `Mã thanh toán: ${paymentId || "Chưa có thông tin"}`,
  ].join("\n\n");

  const info = await createTransporter().sendMail({
    from: process.env.SMTP_FROM || `"FomoGO" <${smtpUser}>`,
    to: recipient,
    subject: `Xác nhận đặt phòng thành công - ${bookingCode}`,
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
