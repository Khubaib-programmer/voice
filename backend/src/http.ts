import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { config } from "./config.js";

export const asyncRoute = (handler: (req: any, res: any) => Promise<unknown>): RequestHandler =>
  (req, res, next) => { void handler(req, res).catch(next); };

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ZodError) {
    res.status(400).json({ error: "Invalid request", details: error.issues.map((issue) => issue.message) });
    return;
  }
  const multerCode = (error as { code?: string }).code;
  const status = multerCode === "LIMIT_FILE_SIZE" ? 413 : Number((error as { status?: number }).status) || 500;
  if (multerCode === "LIMIT_FILE_SIZE") {
    res.status(status).json({ error: "Recording is too large. Keep recordings under 10 MiB." });
    return;
  }
  if (!Number((error as { status?: number }).status)) {
    const name = error instanceof Error ? error.name : "UnknownError";
    const detail = (error instanceof Error ? error.message : "Non-error value was thrown")
      .replace(/(password|token|secret|authorization)(?:[=:\s]+)[^\s,;]+/gi, "$1=[redacted]")
      .replace(/(postgres(?:ql)?:\/\/[^:\s/]+:)[^@\s]+@/gi, "$1[redacted]@");
    console.error(`[api] unhandled request error: ${name}: ${detail}`);
  }
  const message = Number((error as { status?: number }).status)
    ? (error as Error).message
    : config.NODE_ENV === "development"
      ? "An unexpected server error occurred. Check the backend terminal for its diagnostic, then retry."
      : "The request could not be completed.";
  res.status(status).json({ error: message });
};

export function httpError(status: number, message: string) {
  return Object.assign(new Error(message), { status });
}
