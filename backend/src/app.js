const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const mongoose = require("mongoose");
const { timingSafeEqual } = require("node:crypto");
const authRouter = require("./routes/auth");
const tasksRouter = require("./routes/tasks");
const workspaceRouter = require("./routes/workspace");
const { checkUpcomingDeadlines } = require("./services/deadlineReminders");
const { csrfProtection } = require("./middleware/auth");
const { notFound, errorHandler } = require("./middleware/errorHandler");
const { getAllowedOrigins, isProductionEnvironment } = require("./config/deployment");
const { connectToDatabase } = require("./config/database");

const app = express();
app.set("trust proxy", isProductionEnvironment() ? 1 : false);
const allowedOrigins = getAllowedOrigins();

app.use(
  cors({
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "X-CSRF-Token"],
    optionsSuccessStatus: 204,
    maxAge: 600,
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      const error = new Error("This origin is not allowed by CORS.");
      error.status = 403;
      return callback(error);
    },
  }),
);
app.use(express.json({ limit: "10kb" }));
app.use(cookieParser());
app.use("/api", csrfProtection);
app.use("/api", async (req, res, next) => {
  try {
    await connectToDatabase();
    next();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown connection error";
    const safeMessage = message.replace(/mongodb(?:\+srv)?:\/\/[^\s"'<>]+/gi, "[REDACTED_MONGODB_URI]");
    const code = error && typeof error === "object" && "code" in error ? ` (${error.code})` : "";
    console.error(`MongoDB connection failed${code}: ${safeMessage}`);

    if (req.path === "/health") {
      return res.status(503).json({ status: "ok", database: "disconnected" });
    }
    return res.status(503).json({ error: "Database unavailable." });
  }
});

app.get("/api/health", (req, res) => {
  const connected = mongoose.connection.readyState === 1;
  res.status(connected ? 200 : 503).json({
    status: "ok",
    database: connected ? "connected" : "disconnected",
  });
});
app.get("/api/internal/deadline-reminders", async (req, res, next) => {
  const secret = process.env.CRON_SECRET;
  const authorization = req.get("Authorization");
  const expected = typeof secret === "string" ? `Bearer ${secret}` : "";
  if (
    !expected ||
    typeof authorization !== "string" ||
    authorization.length !== expected.length ||
    !timingSafeEqual(Buffer.from(authorization), Buffer.from(expected))
  ) {
    return res.status(401).json({ error: "Unauthorized scheduled request." });
  }

  try {
    const created = await checkUpcomingDeadlines();
    res.json({ remindersCreated: created });
  } catch (error) {
    next(error);
  }
});
app.use("/api/auth", authRouter);
app.use("/api/tasks", tasksRouter);
app.use("/api/workspace", workspaceRouter);
app.use(notFound);
app.use(errorHandler);

module.exports = app;
