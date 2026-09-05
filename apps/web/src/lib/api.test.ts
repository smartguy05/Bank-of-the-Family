import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError, onUnauthorized } from "@/lib/api";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("api client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns parsed JSON on success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { user: { id: "1" } })));
    const result = await api.get<{ user: { id: string } }>("/auth/me");
    expect(result.user.id).toBe("1");
  });

  it("sends credentials and JSON body on post", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    await api.post("/families", { name: "The Smiths" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/families");
    expect(init.credentials).toBe("include");
    expect(init.body).toBe(JSON.stringify({ name: "The Smiths" }));
  });

  it("throws ApiError with status/code/message on failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(400, {
          statusCode: 400,
          error: "Bad Request",
          code: "VALIDATION",
          message: "Invalid amount",
        }),
      ),
    );
    await expect(api.post("/transactions/deposit", {})).rejects.toMatchObject({
      status: 400,
      code: "VALIDATION",
      message: "Invalid amount",
    });
  });

  it("throws an ApiError instance", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(500, { message: "Server error" })),
    );
    await expect(api.get("/accounts")).rejects.toBeInstanceOf(ApiError);
  });

  it("notifies unauthorized listeners on a 401 for a non-auth route", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(401, { message: "Unauthorized" })),
    );
    const listener = vi.fn();
    const unsubscribe = onUnauthorized(listener);
    await expect(api.get("/accounts")).rejects.toBeInstanceOf(ApiError);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("does not notify unauthorized listeners for /auth/me itself", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(401, { message: "Unauthorized" })),
    );
    const listener = vi.fn();
    const unsubscribe = onUnauthorized(listener);
    await expect(api.get("/auth/me")).rejects.toBeInstanceOf(ApiError);
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });
});
