import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { authRouter } from "./routes/auth";
import { devicesRouter } from "./routes/devices";
import { syncRouter } from "./routes/sync";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// CORS setup
app.use(
  cors({
    origin: "*", // Allows requests from Vercel web app and Android native Capacitor app
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json({ limit: "10mb" }));

// Health check endpoint for Render monitoring
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "FinanceIQ Render Cloud Backend",
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    features: {
      auth: true,
      sync: true,
      deviceRegistration: true,
      lightweightArchitecture: true,
    },
  });
});

// Mount modular API routes
app.use("/api/auth", authRouter);
app.use("/api/devices", devicesRouter);
app.use("/api/sync", syncRouter);

// Global 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Endpoint not found." });
});

// Global error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("Internal Server Error:", err);
  res.status(500).json({ error: "Internal server error." });
});

if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => {
    console.log(`FinanceIQ Render Cloud Backend running on port ${PORT}`);
  });
}

export default app;
