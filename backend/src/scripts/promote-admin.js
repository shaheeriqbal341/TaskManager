require("dotenv").config();

const mongoose = require("mongoose");
const User = require("../models/User");

async function promoteAdmin() {
  const emailArgument = process.argv.find((argument) => argument.startsWith("--email="));
  const email = emailArgument?.slice("--email=".length).trim().toLowerCase();
  if (!email || !process.argv.includes("--confirm")) {
    throw new Error(
      'Usage: npm run promote-admin -- --email="employee@example.com" --confirm',
    );
  }
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is required in the backend environment.");
  }

  await mongoose.connect(process.env.MONGODB_URI, { dbName: "user" });
  const user = await User.findOneAndUpdate(
    { email, role: { $ne: "admin" } },
    { $set: { role: "admin", isActive: true } },
    { new: true, runValidators: true },
  );
  if (!user) {
    const existing = await User.findOne({ email }).select("role");
    if (!existing) throw new Error("No account exists for that email. Create it through public signup first.");
    if (existing.role === "admin") {
      console.log("That account is already an admin.");
      return;
    }
    throw new Error("The account could not be promoted.");
  }
  console.log(`Promoted ${user.email} to admin. The account now has admin access.`);
}

promoteAdmin()
  .catch((error) => {
    console.error(`Admin setup failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  });
