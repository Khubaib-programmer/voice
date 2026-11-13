import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

process.env.COOKIE_SECRET ??= "test-only-session-secret-with-more-than-32-characters";
process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:5432/test";

let getMlWarmupState: typeof import("../src/providers/ml-warmup.js").getMlWarmupState;

function healthResponse(status = 200, value: unknown = { status: "ok", model_loaded: true }) {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

async function settleProbe() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("ML service warm-up state", () => {
  beforeEach(async () => {
    vi.resetModules();
    ({ getMlWarmupState } = await import("../src/providers/ml-warmup.js"));
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("returns starting while the health check is in flight and deduplicates requests", async () => {
    let resolve!: (response: Response) => void;
    vi.mocked(fetch).mockReturnValueOnce(new Promise<Response>((done) => { resolve = done; }));
    expect(getMlWarmupState()).toBe("starting");
    expect(getMlWarmupState()).toBe("starting");
    expect(fetch).toHaveBeenCalledTimes(1);
    resolve(healthResponse());
    await settleProbe();
    expect(getMlWarmupState()).toBe("ready");
  });

  it("returns ready only when FastAPI reports a loaded model", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(healthResponse());
    expect(getMlWarmupState()).toBe("starting");
    await settleProbe();
    expect(getMlWarmupState()).toBe("ready");
  });

  it("marks a health-check timeout unavailable and retries after cooldown", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new DOMException("Timed out", "TimeoutError"));
    expect(getMlWarmupState()).toBe("starting");
    await settleProbe();
    expect(getMlWarmupState()).toBe("unavailable");
    expect(getMlWarmupState()).toBe("unavailable");
    expect(fetch).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(15_000);
    vi.mocked(fetch).mockResolvedValueOnce(healthResponse());
    expect(getMlWarmupState()).toBe("starting");
    await settleProbe();
    expect(getMlWarmupState()).toBe("ready");
  });

  it("returns unavailable for unhealthy or malformed health responses", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(healthResponse(503, { detail: "internal detail" }));
    expect(getMlWarmupState()).toBe("starting");
    await settleProbe();
    expect(getMlWarmupState()).toBe("unavailable");
  });
});
