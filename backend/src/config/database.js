const mongoose = require("mongoose");
const Notification = require("../models/Notification");

let connectionPromise;
let initializationPromise;

async function connectToDatabase() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri || mongoUri === "PASTE_YOUR_MONGODB_ATLAS_CONNECTION_STRING_HERE") {
    throw new Error("MONGODB_URI is not configured.");
  }

  if (mongoose.connection.readyState !== 1) {
    if (!connectionPromise) {
      connectionPromise = mongoose.connect(mongoUri, { dbName: "user" }).catch((error) => {
        connectionPromise = null;
        throw error;
      });
    }
    await connectionPromise;
  }

  if (!initializationPromise) {
    initializationPromise = Notification.init().catch((error) => {
      initializationPromise = null;
      throw error;
    });
  }
  await initializationPromise;
  return mongoose.connection;
}

mongoose.connection.on("disconnected", () => {
  connectionPromise = null;
  initializationPromise = null;
});

module.exports = { connectToDatabase };
