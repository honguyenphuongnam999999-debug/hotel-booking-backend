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
  return match ? `${match[3]}/${match[2]}/${match[1]}` : String(value ?? "Chưa có thông tin");
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

async function sendPaymentSuccessEmail({ to, bookingCode, paymentId, amount, hotelName, roomTypes, checkIn, checkOut, paymentStatus, testMode = false }) {
  if (process.env.EMAIL_ENABLED?.trim().toLowerCase() === "false") {
    const error = new Error("Email sending is disabled by EMAIL_ENABLED");
    error.code = "EMAIL_DISABLED";
    throw error;
  }

  const recipient = typeof to === "string" ? to.trim() : "";
  if (!recipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
    const error = new Error("A valid booking email is required");
    error.code = "BOOKING_EMAIL_INVALID";
    throw error;
  }
  const smtpUser = process.env.SMTP_USER;
  const smtpPassword = process.env.SMTP_APP_PASSWORD || process.env.SMTP_PASSWORD;
  if (!smtpUser || !smtpPassword) {
    const error = new Error("SMTP_USER and SMTP_APP_PASSWORD or SMTP_PASSWORD must be configured");
    error.code = "SMTP_CONFIG_MISSING";
    throw error;
  }

  const booking = escapeHtml(bookingCode || "Chưa có thông tin");
  const payment = escapeHtml(paymentId || "Chưa có thông tin");
  const hotel = escapeHtml(hotelName || "Chưa có thông tin");
  const rooms = escapeHtml(roomTypes || "Chưa có thông tin");
  const arrival = escapeHtml(formatDate(checkIn));
  const departure = escapeHtml(formatDate(checkOut));
  const money = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(Number(amount));
  const paymentState = paymentStatus === "paid" ? "Đã thanh toán" : escapeHtml(paymentStatus || "Đã thanh toán");
  const testNotice = testMode
    ? '<div style="margin:0 0 20px;padding:12px 14px;border:1px solid #f2c879;border-radius:8px;background:#fff8e8;color:#79520a;font-size:13px;line-height:1.5"><strong>Email kiểm thử:</strong> dữ liệu mô phỏng, không phải booking hoặc thanh toán thật.</div>'
    : "";
  const html = `<!doctype html>
<html lang="vi">
  <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
  <body style="margin:0;padding:0;background:#f2f5f8;font-family:Arial,Helvetica,sans-serif;color:#203047">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0">Đặt phòng ${booking} đã được xác nhận và thanh toán thành công.</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f2f5f8;padding:32px 12px">
      <tr><td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e4eaf0">
          <tr><td style="height:6px;background:#18a999;font-size:0;line-height:0">&nbsp;</td></tr>
          <tr><td style="padding:25px 32px 20px;border-bottom:1px solid #edf1f5">
            <div style="font-size:22px;font-weight:700;letter-spacing:2px;color:#17324d">FomoGO</div>
            <div style="margin-top:5px;font-size:11px;font-weight:700;letter-spacing:1.5px;color:#718096">XÁC NHẬN ĐẶT PHÒNG</div>
          </td></tr>
          <tr><td style="padding:30px 32px 12px">
            ${testNotice}
            <div style="font-size:13px;color:#718096;margin-bottom:9px">Xin chào,</div>
            <h1 style="margin:0 0 12px;font-size:25px;line-height:1.3;color:#17324d">Đặt phòng của bạn đã sẵn sàng</h1>
            <p style="margin:0;font-size:15px;line-height:1.7;color:#526174">Thanh toán đã được xác nhận thành công. Thông tin đặt phòng của bạn ở bên dưới.</p>
          </td></tr>
          <tr><td style="padding:20px 32px 8px">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f9fb;border:1px solid #e7edf2;border-radius:10px">
              <tr><td style="padding:16px 18px;border-bottom:1px solid #e7edf2;color:#718096;font-size:13px">MÃ ĐẶT PHÒNG</td><td align="right" style="padding:16px 18px;border-bottom:1px solid #e7edf2;color:#17324d;font-size:15px;font-weight:700">${booking}</td></tr>
              <tr><td style="padding:14px 18px;border-bottom:1px solid #e7edf2;color:#718096;font-size:13px">KHÁCH SẠN</td><td align="right" style="padding:14px 18px;border-bottom:1px solid #e7edf2;color:#203047;font-size:14px;font-weight:600">${hotel}</td></tr>
              <tr><td style="padding:14px 18px;border-bottom:1px solid #e7edf2;color:#718096;font-size:13px">LOẠI PHÒNG</td><td align="right" style="padding:14px 18px;border-bottom:1px solid #e7edf2;color:#203047;font-size:14px">${rooms}</td></tr>
              <tr><td style="padding:14px 18px;border-bottom:1px solid #e7edf2;color:#718096;font-size:13px">NHẬN PHÒNG</td><td align="right" style="padding:14px 18px;border-bottom:1px solid #e7edf2;color:#203047;font-size:14px">${arrival}</td></tr>
              <tr><td style="padding:14px 18px;color:#718096;font-size:13px">TRẢ PHÒNG</td><td align="right" style="padding:14px 18px;color:#203047;font-size:14px">${departure}</td></tr>
            </table>
          </td></tr>
          <tr><td style="padding:16px 32px 28px">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
              <tr><td style="padding:7px 0;color:#718096;font-size:14px">Trạng thái thanh toán</td><td align="right" style="padding:7px 0"><span style="display:inline-block;padding:6px 11px;border-radius:20px;background:#e7f7f3;color:#087f6b;font-size:12px;font-weight:700">${paymentState}</span></td></tr>
              <tr><td style="padding:11px 0 0;color:#17324d;font-size:16px;font-weight:700">Tổng thanh toán</td><td align="right" style="padding:11px 0 0;color:#087f6b;font-size:21px;font-weight:700">${escapeHtml(money)}</td></tr>
              <tr><td colspan="2" style="padding-top:12px;color:#9aa5b1;font-size:12px">Mã thanh toán: ${payment}</td></tr>
            </table>
          </td></tr>
          <tr><td style="padding:20px 32px;background:#f8fafb;border-top:1px solid #edf1f5;color:#718096;font-size:12px;line-height:1.6">Cảm ơn bạn đã chọn FomoGO. Đây là email tự động xác nhận thông tin đặt phòng; vui lòng giữ lại email này để đối chiếu khi cần.</td></tr>
        </table>
        <div style="padding:18px 10px;color:#9aa5b1;font-size:11px;text-align:center">© FomoGO · Hotel Booking</div>
      </td></tr>
    </table>
  </body>
</html>`;
  const text = [
    ...(testMode ? ["EMAIL KIỂM THỬ: dữ liệu mô phỏng, không phải booking hoặc thanh toán thật."] : []),
    "FomoGO — XÁC NHẬN ĐẶT PHÒNG",
    "Xin chào,",
    "Thanh toán đã được xác nhận thành công. Thông tin đặt phòng của bạn:",
    `Mã đặt phòng: ${bookingCode || "Chưa có thông tin"}`,
    `Khách sạn: ${hotelName || "Chưa có thông tin"}`,
    `Loại phòng: ${roomTypes || "Chưa có thông tin"}`,
    `Ngày nhận phòng: ${formatDate(checkIn)}`,
    `Ngày trả phòng: ${formatDate(checkOut)}`,
    `Trạng thái thanh toán: ${paymentStatus === "paid" ? "Đã thanh toán" : paymentStatus || "Đã thanh toán"}`,
    `Tổng thanh toán: ${money}`,
    `Mã thanh toán: ${paymentId || "Chưa có thông tin"}`,
    "Cảm ơn bạn đã chọn FomoGO.",
  ].join("\n\n");

  const info = await createTransporter().sendMail({
    from: process.env.SMTP_FROM || `"FomoGO" <${smtpUser}>`,
    to: recipient,
    subject: `${testMode ? "[EMAIL TEST - DỮ LIỆU MÔ PHỎNG] " : ""}Xác nhận đặt phòng thành công - ${bookingCode}`,
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
