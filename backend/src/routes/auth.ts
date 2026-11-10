import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { COOKIE_NAME, requireUser, sessionCookie, signSession } from "../auth.js";
import { prisma } from "../db.js";
import { asyncRoute, httpError } from "../http.js";

const router = Router();
const credentials = z.object({
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(10).max(72).refine((value) => Buffer.byteLength(value, "utf8") <= 72, "Password must be at most 72 UTF-8 bytes."),
});

router.post("/signup", asyncRoute(async (req, res) => {
  const { email, password } = credentials.parse(req.body);
  const passwordHash = await bcrypt.hash(password, 12);
  let user;
  try {
    user = await prisma.user.create({ data: { email, passwordHash }, select: { id: true, email: true } });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") throw httpError(409, "An account with this email already exists.");
    throw error;
  }
  res.cookie(COOKIE_NAME, await signSession(user.id), sessionCookie());
  res.status(201).json({ user });
}));

router.post("/login", asyncRoute(async (req, res) => {
  const { email, password } = credentials.parse(req.body);
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) throw httpError(401, "Email or password is incorrect.");
  res.cookie(COOKIE_NAME, await signSession(user.id), sessionCookie());
  res.json({ user: { id: user.id, email: user.email } });
}));

router.post("/logout", (_req, res) => {
  res.clearCookie(COOKIE_NAME, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/" });
  res.status(204).end();
});

router.get("/me", requireUser, asyncRoute(async (_req, res) => {
  const user = await prisma.user.findUnique({ where: { id: res.locals.userId }, select: { id: true, email: true } });
  if (!user) throw httpError(401, "This account is no longer available.");
  res.json({ user });
}));

export default router;
