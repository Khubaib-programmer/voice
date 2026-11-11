import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default(""),
  PORT: z.coerce.number().int().positive().default(4000),
  FRONTEND_ORIGIN: z.string().url().default("http://localhost:5173"),
  DATABASE_URL: z.string().min(1),
  COOKIE_SECRET: z.string().min(32),
  ML_SERVICE_URL: z.string().url().default("http://127.0.0.1:8000"),
  GOOGLE_CLOUD_PROJECT: z.string().optional().default(""),
  GOOGLE_APPLICATION_CREDENTIALS: z.string().optional().default(""),
  MAX_AUDIO_BYTES: z.coerce.number().int().positive().default(10 * 1024 * 1024),
});

export const config = schema.parse(process.env);
