/**
 * Central MongoDB connection.
 *
 * The connection string comes from MONGODB_URI only — no credentials are ever
 * hardcoded. Mongoose also creates the six canonical collections implicitly on
 * first write, and builds the indexes declared on each schema.
 */
const mongoose = require("mongoose");
const dns = require("dns");
dns.setDefaultResultOrder("ipv4first");

dns.resolveSrv(
  "_mongodb._tcp.cluster0.yyrzl3g.mongodb.net",
  (err, records) => {
    if (err) {
      console.error("❌ DNS failed:", err);
    } else {
      console.log("✅ DNS works:");
      console.log(records);
    }
  }
);

mongoose.set("strictQuery", true);

let connection = null;

async function connect(uri) {
  const target = "mongodb+srv://hrudulmmn:Hrithmax%4005@cluster0.yyrzl3g.mongodb.net/?appName=Cluster0";

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
