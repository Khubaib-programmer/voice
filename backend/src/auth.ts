import { SignJWT, jwtVerify } from "jose";
import type { RequestHandler } from "express";
import { config } from "./config.js";
import { httpError } from "./http.js";

const secret = new TextEncoder().encode(config.COOKIE_SECRET);
export const COOKIE_NAME = "voice_session";

export async function signSession(userId: string) {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret);
}

export async function readSession(token?: string) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

export const requireUser: RequestHandler = async (req, res, next) => {
  const userId = await readSession(req.cookies?.[COOKIE_NAME]);
  if (!userId) return next(httpError(401, "Please sign in to continue."));
  res.locals.userId = userId;
  next();
};

export function sessionCookie() {
  return {
    httpOnly: true,
    secure: config.NODE_ENV === "production",
    sameSite: config.NODE_ENV === "production" ? "none" as const : "lax" as const,
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}
