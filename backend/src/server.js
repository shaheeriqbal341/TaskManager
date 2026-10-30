require("dotenv").config();

const app = require("./app");
const { connectToDatabase } = require("./config/database");
const { startDeadlineReminderScheduler } = require("./services/deadlineReminders");

const port = Number(process.env.PORT) || 5000;

async function startServer() {
  if (
    !process.env.JWT_SECRET ||
    process.env.JWT_SECRET.length < 32 ||
    process.env.JWT_SECRET.startsWith("replace-with-")
  ) {
    throw new Error("JWT_SECRET must be set to a random secret of at least 32 characters.");
  }

  await connectToDatabase();

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
