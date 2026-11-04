import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api-client";
import { clearPrivateQueries } from "@/lib/query-client";
import { retryUnlessClientError } from "@/lib/query-retry";

describe("retryUnlessClientError", () => {
  it("never retries client errors, including 429", () => {
    expect(retryUnlessClientError(0, new ApiError(404, "Not found"))).toBe(false);
    expect(retryUnlessClientError(0, new ApiError(429, "Too many requests", [], "TOO_MANY_REQUESTS"))).toBe(false);
  });

  it("never retries a timeout or a malformed answer", () => {
    expect(retryUnlessClientError(0, new ApiError(0, "No answer", [], null, null, "timeout"))).toBe(false);
    expect(retryUnlessClientError(0, new ApiError(200, "Unexpected", [], "INVALID_RESPONSE", null, "invalid-response"))).toBe(false);
  });

  it("retries a server or network failure once", () => {
    expect(retryUnlessClientError(0, new ApiError(502, "Bad gateway"))).toBe(true);
    expect(retryUnlessClientError(0, new ApiError(0, "Unreachable"))).toBe(true);
    expect(retryUnlessClientError(1, new ApiError(502, "Bad gateway"))).toBe(false);
  });
});

describe("clearPrivateQueries", () => {
  it("drops private queries and every mutation (their variables may hold secrets), keeping the session", async () => {
    const client = new QueryClient();
    client.setQueryData(["auth", "me"], { id: "u1" });
    client.setQueryData(["azure", "c1", "projects"], []);
    await client
      .getMutationCache()
      .build(client, { mutationFn: async (_token: string) => "ok" })
      .execute("secret-token");
    expect(client.getMutationCache().getAll()).toHaveLength(1);

    clearPrivateQueries(client);

    expect(client.getMutationCache().getAll()).toHaveLength(0);
    expect(client.getQueryData(["azure", "c1", "projects"])).toBeUndefined();
    expect(client.getQueryData(["auth", "me"])).toEqual({ id: "u1" });
  });
});
