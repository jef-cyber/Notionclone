/**
 * Central MongoDB connection.
 *
 * The connection string comes from MONGODB_URI only — no credentials are ever
 * hardcoded. Mongoose also creates the six canonical collections implicitly on
 * first write, and builds the indexes declared on each schema.
 */
const mongoose = require("mongoose");

mongoose.set("strictQuery", true);

let connection = null;

async function connect(uri) {
  const target = uri || process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/lumen";

  if (!target) {
    throw new Error(
      "MONGODB_URI is not set. Copy backend/.env.example to backend/.env and fill it in."
    );
  }

  mongoose.connection.on("error", (err) => {
    console.error("[db] connection error:", err.message);
  });

  mongoose.connection.on("disconnected", () => {
    console.warn("[db] disconnected");
  });

  connection = await mongoose.connect(target, {
    serverSelectionTimeoutMS: 10000,
  });

  const { name, host, port } = connection.connection;
  console.log(`[db] connected to "${name}" at ${host}:${port}`);

  // Fail fast if a model was mapped to the wrong collection.
  require("../models").assertCollectionNames();

  return connection;
}

async function disconnect() {
  if (connection) {
    await mongoose.connection.close();
    connection = null;
  }
}

function isConnected() {
  return mongoose.connection.readyState === 1;
}

module.exports = { connect, disconnect, isConnected, mongoose };
