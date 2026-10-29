const express = require("express");
const bcrypt = require("bcryptjs");
const rateLimit = require("express-rate-limit");
const { randomBytes } = require("node:crypto");
const User = require("../models/User");
const {
  CSRF_COOKIE,
  authenticate,
  clearAuthCookies,
  cookieOptions,
  issueSession,
} = require("../middleware/auth");

const router = express.Router();
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Please wait a little while and try again." },
});
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const passwordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{10,72}$/;
const dummyPasswordHash = bcrypt.hashSync(randomBytes(32).toString("base64url"), 12);

function publicUser(user) {
  return { id: user.id, fullName: user.fullName, email: user.email, role: user.role || "employee" };
}

router.get("/csrf", (req, res) => {
  const csrfToken = /^[A-Za-z0-9_-]{43}$/.test(req.cookies[CSRF_COOKIE] || "")
    ? req.cookies[CSRF_COOKIE]
    : randomBytes(32).toString("base64url");
  res.cookie(CSRF_COOKIE, csrfToken, { ...cookieOptions("/api"), maxAge: 24 * 60 * 60 * 1000 });
  res.set("Cache-Control", "no-store");
  res.json({ csrfToken });
});

router.post("/signup", authLimiter, async (req, res, next) => {
  try {
    const body = req.body && typeof req.body === "object" && !Array.isArray(req.body)
      ? req.body
      : {};
    const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!fullName || fullName.length > 100) {
      return res.status(400).json({ error: "Enter your name (up to 100 characters)." });
    }
    if (!emailPattern.test(email) || email.length > 254) {
      return res.status(400).json({ error: "Enter a valid email address." });
    }
    if (!passwordPattern.test(password) || Buffer.byteLength(password, "utf8") > 72) {
      return res.status(400).json({
        error: "Use 10–72 characters with at least one uppercase letter, one lowercase letter, and one number.",
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ fullName, email, passwordHash, role: "employee", isActive: true });
    issueSession(res, user);
    res.status(201).json({ user: publicUser(user) });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ error: "An account with this email may already exist." });
    }
    next(error);
  }
});

router.post("/login", authLimiter, async (req, res, next) => {
  try {
    const body = req.body && typeof req.body === "object" && !Array.isArray(req.body)
      ? req.body
      : {};
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const passwordFits = Buffer.byteLength(password, "utf8") <= 72;
    const user = emailPattern.test(email)
      ? await User.findOne({ email }).select("+passwordHash")
      : null;
    const passwordMatches = await bcrypt.compare(
      passwordFits ? password : "invalid-password",
      user ? user.passwordHash : dummyPasswordHash,
    );

    if (!user || !passwordMatches || !passwordFits || user.isActive === false) {
      return res.status(401).json({ error: "Email or password is incorrect." });
    }
    issueSession(res, user);
    res.json({ user: publicUser(user) });
  } catch (error) {
    next(error);
  }
});

router.get("/me", authenticate, (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({ user: publicUser(req.user) });
});

router.post("/logout", (req, res) => {
  clearAuthCookies(res);
  res.status(204).end();
});

module.exports = router;
