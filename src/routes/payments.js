const express = require("express");
const { randomUUID } = require("crypto");
const pool = require("../config/db");
const { requireAuth } = require("../middleware/auth");
const { sendPaymentSuccessEmail } = require("../services/paymentEmailService");
const { createPaymentSuccessNotification } = require("../services/notificationService");

const router = express.Router();
router.use(requireAuth);

const paymentId = () => `PAY${randomUUID().replace(/-/g, "").slice(0, 17)}`;
const transactionId = () => `TXN${randomUUID().replace(/-/g, "").slice(0, 20)}`;
const paymentFields = "p.id,p.booking_id,p.payment_method,p.transaction_id,p.amount,p.status,p.paid_at";
const isValidEmail = (value) => typeof value === "string" && value.length <= 255 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

async function getEmailDeliveryStatus(paymentId, paymentStatus) {
  if (paymentStatus !== "paid") {
    return { status: "not_applicable", message: "Email is sent only after payment succeeds" };
  }
  try {
    const { rows } = await pool.query(
      "SELECT status,last_error_code FROM payment_email_deliveries WHERE payment_id=$1",
      [paymentId]
    );
    if (!rows.length) {
      return { status: "not_tracked", message: "No email delivery status is recorded for this payment" };
    }
    const delivery = rows[0];
    return {
      status: delivery.status,
      delivery_status: delivery.status === "sent" ? "unconfirmed" : delivery.status === "failed" ? "not_accepted" : delivery.status,
      ...(delivery.last_error_code ? { code: delivery.last_error_code } : {}),
      message: delivery.status === "sent"
        ? "Brevo accepted the email request; delivery is not confirmed"
        : delivery.status === "failed"
          ? "Brevo email request failed; retry is available"
          : "Confirmation email delivery is being processed",
    };
  } catch (error) {
    console.error("Unable to read payment email delivery status:", {
      paymentId,
      operation: "read_payment_email_delivery_status",
      table: "payment_email_deliveries",
      column: error.column || null,
      code: error.code || "DB_ERROR",
    });
    return { status: "not_tracked", message: "Email delivery status is unavailable", code: error.code || "DB_ERROR" };
  }
}

async function deliverPaymentEmail(payment) {
  const { rows: claimed } = await pool.query(
    `UPDATE payment_email_deliveries
     SET status='sending',attempt_count=attempt_count+1,last_error_code=NULL,updated_at=NOW()
     WHERE payment_id=$1 AND status IN ('pending','failed')
     RETURNING payment_id`,
    [payment.id]
  );
  if (!claimed.length) {
    const { rows } = await pool.query(
      "SELECT status,last_error_code FROM payment_email_deliveries WHERE payment_id=$1",
      [payment.id]
    );
    const delivery = rows[0];
    if (!delivery) return { status: "not_tracked", message: "No email delivery record exists for this payment" };
    if (delivery.status === "failed") {
      return { status: "failed", delivery_status: "not_accepted", message: "Brevo email request failed; retry is available", code: delivery.last_error_code };
    }
    return { status: delivery.status, delivery_status: delivery.status === "sent" ? "unconfirmed" : delivery.status, message: delivery.status === "sent"
      ? "Brevo already accepted this email request; delivery is not confirmed"
      : "Confirmation email is already being processed" };
  }

  const recipient = isValidEmail(payment.booking_email) ? payment.booking_email.trim() : null;
  if (!recipient) {
    const code = "BOOKING_EMAIL_MISSING";
    await pool.query(
      "UPDATE payment_email_deliveries SET status='failed',last_error_code=$2,updated_at=NOW() WHERE payment_id=$1 AND status='sending'",
      [payment.id, code]
    );
    console.error("Payment confirmation email failed:", { paymentId: payment.id, bookingCode: payment.booking_code, code });
    return { status: "failed", delivery_status: "not_accepted", message: "No valid booking email is available; retry is available", code };
  }

  try {
    const acceptedEmail = await sendPaymentSuccessEmail({
      to: recipient,
      customerName: payment.customer_name,
      bookingCode: payment.booking_code,
      paymentId: payment.id,
      amount: payment.amount,
      hotelName: payment.hotel_name,
      roomTypes: payment.room_types,
      checkIn: payment.check_in,
      checkOut: payment.check_out,
      paymentStatus: payment.status,
    });
    console.info("Brevo accepted payment confirmation email:", {
      paymentId: payment.id,
      bookingCode: payment.booking_code,
      messageId: acceptedEmail.messageId,
    });
  } catch (emailError) {
    const code = emailError.code || "BREVO_ERROR";
    await pool.query(
      "UPDATE payment_email_deliveries SET status='failed',last_error_code=$2,updated_at=NOW() WHERE payment_id=$1 AND status='sending'",
      [payment.id, code]
    );
    console.error("Payment confirmation email failed:", { paymentId: payment.id, bookingCode: payment.booking_code, code });
    return { status: "failed", delivery_status: "not_accepted", message: "Payment is confirmed, but Brevo email request failed; retry is available", code };
  }

  try {
    await pool.query(
      "UPDATE payment_email_deliveries SET status='sent',sent_at=NOW(),updated_at=NOW() WHERE payment_id=$1 AND status='sending'",
      [payment.id]
    );
  } catch (stateError) {
    console.error("Payment email delivery state update failed:", {
      paymentId: payment.id,
      bookingCode: payment.booking_code,
      operation: "mark_payment_email_sent",
      table: "payment_email_deliveries",
      column: stateError.column || null,
      code: stateError.code || "DB_ERROR",
    });
  }
  return { status: "sent", delivery_status: "unconfirmed", message: "Brevo accepted the email request; delivery is not confirmed" };
}

async function safelyDeliverPaymentEmail(payment) {
  try {
    return await deliverPaymentEmail(payment);
  } catch (error) {
    const code = error.code || "EMAIL_DELIVERY_STATE_ERROR";
    console.error("Payment email delivery processing failed:", {
      paymentId: payment.id,
      bookingCode: payment.booking_code,
      code,
    });
    return { status: "failed", delivery_status: "not_accepted", message: "Payment is confirmed, but email delivery could not be completed", code };
  }
}

router.post("/", async (req, res) => {
  const { booking_id, payment_method } = req.body;
  if (typeof booking_id !== "string" || !booking_id.trim() || !["card", "qr"].includes(payment_method)) {
    return res.status(400).json({ success: false, message: "booking_id and payment_method (card or qr) are required" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const booking = await client.query(
      "SELECT id,booking_code,total_amount,status FROM bookings WHERE id=$1 AND user_id=$2 FOR UPDATE",
      [booking_id, req.user.id]
    );
    if (!booking.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false, message: "Booking not found" });
    }
    if (["cancelled", "completed", "no_show", "checked_in"].includes(booking.rows[0].status)) {
      await client.query("ROLLBACK");
      return res.status(409).json({ success: false, message: "Booking cannot be paid in its current status" });
    }
    const paid = await client.query("SELECT 1 FROM payments WHERE booking_id=$1 AND status='paid' LIMIT 1", [booking_id]);
    if (paid.rows.length) {
      await client.query("ROLLBACK");
      return res.status(409).json({ success: false, message: "Booking has already been paid" });
    }
    const pending = await client.query(
      `SELECT id,booking_id,payment_method,transaction_id,amount,status,paid_at
       FROM payments WHERE booking_id=$1 AND status='pending'
       ORDER BY id DESC LIMIT 1 FOR UPDATE`,
      [booking_id]
    );
    if (pending.rows.length) {
      await client.query("COMMIT");
      return res.status(200).json({ success: true, data: pending.rows[0], reused: true });
    }

    const id = paymentId();
    const created = await client.query(
      "INSERT INTO payments(id,booking_id,payment_method,transaction_id,amount,status,paid_at) VALUES($1,$2,$3,$4,$5,'pending',NULL) RETURNING id,booking_id,payment_method,transaction_id,amount,status,paid_at",
      [id, booking_id, payment_method, transactionId(), booking.rows[0].total_amount]
    );
    await client.query("COMMIT");
    return res.status(201).json({ success: true, data: created.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Unable to create payment:", { code: error.code || "DB_ERROR" });
    return res.status(500).json({ success: false, message: "Unable to create payment" });
  } finally {
    client.release();
  }
});

router.get("/:id/qr", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${paymentFields},b.booking_code
       FROM payments p JOIN bookings b ON b.id=p.booking_id
       WHERE p.id=$1 AND b.user_id=$2`,
      [req.params.id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: "Payment not found" });
    const payment = rows[0];
    if (payment.payment_method !== "qr") return res.status(409).json({ success: false, message: "Payment does not use QR" });
    return res.json({
      success: true,
      data: {
        payment_id: payment.id,
        booking_id: payment.booking_id,
        booking_code: payment.booking_code,
        amount: payment.amount,
        payment_status: payment.status,
        qr_content: `THANH TOAN BOOKING ${payment.booking_id}`,
      },
    });
  } catch (error) {
    console.error("Unable to get payment QR:", { code: error.code || "DB_ERROR" });
    return res.status(500).json({ success: false, message: "Unable to get payment QR" });
  }
});

router.post("/:id/simulate", async (req, res) => {
  if (process.env.PAYMENT_MODE !== "mock") {
    return res.status(403).json({ success: false, message: "Mock payment simulation is disabled" });
  }
  const { result } = req.body;
  if (!["success", "failed"].includes(result)) {
    return res.status(400).json({ success: false, message: "result must be success or failed" });
  }

  const client = await pool.connect();
  let transactionFinalized = false;
  let clientReleased = false;
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT p.id,p.booking_id,p.payment_method,p.transaction_id,p.amount,p.status,p.paid_at,
              b.status AS booking_status,b.booking_code,b.user_id,u.full_name AS customer_name,
              to_jsonb(b)->>'booking_email' AS booking_email,
              b.check_in,b.check_out,h.name AS hotel_name,room_summary.room_types
       FROM payments p JOIN bookings b ON b.id=p.booking_id JOIN users u ON u.id=b.user_id
       JOIN hotels h ON h.id=b.hotel_id
       LEFT JOIN LATERAL (
         SELECT string_agg(DISTINCT rt.name, ', ' ORDER BY rt.name) AS room_types
         FROM booking_rooms br JOIN rooms r ON r.id=br.room_id JOIN room_types rt ON rt.id=r.room_type_id
         WHERE br.booking_id=b.id
       ) room_summary ON TRUE
       WHERE p.id=$1 AND b.user_id=$2 FOR UPDATE OF b,p`,
      [req.params.id, req.user.id]
    );
    if (!rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false, message: "Payment not found" });
    }
    const payment = rows[0];
    if (payment.status !== "pending") {
      await client.query("ROLLBACK");
      if (payment.status === "paid" && result === "success") {
        if (!["confirmed", "checked_in", "completed"].includes(payment.booking_status)) {
          return res.status(409).json({ success: false, message: "Booking is not in a confirmed state for email retry" });
        }
        transactionFinalized = true;
        client.release();
        clientReleased = true;
        const email = await safelyDeliverPaymentEmail(payment);
        const data = {
          id: payment.id,
          booking_id: payment.booking_id,
          payment_method: payment.payment_method,
          transaction_id: payment.transaction_id,
          amount: payment.amount,
          status: payment.status,
          paid_at: payment.paid_at,
          email_status: email.status,
        };
        return res.json({
          success: true,
          data,
          email,
          email_status: email.status,
        });
      }
      return res.status(409).json({ success: false, message: "Payment has already been completed" });
    }
    if (["cancelled", "completed", "no_show", "checked_in"].includes(payment.booking_status)) {
      await client.query("ROLLBACK");
      return res.status(409).json({ success: false, message: "Booking cannot be paid in its current status" });
    }

    const paid = await client.query("SELECT 1 FROM payments WHERE booking_id=$1 AND status='paid' AND id<>$2 LIMIT 1", [payment.booking_id, payment.id]);
    if (paid.rows.length) {
      await client.query("ROLLBACK");
      return res.status(409).json({ success: false, message: "Booking has already been paid" });
    }

    const newStatus = result === "success" ? "paid" : "failed";
    const updated = await client.query(
      "UPDATE payments SET status=$2::varchar,paid_at=CASE WHEN $2::varchar='paid' THEN NOW() ELSE NULL END WHERE id=$1 AND status='pending' RETURNING id,booking_id,payment_method,transaction_id,amount,status,paid_at",
      [payment.id, newStatus]
    );
    if (result === "success") {
      await client.query("UPDATE bookings SET status='confirmed' WHERE id=$1 AND status='pending'", [payment.booking_id]);
    }
    await client.query("COMMIT");
    transactionFinalized = true;
    client.release();
    clientReleased = true;
    let email = { status: "not_applicable", message: "No email sent because payment was not successful" };
    if (result === "success") {
      try {
        await pool.query(
          `INSERT INTO payment_email_deliveries(payment_id,status,attempt_count,created_at,updated_at)
           VALUES($1,'pending',0,NOW(),NOW()) ON CONFLICT(payment_id) DO NOTHING`,
          [payment.id]
        );
        email = await safelyDeliverPaymentEmail({ ...payment, status: newStatus });
      } catch (trackingError) {
        const code = trackingError.code || "EMAIL_TRACKING_ERROR";
        console.error("Payment confirmed but email tracking could not be initialized:", {
          paymentId: payment.id,
          bookingCode: payment.booking_code,
          operation: "initialize_payment_email_delivery",
          table: "payment_email_deliveries",
          column: trackingError.column || null,
          code,
        });
        email = {
          status: "not_tracked",
          message: "Payment is confirmed, but email tracking is unavailable; apply the email delivery migration",
          code,
        };
      }
    }
    if (result === "success") {
      try {
        await createPaymentSuccessNotification({
          id: randomUUID(),
          userId: payment.user_id,
          bookingId: payment.booking_id,
          bookingCode: payment.booking_code,
        });
      } catch (notificationError) {
        console.error("Payment notification creation failed:", {
          operation: notificationError.operation || "create_payment_success_notification",
          table: notificationError.table || "notifications",
          column: notificationError.column || null,
          code: notificationError.code || "DB_ERROR",
          message: notificationError.message,
        });
      }
    }
    return res.json({
      success: true,
      data: { ...updated.rows[0], email_status: email.status },
      email,
      email_status: email.status,
    });
  } catch (error) {
    if (!transactionFinalized) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Unable to roll back payment simulation:", rollbackError.code || "DB_ERROR");
      }
    }
    console.error("Unable to simulate payment:", { code: error.code || "DB_ERROR" });
    return res.status(500).json({ success: false, message: "Unable to simulate payment" });
  } finally {
    if (!clientReleased) client.release();
  }
});

router.get("/:id", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${paymentFields} FROM payments p JOIN bookings b ON b.id=p.booking_id
       WHERE p.id=$1 AND b.user_id=$2`,
      [req.params.id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: "Payment not found" });
    const email = await getEmailDeliveryStatus(rows[0].id, rows[0].status);
    return res.json({
      success: true,
      data: { ...rows[0], email_status: email.status },
      email,
      email_status: email.status,
    });
  } catch (error) {
    console.error("Unable to get payment:", { code: error.code || "DB_ERROR" });
    return res.status(500).json({ success: false, message: "Unable to get payment" });
  }
});

module.exports = router;
