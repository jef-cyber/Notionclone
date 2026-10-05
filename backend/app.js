/**
 * Express app.
 *
 * Serves both the JSON API under /api and the static vanilla frontend from the
 * repository root, so one process on one port runs the whole app.
 */
const path = require("path");
const express = require("express");
const cors = require("cors");

const routes = require("./routes");
const { notFound, errorHandler } = require("./middleware/error.middleware");

const app = express();

app.set("trust proxy", 1);
app.disable("x-powered-by");

/* ---------- CORS ---------- */
const allowed = String(process.env.CORS_ORIGIN || "*")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: allowed.includes("*") ? true : allowed,
    credentials: true,
  })
);

/* ---------- body parsing ---------- */
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

/* ---------- minimal request logging ---------- */
if (String(process.env.LOG_REQUESTS).toLowerCase() === "true") {
  app.use((req, _res, next) => {
    console.log(`${req.method} ${req.originalUrl}`);
    next();
  });
}

/* ---------- API ---------- */
app.use("/api", routes);

/* ---------- static frontend ---------- */
const frontendRoot = path.join(__dirname, "..");
app.use(
  express.static(frontendRoot, {
    index: "index.html",
    extensions: ["html"],
  })
);

// Client-side routing: any non-API GET falls through to the app shell.
app.get(/^\/(?!api\/).*/, (_req, res) => {
  res.sendFile(path.join(frontendRoot, "index.html"));
});

/* ---------- errors ---------- */
app.use(notFound);
app.use(errorHandler);

module.exports = app;
