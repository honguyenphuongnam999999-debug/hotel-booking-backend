const jwt = require("jsonwebtoken");
require("dotenv").config();

function requireAuth(req, res, next) {
  if (!process.env.JWT_SECRET) return res.status(500).json({ success: false, message: "JWT_SECRET is not configured" });
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) return res.status(401).json({ success: false, message: "Authorization header must use Bearer <token>" });
  try {
    req.user = jwt.verify(header.slice(7), process.env.JWT_SECRET);
    if (!req.user.id) return res.status(401).json({ success: false, message: "Invalid authentication token" });
    return next();
  } catch {
    return res.status(401).json({ success: false, message: "Invalid or expired token" });
  }
}

function optionalAuth(req, res, next) {
  if (!req.headers.authorization) return next();
  return requireAuth(req, res, next);
}

module.exports = { requireAuth, optionalAuth };
