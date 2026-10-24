const { createHash } = require("crypto");

const BREVO_EMAIL_URL = "https://api.brevo.com/v3/smtp/email";
const DEFAULT_TIMEOUT_MS = 10000;
const validEmail = (value) => typeof value === "string" && value.length <= 255 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

function createError(code, message, status) {
  const error = new Error(message);
  error.code = code;
  if (status) error.status = status;
  return error;
}

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

// Stable UUID-shaped key lets Brevo recognize retries of this payment as the same request.
function paymentIdempotencyKey(paymentId) {
  const hex = createHash("sha256").update(`payment-confirmation:${paymentId}`).digest("hex");
  const variant = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function getConfig(env) {
  const provider = (env.EMAIL_PROVIDER || "brevo").trim().toLowerCase();
  if (provider !== "brevo") {
    throw createError("EMAIL_PROVIDER_UNSUPPORTED", "Configured email provider is not supported");
  }
  if (env.EMAIL_ENABLED?.trim().toLowerCase() === "false") {
    throw createError("EMAIL_DISABLED", "Email sending is disabled");
  }
  const apiKey = env.BREVO_API_KEY?.trim();
  const senderEmail = env.BREVO_SENDER_EMAIL?.trim();
  const senderName = env.BREVO_SENDER_NAME?.trim();
  if (!apiKey || !senderEmail || !senderName) {
    throw createError("BREVO_CONFIG_MISSING", "Brevo email configuration is incomplete");
  }
  if (!validEmail(senderEmail) || senderName.length > 100) {
    throw createError("BREVO_SENDER_INVALID", "Brevo sender configuration is invalid");
  }
  return {
    apiKey,
    sender: { email: senderEmail, name: senderName },
    timeoutMs: positiveInteger(env.BREVO_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
  };
}

async function readResponseJson(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw createError("BREVO_INVALID_RESPONSE", "Brevo returned an invalid response");
  }
}

async function sendPaymentSuccessEmail(
  { to, customerName, bookingCode, paymentId, amount, hotelName, roomTypes, checkIn, checkOut, paymentStatus },
  { fetchImpl = globalThis.fetch, env = process.env } = {}
) {
  const config = getConfig(env);
  const recipient = typeof to === "string" ? to.trim() : "";
  if (!validEmail(recipient)) {
    throw createError("BOOKING_EMAIL_INVALID", "A valid booking email is required");
  }
  if (paymentStatus !== "paid") {
    throw createError("PAYMENT_NOT_PAID", "Payment must be successful before sending confirmation email");
  }
  if (typeof fetchImpl !== "function") {
    throw createError("FETCH_UNAVAILABLE", "This Node.js runtime does not provide fetch");
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
  const paymentState = "Đã thanh toán";
  const htmlContent = `<!doctype html>
<html lang="vi"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px 12px;background:#f2f5f8;font-family:Arial,Helvetica,sans-serif;color:#243247">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden">
    <tr><td style="padding:24px 28px;background:#17324d;color:#ffffff">
      <p style="margin:0;font-size:13px;letter-spacing:1.4px;font-weight:bold;color:#c7d8ee">FOMOGO · HOTEL BOOKING</p>
      <h1 style="margin:12px 0 0;font-size:24px;line-height:1.3">Thanh toán đã được xác nhận</h1>
    </td></tr>
    <tr><td style="padding:24px 28px 8px">
      <p style="margin:8px 0;font-size:15px">Xin chào ${name},</p>
      <p style="margin:8px 0 18px;color:#526176;font-size:14px;line-height:1.6">Thông tin đặt phòng của bạn:</p>
    </td></tr>
    <tr><td style="padding:0 28px 24px">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e4eaf1;border-radius:10px;border-spacing:0;overflow:hidden">
        <tr><td style="width:42%;padding:13px 14px;border-bottom:1px solid #e9eef4;background:#f7f9fc;color:#607086;font-size:13px">Mã đặt phòng</td><td style="padding:13px 14px;border-bottom:1px solid #e9eef4;color:#17324d;font-size:14px;font-weight:bold;overflow-wrap:anywhere">${booking}</td></tr>
        <tr><td style="padding:13px 14px;border-bottom:1px solid #e9eef4;background:#f7f9fc;color:#607086;font-size:13px">Khách sạn</td><td style="padding:13px 14px;border-bottom:1px solid #e9eef4;color:#243247;font-size:14px;overflow-wrap:anywhere">${hotel}</td></tr>
        <tr><td style="padding:13px 14px;border-bottom:1px solid #e9eef4;background:#f7f9fc;color:#607086;font-size:13px">Loại phòng</td><td style="padding:13px 14px;border-bottom:1px solid #e9eef4;color:#243247;font-size:14px;overflow-wrap:anywhere">${rooms}</td></tr>
        <tr><td style="padding:13px 14px;border-bottom:1px solid #e9eef4;background:#f7f9fc;color:#607086;font-size:13px">Ngày nhận</td><td style="padding:13px 14px;border-bottom:1px solid #e9eef4;color:#243247;font-size:14px">${arrival}</td></tr>
        <tr><td style="padding:13px 14px;border-bottom:1px solid #e9eef4;background:#f7f9fc;color:#607086;font-size:13px">Ngày trả</td><td style="padding:13px 14px;border-bottom:1px solid #e9eef4;color:#243247;font-size:14px">${departure}</td></tr>
        <tr><td style="padding:13px 14px;border-bottom:1px solid #e9eef4;background:#f7f9fc;color:#607086;font-size:13px">Số tiền</td><td style="padding:13px 14px;border-bottom:1px solid #e9eef4;color:#17324d;font-size:16px;font-weight:bold">${escapeHtml(money)}</td></tr>
        <tr><td style="padding:13px 14px;border-bottom:1px solid #e9eef4;background:#f7f9fc;color:#607086;font-size:13px">Trạng thái</td><td style="padding:13px 14px;border-bottom:1px solid #e9eef4"><span style="display:inline-block;padding:6px 10px;border-radius:20px;background:#e7f6ee;color:#187044;font-size:12px;font-weight:bold">${escapeHtml(paymentState)}</span></td></tr>
        <tr><td style="padding:13px 14px;background:#f7f9fc;color:#607086;font-size:13px">Mã thanh toán</td><td style="padding:13px 14px;color:#243247;font-size:13px;overflow-wrap:anywhere">${payment}</td></tr>
      </table>
    </td></tr>
    <tr><td style="padding:16px 28px 22px;border-top:1px solid #edf1f5;color:#8491a2;font-size:12px;line-height:1.5">Email tự động từ FomoGO.</td></tr>
  </table>
</body></html>`;
  const textContent = [
    "Thông báo thanh toán",
    `Khách hàng: ${customerName || "Quý khách"}`,
    `Mã đặt phòng: ${bookingCode || "Chưa có thông tin"}`,
    `Khách sạn: ${hotelName || "Chưa có thông tin"}`,
    `Loại phòng: ${roomTypes || "Chưa có thông tin loại phòng"}`,
    `Ngày nhận: ${formatDate(checkIn)}`,
    `Ngày trả: ${formatDate(checkOut)}`,
    `Số tiền: ${money}`,
    `Trạng thái: ${paymentState}`,
    `Mã thanh toán: ${paymentId || "Chưa có thông tin"}`,
  ].join("\n\n");

  let response;
  try {
    response = await fetchImpl(BREVO_EMAIL_URL, {
      method: "POST",
      headers: {
        "api-key": config.apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        sender: config.sender,
        to: [{ email: recipient, ...(customerName ? { name: String(customerName).slice(0, 100) } : {}) }],
        subject: `[TEST/SANDBOX] Thanh toán - ${bookingCode || "đặt phòng"}`,
        htmlContent,
        textContent,
        headers: { IdempotencyKey: paymentIdempotencyKey(paymentId) },
        tags: ["payment-confirmation"],
      }),
      signal: AbortSignal.timeout(config.timeoutMs),
    });
  } catch (error) {
    if (error?.name === "TimeoutError" || error?.name === "AbortError") {
      throw createError("BREVO_TIMEOUT", "Brevo request timed out");
    }
    throw createError("BREVO_NETWORK_ERROR", "Unable to connect to Brevo");
  }

  let responseBody;
  try {
    responseBody = await readResponseJson(response);
  } catch (error) {
    if (!response.ok) {
      throw createError(`BREVO_API_${response.status}`, "Brevo rejected the email request", response.status);
    }
    throw error;
  }
  if (!response.ok) {
    throw createError(`BREVO_API_${response.status}`, "Brevo rejected the email request", response.status);
  }
  if (typeof responseBody.messageId !== "string" || !responseBody.messageId.trim()) {
    throw createError("BREVO_INVALID_RESPONSE", "Brevo did not return an email message ID");
  }
  return { messageId: responseBody.messageId, accepted: true, delivered: false };
}

module.exports = { sendPaymentSuccessEmail, paymentIdempotencyKey };
