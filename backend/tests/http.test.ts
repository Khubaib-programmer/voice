import { describe, expect, it, vi } from "vitest";
import { errorHandler, httpError } from "../src/http.js";

function responseDouble() {
  const response = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
  };
  return response;
}

describe("HTTP error responses", () => {
  it("keeps actionable dependency errors visible to clients", () => {
    const response = responseDouble();
    errorHandler(httpError(503, "Provider is not configured."), {} as never, response as never, vi.fn());
    expect(response.statusCode).toBe(503);
    expect(response.body).toEqual({ error: "Provider is not configured." });
  });

  it("hides internal errors", () => {
    const response = responseDouble();
    errorHandler(new Error("database password and private detail"), {} as never, response as never, vi.fn());
    expect(response.statusCode).toBe(500);
    expect(response.body).toEqual({ error: "The request could not be completed." });
  });
});
