import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";

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
    res.status(status).json({ error: "Recording is too large. Keep recordings under 12 MB." });
    return;
  }
  const message = status >= 500 ? "The request could not be completed." : (error as Error).message;
  res.status(status).json({ error: message });
};

export function httpError(status: number, message: string) {
  return Object.assign(new Error(message), { status });
}
