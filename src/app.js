require("dotenv").config();
const express = require("express");
const cors = require("cors");
const pool = require("./config/db");

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

app.get("/", (req, res) => res.json({ success: true, message: "Hotel Booking API is running" }));
app.get("/api/test-db", async (req, res) => {
  try { const result = await pool.query("SELECT NOW() AS current_time"); res.json({ success: true, data: result.rows[0] }); }
  catch (error) { console.error("Database error:", error); res.status(500).json({ success: false, message: "Cannot connect to PostgreSQL" }); }
});

app.use("/api/auth", require("./routes/auth"));
app.use("/api/users", require("./routes/users"));
app.use("/api/hotels", require("./routes/hotels"));
app.use("/api/room-types", require("./routes/roomTypes"));
app.use("/api/rooms", require("./routes/rooms"));
app.use("/api/bookings", require("./routes/bookings"));
app.use("/api/guests", require("./routes/guests"));
app.use("/api/payments", require("./routes/payments"));
app.use("/api/vouchers", require("./routes/vouchers"));
app.use("/api/favorites", require("./routes/favorites"));
app.use("/api/reviews", require("./routes/reviews"));

app.use((req, res) => res.status(404).json({ success: false, message: "API endpoint not found" }));
app.use((err, req, res, next) => {
  console.error("Unhandled request error:", err);
  if (res.headersSent) return next(err);
  const status = err.status || (err.type === "entity.parse.failed" ? 400 : 500);
  res.status(status).json({ success: false, message: status === 400 ? "Invalid JSON request body" : "Internal server error" });
});

if (require.main === module) {
  const PORT = process.env.PORT || 3000;

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}