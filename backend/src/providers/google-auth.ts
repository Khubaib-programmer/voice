import { GoogleAuth } from "google-auth-library";
import { config } from "../config.js";
import { httpError } from "../http.js";

const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });

export async function googleAuthorizationHeaders(): Promise<Record<string, string>> {
  try {
    const client = await auth.getClient();
    const token = await client.getAccessToken();
    if (!token) throw new Error("No OAuth access token was returned");
    return {
      Authorization: `Bearer ${token}`,
      ...(config.GOOGLE_CLOUD_PROJECT
        ? { "x-goog-user-project": config.GOOGLE_CLOUD_PROJECT }
        : {}),
    };
  } catch {
    throw httpError(
      503,
      "Google Cloud credentials are unavailable. Configure Application Default Credentials for the backend.",
    );
  }
}
