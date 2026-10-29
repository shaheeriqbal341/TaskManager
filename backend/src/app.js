const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const mongoose = require("mongoose");
const authRouter = require("./routes/auth");
const tasksRouter = require("./routes/tasks");
const workspaceRouter = require("./routes/workspace");
const { csrfProtection } = require("./middleware/auth");
const { notFound, errorHandler } = require("./middleware/errorHandler");

const app = express();
app.set("trust proxy", process.env.NODE_ENV === "production" ? 1 : false);
const allowedOrigins = (process.env.FRONTEND_URL || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    credentials: true,
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

app.get("/api/health", (req, res) => {
  const connected = mongoose.connection.readyState === 1;
  res.status(connected ? 200 : 503).json({
    status: "ok",
    database: connected ? "connected" : "disconnected",
  });
});
app.use("/api/auth", authRouter);
app.use("/api/tasks", tasksRouter);
app.use("/api/workspace", workspaceRouter);
app.use(notFound);
app.use(errorHandler);

module.exports = app;
