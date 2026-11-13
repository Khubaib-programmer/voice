import { Router } from "express";
import rateLimit from "express-rate-limit";
import { getMlWarmupState } from "../providers/ml-warmup.js";

const router = Router();
router.use(rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: true, legacyHeaders: false }));

router.get("/status", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({ state: getMlWarmupState() });
});

export default router;
