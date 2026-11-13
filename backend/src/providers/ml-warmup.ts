import { config } from "../config.js";

export type MlWarmupState = "starting" | "ready" | "unavailable";

const RETRY_COOLDOWN_MS = 15_000;
const HEALTH_TIMEOUT_MS = 120_000;

let state: MlWarmupState = "starting";
let lastAttemptAt: number | undefined;
let inFlight: Promise<void> | undefined;

async function checkHealth() {
  try {
    const response = await fetch(new URL("/health", config.ML_SERVICE_URL), {
      method: "GET",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    });
    const result: unknown = await response.json();
    const health = result && typeof result === "object" ? result as Record<string, unknown> : {};
    state = response.ok && health.status === "ok" && health.model_loaded === true ? "ready" : "unavailable";
  } catch {
    // Health response details and internal errors are intentionally not returned or logged.
    state = "unavailable";
  }
}

export function getMlWarmupState(): MlWarmupState {
  const now = Date.now();
  if (state !== "ready" && !inFlight && (lastAttemptAt === undefined || now - lastAttemptAt >= RETRY_COOLDOWN_MS)) {
    lastAttemptAt = now;
    state = "starting";
    inFlight = checkHealth().finally(() => { inFlight = undefined; });
  }
  return state;
}
