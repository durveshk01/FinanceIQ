import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { db, StoreError } from "./database";
import { authRouter } from "./routes/auth";
import { devicesRouter } from "./routes/devices";
import { syncRouter } from "./routes/sync";

dotenv.config();
const app = express();
const PORT = process.env.PORT || 4000;
const production = process.env.NODE_ENV === "production";
const origins = (process.env.ALLOW_CORS_ORIGIN || (production ? "" : "*"))
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
if (production && (!origins.length || origins.includes("*")))
  throw new Error(
    "Production requires an explicit ALLOW_CORS_ORIGIN allowlist.",
  );
const proxyHops = Number(process.env.TRUST_PROXY_HOPS || "0");
if (!Number.isInteger(proxyHops) || proxyHops < 0 || proxyHops > 3)
  throw new Error("TRUST_PROXY_HOPS must be an integer from 0 to 3.");
app.set("trust proxy", proxyHops || false);
app.disable("x-powered-by");
app.use((_req, res, next) => {
  res.set({
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
  });
  next();
});
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || origins.includes("*") || origins.includes(origin))
        return callback(null, true);
      callback(
        new StoreError(
          "This origin is not allowed to access the backend.",
          403,
        ),
      );
    },
    methods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    maxAge: 600,
  }),
);

// Per-instance protection. A multi-instance deployment needs a shared limiter.
const requests = new Map<string, { count: number; expires: number }>();
app.use("/api", (req, res, next) => {
  const now = Date.now();
  for (const [key, bucket] of requests)
    if (bucket.expires <= now) requests.delete(key);
  const auth =
    req.method === "POST" &&
    ["/auth/register", "/auth/login"].includes(req.path);
  const key = `${auth ? "auth" : "api"}:${req.ip ?? "unknown"}`;
  const bucket = requests.get(key) ?? { count: 0, expires: now + 60000 };
  if (
    bucket.count >= (auth ? 20 : 120) ||
    (!requests.has(key) && requests.size >= 10000)
  ) {
    res.set(
      "Retry-After",
      String(Math.max(1, Math.ceil((bucket.expires - now) / 1000))),
    );
    return res
      .status(429)
      .json({ error: "Too many requests. Try again in a minute." });
  }
  bucket.count++;
  requests.set(key, bucket);
  if (req.method === "POST" && !req.is("application/json"))
    return res
      .status(415)
      .json({ error: "Use application/json for API requests." });
  next();
});
app.use("/api/auth", express.json({ limit: "16kb" }));
app.use(express.json({ limit: "10mb" }));

app.get("/health", (_req, res) => {
  try {
    db.verifyStorage();
    res.json({
      status: "ok",
      service: "FinanceIQ Cloud Backend",
      storage: db.storageMode,
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
    });
  } catch {
    res
      .status(503)
      .json({ status: "unavailable", error: "Cloud storage is not ready." });
  }
});
app.use("/api/auth", authRouter);
app.use("/api/devices", devicesRouter);
app.use("/api/sync", syncRouter);
app.use((_req, res) => {
  res.status(404).json({ error: "Endpoint not found." });
});
app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    if (res.headersSent) return next(err);
    const candidate =
      typeof err === "object" && err !== null && "status" in err
        ? err.status
        : 500;
    const status =
      typeof candidate === "number" && candidate >= 400 && candidate <= 599
        ? candidate
        : 500;
    if (status >= 500)
      console.error(
        "Backend request failed:",
        err instanceof StoreError ? "storage unavailable" : "internal error",
      );
    res.status(status).json({
      error:
        err instanceof StoreError
          ? err.message
          : status === 413
            ? "Request exceeds the endpoint size limit."
            : status === 400
              ? "Invalid JSON request."
              : "Internal server error.",
    });
  },
);
if (process.env.NODE_ENV !== "test") {
  db.verifyStorage();
  const server = app.listen(PORT, () => {
    console.log(`FinanceIQ Cloud Backend running on port ${PORT}`);
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 15000;
}
export default app;
