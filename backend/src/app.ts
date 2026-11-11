import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { config } from "./config.js";
import { prisma } from "./db.js";
import { errorHandler } from "./http.js";
import authRoutes from "./routes/auth.js";
import translationRoutes from "./routes/translations.js";

export const app = express();
app.disable("x-powered-by");
if (config.NODE_ENV === "production") app.set("trust proxy", 1);
app.use(helmet());
app.use(cors({ origin: config.FRONTEND_ORIGIN, credentials: true }));
app.use((req, res, next) => {
  const origin = req.get("origin");
  if (origin && origin !== config.FRONTEND_ORIGIN && !["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    res.status(403).json({ error: "Request origin is not allowed." });
    return;
  }
  next();
});
app.use(express.json({ limit: "64kb" }));
app.use(cookieParser());
app.use("/api/auth", rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false }), authRoutes);
app.use("/api", translationRoutes);
app.get("/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    const mlResponse = await fetch(`${config.ML_SERVICE_URL}/health`, { signal: AbortSignal.timeout(3_000) });
    const mlHealth = await mlResponse.json().catch(() => ({})) as { model_loaded?: boolean };
    if (!mlResponse.ok || mlHealth.model_loaded !== true) throw new Error("ML model is not ready");
    res.json({ status: "ok", service: "voice-translator-api", database: "ok", ml: "ok" });
  } catch {
    res.status(503).json({ status: "unavailable", service: "voice-translator-api" });
  }
});
app.use((_req, res) => res.status(404).json({ error: "Route not found." }));
app.use(errorHandler);
