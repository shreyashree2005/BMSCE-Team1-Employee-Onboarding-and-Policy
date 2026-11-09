import { describe, expect, it, vi } from "vitest";
import { ApiError, apiRequest, UNAUTHORIZED_EVENT } from "../src/services/apiClient";
import { mockApi } from "./helpers";

describe("apiRequest", () => {
  it("sends the session cookie and the request verification header", async () => {
    const { requests } = mockApi({ "PATCH /api/v1/onboarding/tasks/t1": () => ({ body: { ok: true } }) });

    await apiRequest("/api/v1/onboarding/tasks/t1", { method: "PATCH", body: JSON.stringify({ status: "completed" }) });

    expect(requests[0].credentials).toBe("include");
    expect(requests[0].headers["x-requested-with"]).toBe("OnboardIQ");
    expect(requests[0].headers["content-type"]).toBe("application/json");
    expect(requests[0].body).toEqual({ status: "completed" });
  });

  it("never puts a token in headers or storage", async () => {
    const { requests } = mockApi({ "GET /api/v1/auth/me": () => ({ body: {} }) });
    await apiRequest("/api/v1/auth/me");
    expect(requests[0].headers.authorization).toBeUndefined();
    expect(window.localStorage.length).toBe(0);
  });

  it("announces 401 responses so the app can return to sign-in", async () => {
    mockApi({ "GET /api/v1/onboarding/tasks": () => ({ status: 401, body: { detail: "Your session has expired" } }) });
    const listener = vi.fn();
    window.addEventListener(UNAUTHORIZED_EVENT, listener);

    await expect(apiRequest("/api/v1/onboarding/tasks")).rejects.toMatchObject({ status: 401, message: "Your session has expired" });
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener(UNAUTHORIZED_EVENT, listener);
  });

  it("can skip the 401 announcement (sign-in handles its own errors)", async () => {
    mockApi({ "POST /api/v1/auth/login": () => ({ status: 401, body: { detail: "Incorrect email or password." } }) });
    const listener = vi.fn();
    window.addEventListener(UNAUTHORIZED_EVENT, listener);

    await expect(apiRequest("/api/v1/auth/login", { method: "POST" }, { skipUnauthorizedEvent: true })).rejects.toBeInstanceOf(ApiError);
    expect(listener).not.toHaveBeenCalled();
    window.removeEventListener(UNAUTHORIZED_EVENT, listener);
  });

  it("surfaces 403 details and backend error codes", async () => {
    mockApi({ "POST /api/v1/policies/documents": () => ({ status: 403, body: { detail: "You don't have permission to perform this action." } }) });
    await expect(apiRequest("/api/v1/policies/documents", { method: "POST" })).rejects.toMatchObject({
      status: 403,
      message: "You don't have permission to perform this action.",
    });
  });

  it("reports an unreachable server clearly", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(apiRequest("/health")).rejects.toMatchObject({ status: null, message: expect.stringContaining("Can't reach the OnboardIQ server") });
  });

  it("returns undefined for 204 responses", async () => {
    mockApi({ "POST /api/v1/auth/logout": () => ({ status: 204 }) });
    await expect(apiRequest("/api/v1/auth/logout", { method: "POST" })).resolves.toBeUndefined();
  });
});
