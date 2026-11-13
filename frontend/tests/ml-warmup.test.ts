import { afterEach, describe, expect, it, vi } from "vitest";
import { mlWarmupMessage, watchMlWarmup, type MlWarmupState } from "../src/lib/ml-warmup";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("automatic ML warm-up polling", () => {
  it("starts immediately, avoids overlapping requests, backs off, then stops when ready", async () => {
    vi.useFakeTimers();
    const request = vi.fn<(_signal: AbortSignal) => Promise<{ state: MlWarmupState }>>()
      .mockResolvedValueOnce({ state: "starting" })
      .mockResolvedValueOnce({ state: "ready" });
    const onState = vi.fn();
    const stop = watchMlWarmup(request, onState);
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    expect(onState).toHaveBeenLastCalledWith("starting");
    await vi.advanceTimersByTimeAsync(3_000);
    expect(request).toHaveBeenCalledTimes(2);
    expect(onState).toHaveBeenLastCalledWith("ready");
    await vi.advanceTimersByTimeAsync(50_000);
    expect(request).toHaveBeenCalledTimes(2);
    stop();
  });

  it("reports network errors as unavailable and retries with a capped delay", async () => {
    vi.useFakeTimers();
    const request = vi.fn<(_signal: AbortSignal) => Promise<{ state: MlWarmupState }>>()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValue({ state: "starting" });
    const onState = vi.fn();
    const stop = watchMlWarmup(request, onState);
    await vi.waitFor(() => expect(onState).toHaveBeenCalledWith("unavailable"));
    expect(mlWarmupMessage("unavailable")).toBe("Unable to connect. Retrying…");
    await vi.advanceTimersByTimeAsync(3_000);
    expect(request).toHaveBeenCalledTimes(2);
    stop();
  });

  it("aborts the pending request and stops polling when disposed", async () => {
    vi.useFakeTimers();
    let signal!: AbortSignal;
    const request = vi.fn((_signal: AbortSignal) => {
      signal = _signal;
      return new Promise<{ state: MlWarmupState }>(() => undefined);
    });
    const stop = watchMlWarmup(request, vi.fn());
    expect(request).toHaveBeenCalledTimes(1);
    stop();
    expect(signal.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(50_000);
    expect(request).toHaveBeenCalledTimes(1);
  });
});
