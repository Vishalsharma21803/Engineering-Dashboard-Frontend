import { afterEach, describe, expect, it, vi } from "vitest";

import { proposeAction } from "@/features/azure-devops/api/action.api";
import { enqueueAiChecks, runSopReport, testRulesOnTicket } from "@/features/sop/api/sop.api";
import { getAccuracy, getVerification } from "@/features/solidtime/api/solidtime.api";
import { ApiError, apiDownload, apiRequest, bumpSessionEpoch, UNAUTHORIZED_EVENT } from "@/lib/api-client";

/** A fetch that answers only when told to, and (like the real one) rejects once its signal aborts. */
function pendingFetch() {
  const answers: Array<(response: Response) => void> = [];
  const fetchMock = vi.fn(
    (_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((resolve, reject) => {
        answers.push(resolve);
        init?.signal?.addEventListener("abort", () => reject(new DOMException("The operation was aborted.", "AbortError")));
      })
  );
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, answer: (response: Response) => answers.shift()?.(response) };
}

function stubResponse(body: BodyInit | null, init: ResponseInit & { contentType?: string } = {}) {
  const headers = init.contentType ? { "content-type": init.contentType } : undefined;
  vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status: init.status ?? 200, statusText: init.statusText, headers })));
}

afterEach(() => {
  vi.useRealTimers();
});

describe("apiRequest timeouts", () => {
  it("gives up after the GET budget with a timeout error", async () => {
    vi.useFakeTimers();
    pendingFetch();
    const request = apiRequest("/api/slow");
    const outcome = expect(request).rejects.toMatchObject({ kind: "timeout", status: 0, message: expect.stringContaining("30 s") });
    await vi.advanceTimersByTimeAsync(30_000);
    await outcome;
  });

  it("uses a per-call budget and message", async () => {
    vi.useFakeTimers();
    pendingFetch();
    const request = apiRequest("/api/approve", { method: "POST", body: {}, timeoutMs: 600_000, timeoutMessage: "May still have run." });
    const outcome = expect(request).rejects.toMatchObject({ kind: "timeout", message: "May still have run." });
    await vi.advanceTimersByTimeAsync(599_999);
    await vi.advanceTimersByTimeAsync(1);
    await outcome;
  });

  it("gives writes 60 s by default", async () => {
    vi.useFakeTimers();
    const { answer } = pendingFetch();
    const request = apiRequest<{ ok: boolean }>("/api/save", { method: "PUT", body: {} });
    await vi.advanceTimersByTimeAsync(45_000);
    answer(new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json" } }));
    await expect(request).resolves.toEqual({ ok: true });
  });

  it("rethrows a caller's abort untouched, so it counts as a cancellation", async () => {
    pendingFetch();
    const controller = new AbortController();
    const request = apiRequest("/api/list", { signal: controller.signal });
    controller.abort();
    const error = await request.catch((caught: unknown) => caught);
    expect(error).not.toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ name: "AbortError" });
  });

  it("reports an unreachable server as a network error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))));
    await expect(apiRequest("/api/list")).rejects.toMatchObject({ kind: "network", status: 0 });
  });

  it("reports a connection lost while reading the answer as a network error", async () => {
    const broken = (status: number) =>
      new Response(new ReadableStream({ start: (controller) => controller.error(new TypeError("network error")) }), { status, headers: { "content-type": "application/json" } });
    vi.stubGlobal("fetch", vi.fn(async () => broken(200)));
    await expect(apiRequest("/api/list")).rejects.toMatchObject({ kind: "network", status: 0 });
    vi.stubGlobal("fetch", vi.fn(async () => broken(500)));
    await expect(apiRequest("/api/list")).rejects.toMatchObject({ kind: "network", status: 0 });
    vi.stubGlobal("fetch", vi.fn(async () => broken(200)));
    await expect(apiDownload("/api/file.csv")).rejects.toMatchObject({ kind: "network", status: 0 });
  });

  it("says a timed-out run, AI check, ticket test or proposal may still be running", async () => {
    vi.useFakeTimers();
    pendingFetch();
    const calls: Array<[Promise<unknown>, number]> = [
      [runSopReport("c", "p"), 150],
      [enqueueAiChecks("c", [1]), 150],
      [testRulesOnTicket("c", { projectId: "p", workItemId: 1 }), 150],
      [proposeAction({ credentialId: "c", kind: "WORK_ITEM_COMMENT", target: { workItemId: 1 }, params: { text: "Hi" } }), 60],
    ];
    const outcomes = calls.map(([request, seconds]) =>
      expect(request).rejects.toMatchObject({ kind: "timeout", message: `The server did not answer in ${seconds} s. It may still be running — check before trying again.` })
    );
    await vi.advanceTimersByTimeAsync(150_000);
    await Promise.all(outcomes);
  });

  it("gives verification and accuracy reads 150 s", async () => {
    vi.useFakeTimers();
    const { answer } = pendingFetch();
    const verification = getVerification("c", { from: "2026-10-01", to: "2026-10-31" });
    const accuracy = getAccuracy("c", { from: "2026-10-01", to: "2026-10-31", personPage: 1, typePage: 1, ticketPage: 1 });
    await vi.advanceTimersByTimeAsync(140_000);
    answer(new Response(JSON.stringify({ verification: { ok: true } }), { headers: { "content-type": "application/json" } }));
    await expect(verification).resolves.toEqual({ ok: true });
    const outcome = expect(accuracy).rejects.toMatchObject({ kind: "timeout", message: expect.stringContaining("150 s") });
    await vi.advanceTimersByTimeAsync(10_000);
    await outcome;
  });
});

describe("apiRequest response contract", () => {
  it("rejects a 2xx that is not JSON (an SPA fallback or proxy page)", async () => {
    stubResponse("<!doctype html><html></html>", { contentType: "text/html" });
    await expect(apiRequest("/api/list")).rejects.toMatchObject({ kind: "invalid-response", status: 200, reason: "INVALID_RESPONSE", message: expect.stringContaining("HTTP 200, text/html") });
  });

  it("rejects a 2xx with malformed JSON", async () => {
    stubResponse('{"items": [', { contentType: "application/json" });
    await expect(apiRequest("/api/list")).rejects.toMatchObject({ kind: "invalid-response" });
  });

  it("accepts an empty 2xx body as undefined", async () => {
    stubResponse(null, { status: 200, contentType: "application/json" });
    await expect(apiRequest("/api/thing", { method: "POST" })).resolves.toBeUndefined();
    stubResponse(null, { status: 204 });
    await expect(apiRequest("/api/thing", { method: "DELETE" })).resolves.toBeUndefined();
  });

  it("keeps the status in the message when an error page is not JSON", async () => {
    stubResponse("<html>Bad gateway</html>", { status: 502, statusText: "Bad Gateway", contentType: "text/html" });
    await expect(apiRequest("/api/list")).rejects.toMatchObject({ status: 502, kind: "http", message: "Bad Gateway (HTTP 502)" });
  });

  it("uses the server's message, reason and field errors", async () => {
    stubResponse(JSON.stringify({ message: "Sign-up is by invitation only.", reason: "SIGNUP_NOT_ALLOWED", errors: [{ field: "email", message: "Not invited" }] }), {
      status: 403,
      contentType: "application/json",
    });
    await expect(apiRequest("/api/auth/register", { method: "POST", body: {} })).rejects.toMatchObject({
      status: 403,
      reason: "SIGNUP_NOT_ALLOWED",
      message: "Sign-up is by invitation only.",
      errors: [{ field: "email", message: "Not invited" }],
    });
  });
});

describe("401 handling", () => {
  it("signs out on a 401 from the current session", async () => {
    const listener = vi.fn();
    window.addEventListener(UNAUTHORIZED_EVENT, listener);
    stubResponse(JSON.stringify({ message: "Not signed in" }), { status: 401, contentType: "application/json" });
    await expect(apiRequest("/api/credentials")).rejects.toMatchObject({ status: 401 });
    window.removeEventListener(UNAUTHORIZED_EVENT, listener);
    expect(listener).toHaveBeenCalledOnce();
  });

  it("ignores a 401 for a request that started before the session changed", async () => {
    const listener = vi.fn();
    window.addEventListener(UNAUTHORIZED_EVENT, listener);
    const { answer } = pendingFetch();
    const request = apiRequest("/api/credentials");
    // The user signed in again while the old request was on its way.
    bumpSessionEpoch();
    answer(new Response(JSON.stringify({ message: "Not signed in" }), { status: 401, headers: { "content-type": "application/json" } }));
    await expect(request).rejects.toMatchObject({ status: 401 });
    window.removeEventListener(UNAUTHORIZED_EVENT, listener);
    expect(listener).not.toHaveBeenCalled();
  });
});
