const API_URL = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:4000";

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      credentials: "include",
      headers: init.body instanceof FormData
        ? init.headers
        : { "content-type": "application/json", ...init.headers },
    });
  } catch {
    throw new Error("Could not connect to Vaani’s API. Check that Express is running and try again.");
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error ?? `Request failed (${response.status})`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function submitAudioRecording<T>(blob: Blob): Promise<T> {
  const mimeType = blob.type.split(";", 1)[0].trim().toLowerCase();
  if (!blob.size) return Promise.reject(new Error("The recording is empty. Record a short message and try again."));
  if (mimeType !== "audio/webm" && mimeType !== "audio/ogg") {
    return Promise.reject(new Error("This recording format is not supported. Record using WebM/Opus or Ogg/Opus."));
  }
  const extension = mimeType === "audio/ogg" ? "ogg" : "webm";
  const form = new FormData();
  form.append("audio", blob, `recording.${extension}`);
  return api<T>("/api/transcribe", { method: "POST", body: form });
}
