const jwt = require("jsonwebtoken");
const { timingSafeEqual } = require("node:crypto");
const User = require("../models/User");
const { getAllowedOrigins, isProductionEnvironment } = require("../config/deployment");

const AUTH_COOKIE = "minitask_session";
const CSRF_COOKIE = "minitask_csrf";

function cookieOptions(path = "/") {
  const production = isProductionEnvironment();
  return {
    httpOnly: true,
    secure: production,
    sameSite: production ? "none" : "lax",
    path,
    maxAge: 60 * 60 * 1000,
  };
}

function clearAuthCookies(res) {
  const options = cookieOptions("/");
  delete options.maxAge;
  res.clearCookie(AUTH_COOKIE, options);
}

function issueSession(res, user) {
  const token = jwt.sign(
    {},
    process.env.JWT_SECRET,
    {
      algorithm: "HS256",
      subject: user.id,
      issuer: "minitask-pro",
      audience: "minitask-pro",
      expiresIn: "1h",
    },
  );
  res.cookie(AUTH_COOKIE, token, cookieOptions());
}

function csrfProtection(req, res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    return next();
  }

  const cookieToken = req.cookies[CSRF_COOKIE];
  const headerToken = req.get("X-CSRF-Token");
  if (
    typeof cookieToken !== "string" ||
    typeof headerToken !== "string" ||
    cookieToken.length !== headerToken.length ||
    !timingSafeEqual(Buffer.from(cookieToken), Buffer.from(headerToken))
  ) {
    return res.status(403).json({ error: "Your session expired. Refresh the page and try again." });
  }

  const origin = req.get("Origin");
  const allowedOrigins = getAllowedOrigins();
  if (origin && !allowedOrigins.includes(origin)) {
    return res.status(403).json({ error: "This request origin is not allowed." });
  }

  next();
}

async function authenticate(req, res, next) {
  const token = req.cookies[AUTH_COOKIE];
  if (!token) {
    return res.status(401).json({ error: "Please log in to continue." });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ["HS256"],
      issuer: "minitask-pro",
      audience: "minitask-pro",
    });
    if (typeof payload !== "object" || typeof payload.sub !== "string") {
      clearAuthCookies(res);
      return res.status(401).json({ error: "Please log in to continue." });
    }

    const user = await User.findById(payload.sub).select("fullName email role isActive");
    if (!user || user.isActive === false) {
      clearAuthCookies(res);
      return res.status(401).json({ error: "Please log in to continue." });
    }
    req.user = user;
    next();
  } catch (error) {
    if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
      clearAuthCookies(res);
      return res.status(401).json({ error: "Please log in to continue." });
    }
    next(error);
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "You do not have permission to perform this action." });
    }
    next();
  };
}

module.exports = {
  AUTH_COOKIE,
  CSRF_COOKIE,
  authenticate,
  clearAuthCookies,
  cookieOptions,
  csrfProtection,
  issueSession,
  requireRole,
};
