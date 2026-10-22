const express = require("express");
const { randomUUID } = require("crypto");
const pool = require("../config/db");
const { requireAuth } = require("../middleware/auth");
const { sendPaymentSuccessEmail } = require("../services/paymentEmailService");

const router = express.Router();
router.use(requireAuth);

const paymentId = () => `PAY${randomUUID().replace(/-/g, "").slice(0, 17)}`;
const transactionId = () => `TXN${randomUUID().replace(/-/g, "").slice(0, 20)}`;
const paymentFields = "p.id,p.booking_id,p.payment_method,p.transaction_id,p.amount,p.status,p.paid_at";

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
    const pending = await client.query("SELECT 1 FROM payments WHERE booking_id=$1 AND status='pending' LIMIT 1", [booking_id]);
    if (pending.rows.length) {
      await client.query("ROLLBACK");
      return res.status(409).json({ success: false, message: "Booking already has a pending payment" });
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
    console.error("Unable to create payment:", error);
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
    console.error("Unable to get payment QR:", error);
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
  let transactionCommitted = false;
  let clientReleased = false;
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT p.id,p.booking_id,p.payment_method,p.transaction_id,p.amount,p.status,p.paid_at,
              b.status AS booking_status,b.booking_code,b.user_id,b.booking_email,b.check_in,b.check_out,h.name AS hotel_name
       FROM payments p JOIN bookings b ON b.id=p.booking_id JOIN hotels h ON h.id=b.hotel_id
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
    transactionCommitted = true;
    client.release();
    clientReleased = true;
    let emailStatus = result === "success" ? "not_sent" : "not_applicable";
    let emailMessage = result === "success" ? "Payment is confirmed; booking email is not set" : "No email sent because payment was not successful";
    if (result === "success" && payment.booking_email) {
      try {
        await sendPaymentSuccessEmail({
          to: payment.booking_email,
          bookingCode: payment.booking_code,
          paymentId: payment.id,
          amount: payment.amount,
          hotelName: payment.hotel_name,
          checkIn: payment.check_in,
          checkOut: payment.check_out,
        });
        emailStatus = "sent";
        emailMessage = "Confirmation email sent";
      } catch (emailError) {
        emailStatus = "failed";
        emailMessage = "Payment is confirmed, but confirmation email could not be sent";
        console.error("Payment confirmation email failed:", emailError.code || "SMTP_ERROR");
      }
    }
    if (result === "success") {
      try {
        await pool.query(
          `INSERT INTO notifications
             (id, user_id, booking_id, title, content, type, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
          [
            randomUUID(),
            payment.user_id,
            payment.booking_id,
            "Thanh toán thành công",
            `Booking ${payment.booking_code} đã được xác nhận thanh toán.`,
            "payment",
          ]
        );
      } catch (notificationError) {
        console.error("Payment notification creation failed:", notificationError.code || "DB_ERROR");
      }
    }
    return res.json({ success: true, data: updated.rows[0], email: { status: emailStatus, message: emailMessage } });
  } catch (error) {
    if (!transactionCommitted) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Unable to roll back payment simulation:", rollbackError.code || "DB_ERROR");
      }
    }
    console.error("Unable to simulate payment:", error);
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
    return res.json({ success: true, data: rows[0] });
  } catch (error) {
    console.error("Unable to get payment:", error);
    return res.status(500).json({ success: false, message: "Unable to get payment" });
  }
});

module.exports = router;
