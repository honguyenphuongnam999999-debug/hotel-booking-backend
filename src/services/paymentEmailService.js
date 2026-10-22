const nodemailer = require("nodemailer");

function createTransporter() {
  const port = Number(process.env.SMTP_PORT || 587);
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port,
    secure: port === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_APP_PASSWORD,
    },
  });
}

async function sendPaymentSuccessEmail({ to, bookingCode, paymentId, amount, hotelName, checkIn, checkOut }) {
  if (typeof to !== "string" || !to.trim()) throw new Error("Booking email is missing");
  if (!process.env.SMTP_USER || !process.env.SMTP_APP_PASSWORD) {
    throw new Error("SMTP credentials are not configured");
  }

  const money = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(Number(amount));
  const transporter = createTransporter();
  const info = await transporter.sendMail({
    from: `"Hotel Booking" <${process.env.SMTP_USER}>`,
    to: to.trim(),
    subject: `Xác nhận thanh toán đặt phòng - ${bookingCode}`,
    text: [
      "Xin chào,",
      "Thanh toán đặt phòng của bạn đã được xác nhận thành công.",
      `Mã đặt phòng: ${bookingCode}`,
      `Mã thanh toán: ${paymentId}`,
      `Khách sạn: ${hotelName || "Không có thông tin"}`,
      `Ngày nhận phòng: ${checkIn}`,
      `Ngày trả phòng: ${checkOut}`,
      `Tổng tiền: ${money}`,
      "Cảm ơn bạn đã sử dụng dịch vụ đặt phòng của chúng tôi.",
    ].join("\n\n"),
  });

  const accepted = Array.isArray(info.accepted) ? info.accepted : [];
  const recipient = to.trim().toLowerCase();
  if (!accepted.some((address) => String(address).trim().toLowerCase() === recipient)) {
    const error = new Error("SMTP did not accept the booking email recipient");
    error.code = "SMTP_RECIPIENT_REJECTED";
    throw error;
  }

  return { messageId: info.messageId, accepted: info.accepted, rejected: info.rejected };
}

module.exports = { sendPaymentSuccessEmail };
