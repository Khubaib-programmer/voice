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
import mlStatusRoutes from "./routes/ml-status.js";

const allowedOrigins = new Set([
  config.FRONTEND_ORIGIN,
  ...(config.NODE_ENV !== "production"
    ? ["http://localhost:5173", "http://127.0.0.1:5173"]
    : []),
]);

export const app = express();
app.disable("x-powered-by");
if (config.NODE_ENV === "production") app.set("trust proxy", 1);
app.use(helmet());
app.use(cors({ origin: Array.from(allowedOrigins), credentials: true }));
app.use((req, res, next) => {
  const origin = req.get("origin");
  if (origin && !allowedOrigins.has(origin) && !["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    res.status(403).json({ error: "Request origin is not allowed." });
    return;
  }
  next();
});
app.use(express.json({ limit: "64kb" }));
app.use(cookieParser());
app.use("/api/auth", rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false }), authRoutes);
app.use("/api/ml", mlStatusRoutes);
app.use("/api", translationRoutes);
app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "voice-translator-api",
  });
});

app.use((_req, res) => res.status(404).json({ error: "Route not found." }));
app.use(errorHandler);
