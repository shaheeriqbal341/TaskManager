require("dotenv").config();

const mongoose = require("mongoose");
const app = require("./app");
const Notification = require("./models/Notification");
const { startDeadlineReminderScheduler } = require("./services/deadlineReminders");

const port = Number(process.env.PORT) || 5000;
const mongoUri = process.env.MONGODB_URI;

async function startServer() {
  if (!mongoUri || mongoUri === "PASTE_YOUR_MONGODB_ATLAS_CONNECTION_STRING_HERE") {
    throw new Error(
      "MONGODB_URI is missing. Add your MongoDB Atlas connection string to backend/.env.",
    );
  }
  if (
    !process.env.JWT_SECRET ||
    process.env.JWT_SECRET.length < 32 ||
    process.env.JWT_SECRET.startsWith("replace-with-")
  ) {
    throw new Error("JWT_SECRET must be set to a random secret of at least 32 characters.");
  }

  await mongoose.connect(mongoUri, { dbName: "user" });
  await Notification.init();
  mongoose.connection.on("error", (error) => {
    console.error(`MongoDB connection error: ${error.message}`);
  });

  app.listen(port, "0.0.0.0", () => {
    console.log(`MiniTask Pro API listening on port ${port}`);
    console.log('Connected to MongoDB database "user".');
    if (process.env.VERCEL !== "1") {
      startDeadlineReminderScheduler();
    }
  });
}

startServer().catch((error) => {
  console.error(`Unable to start MiniTask Pro: ${error.message}`);
  process.exitCode = 1;
});
