/**
 * Server entry point.
 * Connects to MongoDB first, then starts listening.
 */
require("dotenv").config();

const app = require("./app");
const db = require("./config/db");
const { assertCollectionNames } = require("./models");

const PORT = Number(process.env.PORT) || 4000;

async function start() {
  try {
    assertCollectionNames();
    await db.connect();
  } catch (err) {
    console.error("\n[boot] Failed to start:\n  " + err.message + "\n");
    process.exit(1);
  }

  const server = app.listen(PORT, () => {
    console.log(`[server] Lumen API + frontend on http://localhost:${PORT}`);
  });

  const shutdown = async (signal) => {
    console.log(`\n[server] ${signal} received, shutting down`);
    server.close(async () => {
      await db.disconnect();
      process.exit(0);
    });
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

start();
