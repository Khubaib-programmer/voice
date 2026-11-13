export type MlWarmupState = "starting" | "ready" | "unavailable";

const retryDelays = [3_000, 5_000, 8_000, 13_000, 20_000];

export function watchMlWarmup(
  request: (signal: AbortSignal) => Promise<{ state: MlWarmupState }>,
  onState: (state: MlWarmupState) => void,
) {
  const controller = new AbortController();
  const pageDocument = typeof document === "undefined" ? undefined : document;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  let attempts = 0;

  const poll = async () => {
    if (stopped || pageDocument?.visibilityState === "hidden") return;
    try {
      const result = await request(controller.signal);
      if (stopped) return;
      onState(result.state);
      if (result.state === "ready") return;
    } catch {
      if (stopped) return;
      onState("unavailable");
    }
    const delay = retryDelays[Math.min(attempts, retryDelays.length - 1)];
    attempts += 1;
    timer = setTimeout(() => { void poll(); }, delay);
  };

  const onVisibilityChange = () => {
    if (pageDocument?.visibilityState === "hidden") {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = undefined;
      controller.abort();
    }
  };
  pageDocument?.addEventListener("visibilitychange", onVisibilityChange);
  void poll();

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    controller.abort();
    pageDocument?.removeEventListener("visibilitychange", onVisibilityChange);
  };
}

export function mlWarmupMessage(state: MlWarmupState) {
  if (state === "ready") return "Language detection ready.";
  if (state === "unavailable") return "Unable to connect. Retrying…";
  return "Waking up language detection model…";
}
